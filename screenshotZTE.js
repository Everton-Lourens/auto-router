const puppeteer = require('puppeteer-core');
const fs = require('fs');

const SAVE_DIR = '/storage/emulated/0/Download/router';

(async () => {

  if (!fs.existsSync(SAVE_DIR)) {
    fs.mkdirSync(SAVE_DIR, { recursive: true });
  }

  const browser = await puppeteer.launch({
    executablePath: '/data/data/com.termux/files/usr/lib/chromium/chrome',
    headless: true,
    args: [
      '--headless=new',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
      '--disable-software-rasterizer',
      '--disable-extensions',
      '--disable-background-networking'
    ]
  });

  const page = await browser.newPage();

  await page.setViewport({
    width: 1280,
    height: 720
  });

  await loginPage();
  await wanPage();
  await securityPage();

  await redeLocalPage();
  
  await browser.close();

  
  

async function screenshot(name) {

    const path = `${SAVE_DIR}/${name}`;

    console.log(`Screenshot: ${path}`);

    await page.screenshot({
      path,
      fullPage: true
    });
  }
  

  async function wait(time) {
    await new Promise(resolve => setTimeout(resolve, time));
  }


  
async function setCollapsibleBarStateByText(page, barText, shouldOpen) {
  console.log(`Ajustando ${barText} para ${shouldOpen ? 'aberto' : 'fechado'}...`);

  const bars = await page.$$('h1.collapBarWithDataTrans, h1.collapsibleBarExp');

  let target = null;
  for (const bar of bars) {
    const text = await bar.evaluate(node =>
      (node.textContent || '').replace(/\s+/g, ' ').trim()
    );
    if (text === barText) {
      target = bar;
      break;
    }
  }

  if (!target) {
    console.log(`${barText} não encontrado.`);
    return false;
  }

  const isOpen = await target.evaluate(node =>
    node.classList.contains('collapsibleBarExp')
  );

  if (isOpen === shouldOpen) {
    console.log(`${barText} já está ${shouldOpen ? 'aberto' : 'fechado'}.`);
    return true;
  }

  await target.evaluate(node =>
    node.scrollIntoView({ block: 'center', inline: 'center' })
  );

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await target.click({ delay: 50 });
    } catch {
      try {
        await target.evaluate(node => node.click());
      } catch {}
    }

    await wait(700);

    const currentState = await target.evaluate(node =>
      node.classList.contains('collapsibleBarExp')
    ).catch(() => null);

    if (currentState === shouldOpen) {
      console.log(`${barText} foi ${shouldOpen ? 'aberto' : 'fechado'}.`);
      return true;
    }
  }

  console.log(`Não foi possível garantir o estado de ${barText}.`);
  return false;
}

async function setCollapsibleBarState(page, selector, label, shouldOpen) {
  console.log(`Ajustando ${label} para ${shouldOpen ? 'aberto' : 'fechado'}...`);

  const el = await page.waitForSelector(selector, {
    visible: true,
    timeout: 15000
  }).catch(() => null);

  if (!el) {
    console.log(`${label} não encontrado.`);
    return false;
  }

  const isOpen = async () => {
    return await el.evaluate(node => node.classList.contains('collapsibleBarExp'));
  };

  let currentState = await isOpen();
  if (currentState === shouldOpen) {
    console.log(`${label} já está ${shouldOpen ? 'aberto' : 'fechado'}.`);
    return true;
  }

  await el.evaluate(node =>
    node.scrollIntoView({ block: 'center', inline: 'center' })
  );

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await el.click({ delay: 50 });
    } catch {
      try {
        await page.click(selector, { delay: 50 });
      } catch {}
    }

    await wait(700);
    currentState = await page.$eval(selector, node =>
      node.classList.contains('collapsibleBarExp')
    ).catch(() => null);

    if (currentState === shouldOpen) {
      console.log(`${label} foi ${shouldOpen ? 'aberto' : 'fechado'}.`);
      return true;
    }
  }

  console.log(`Não foi possível garantir o estado de ${label}.`);
  return false;
}
  
async function clickFirstInternetItem(page) {
  console.log('Procurando o primeiro item visível...');

  await page.waitForSelector('#Internet_container .instName.collapsibleInst');

  const items = await page.$$('#Internet_container .instName.collapsibleInst');

  for (const item of items) {
    const box = await item.boundingBox();
    if (!box) continue; // ignora ocultos

    await item.click({ delay: 50 });
    console.log('Clique executado no primeiro item visível.');
    return true;
  }

  console.log('Nenhum item visível encontrado.');
  return false;
}

  async function openServiceControlBars(page) {
  console.log('Garantindo que os controles de serviço estejam abertos...');

  const openIfClosed = async (selector, label) => {
    const el = await page.$(selector);
    if (!el) {
      console.log(`${label} não encontrado.`);
      return false;
    }

    const isOpen = await el.evaluate(node =>
      node.classList.contains('collapsibleBarExp')
    );

    if (isOpen) {
      console.log(`${label} já está aberto.`);
      return true;
    }

    await el.evaluate(node =>
      node.scrollIntoView({ block: 'center', inline: 'center' })
    );

    try {
      await el.click({ delay: 50 });
    } catch {
      await page.click(selector, { delay: 50 });
    }

    console.log(`${label} foi aberto.`);
    return true;
  };

  await openIfClosed('#serviceCtlBar', 'Controle de serviço - IPv4');
  await openIfClosed('#IPv6serviceCtlBar', 'Controle de serviço - IPv6');

  return true;
}

  async function clickIfExistsBySelectorRealClick(page, selector) {
  console.log(`Procurando seletor: ${selector}`);

  const el = await page.$(selector);
  if (!el) {
    console.log(`clickIfExistsBySelectorRealClick(${selector}) => false`);
    return false;
  }

  await el.evaluate(node =>
    node.scrollIntoView({
      block: 'center',
      inline: 'center'
    })
  );

  let clicked = false;

  try {
    await el.click({ delay: 50 });
    clicked = true;
  } catch {}

  if (!clicked) {
    try {
      await page.click(selector, { delay: 50 });
      clicked = true;
    } catch {}
  }

  console.log(`clickIfExistsBySelectorRealClick(${selector}) =>`, clicked);
  return clicked;
}
                             
  
async function clickIfExistsBySelector(selector) {
  console.log(`Procurando seletor: ${selector}`);

  const clicked = await page.evaluate((selector) => {
    const el = document.querySelector(selector);

    if (!el) return false;

    const style = window.getComputedStyle(el);
    const visible =
      style &&
      style.visibility !== 'hidden' &&
      style.display !== 'none' &&
      el.getClientRects().length > 0;

    if (!visible) return false;

    const clickable =
      el.closest('a, button, [role="button"], [onclick]') || el;

    clickable.scrollIntoView({ block: 'center', inline: 'center' });

    clickable.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
    clickable.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    clickable.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    clickable.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

    if (typeof clickable.click === 'function') {
      clickable.click();
    }

    return true;
  }, selector);

  console.log(`clickIfExistsBySelector(${selector}) =>`, clicked);
  return clicked;
}
  
  async function clickIfExistsByText(text, selectorFallback = '*') {
    console.log(`Procurando texto: ${text}`);

    const clicked = await page.evaluate(
      ({ text, selectorFallback }) => {
        const normalize = value => (value || '').replace(/\s+/g, ' ').trim();

        const elements = Array.from(document.querySelectorAll(selectorFallback)).filter(
          el => {
            const style = window.getComputedStyle(el);
            return (
              style &&
              style.visibility !== 'hidden' &&
              style.display !== 'none' &&
              el.getClientRects().length > 0
            );
          }
        );

        const exactMatch = elements.find(el => normalize(el.innerText || el.textContent) === text);
        const partialMatch = elements.find(el => normalize(el.innerText || el.textContent).includes(text));
        const target = exactMatch || partialMatch;

        if (!target) {
          return false;
        }

        const clickable =
          target.closest('a, button, [role="button"], [onclick]') ||
          target;

        clickable.scrollIntoView({ block: 'center', inline: 'center' });

        clickable.dispatchEvent(
          new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window })
        );
        clickable.dispatchEvent(
          new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window })
        );
        clickable.dispatchEvent(
          new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window })
        );
        clickable.dispatchEvent(
          new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            view: window
          })
        );

        if (typeof clickable.click === 'function') {
          clickable.click();
        }

        return true;
      },
      { text, selectorFallback }
    );

    console.log(`clickIfExistsByText(${text}) =>`, clicked);
    return clicked;
  }

async function securityPage() {
    await wait(1500);
    await clickIfExistsBySelector('#security')
    await wait(1500);
    await clickIfExistsBySelectorRealClick(page, '#localServiceCtrl');
    await wait(1500);
    await openServiceControlBars(page);
    await wait(1500);
    await screenshot('02-service-control.png');
}

 async function redeLocalPage() {

   await upnpPage();
     await wait(2000);
   await lanPage();
     await wait(2000);
   await wlanBasicPage();

   
   
 async function upnpPage() {
   await clickIfExistsBySelector('#upnp');
await wait(1200);
  await screenshot('03-R-L-UPnP.png');
 }
   
    async function lanPage() {
  await wait(2000);
  await clickIfExistsBySelector('#localnet');
  await wait(2000);
  await clickIfExistsBySelector('#lanConfig');
  await wait(2000);
  await clickIfExistsBySelector('#lanMgrIpv4');
  await wait(2500);

  // Fecha a seção que ocupa espaço no print
  await setCollapsibleBarState(
    page,
    '#LANIPv4_DHCPHostsBar',
    'Endereço alocado (DHCP)',
    false
  );

  await wait(1000);

  // Abre a barra que precisa aparecer no print
  await setCollapsibleBarState(
    page,
    '#DHCPBasicCfgBar',
    'Servidor DHCP',
    true
  );

  await wait(1200);
  await screenshot('04-LAN-IPv4-DHCP.png');
 }

async function wlanBasicPage() {
  await wait(2000);
  await clickIfExistsBySelector('#localnet');
  await wait(2000);
  await clickIfExistsBySelector('#wlanConfig');
  await wait(2500);

  await setCollapsibleBarStateByText(page, 'Configuração WLAN On/Off', true);
  await setCollapsibleBarStateByText(page, 'Configuração Global WLAN', true);
  await setCollapsibleBarStateByText(page, '2.4GHz', true);
  await setCollapsibleBarStateByText(page, '5GHz', true);
  await setCollapsibleBarStateByText(page, 'Configuração WLAN SSID', false);

  await wait(1200);
  await screenshot('05-WLAN-Basica.png');
}
   
}
  

  async function loginPage(login = 'multipro', password = '@62474b3745JR') {
  
  console.log('Abrindo roteador...');

  await page.goto('http://192.168.2.1/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  await wait(3000);

  console.log('Preenchendo login...');

  await page.type('input[type="text"]', `${login}`);
  await page.type('input[type="password"]', `${password}`);

  console.log('Clicando login...');
  await page.click('input.button.login');

  await wait(8000);

      console.log('Login realizado.');
  }

  async function wanPage() {

  //console.log('Abrindo menu Internet...');

  //await page.click('#internet');
  await wait(1500);

  //console.log('Abrindo submenu WAN...');

  await clickIfExistsBySelector('#WANUrl');

  await wait(2000);

  console.log('Menu WAN aberto.');

   await clickFirstInternetItem(page);
   await wait(1500);

   await screenshot('01-pppoe-expanded.png')

    
    
  console.log('Etapa WAN concluída.');
  }

})();














