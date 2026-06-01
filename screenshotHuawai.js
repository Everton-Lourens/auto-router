//
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
  //await wanPage()

  
  

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

  async function loginPage(login = 'root', password = '@62474b3745JR') {
  
  console.log('Abrindo roteador...');

  await page.goto('http://192.168.101.1/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  await wait(3000);

   await screenshot('01-login-before.png')

  console.log('Preenchendo login...');

  await page.type('input[type="text"]', `${login}`);
  await page.type('input[type="password"]', `${password}`);

  console.log('Clicando login...');
  await clickIfExistsBySelector('#loginbutton')

  await wait(2000);

      await page.waitForSelector('#moreFunctionPage', { visible: true, timeout: 10000 });
await page.click('#moreFunctionPage');
    
    await wait(5000)

   await screenshot('02-moreButton.png')
    
      console.log('@@@@@@@@@@@@@@@@@@@@@@@@');

await wait(8000)
    //const frame = page.frames().find(f => f.name() === 'functioncontent' || f.url().includes('configindex.asp'));

//if (!frame) throw new Error('Iframe não encontrado');

//const html = await frame.content();
//console.log(html);

    /////////////////////
    /////////////////////

const UPDATED_FILE = '/storage/emulated/0/Download/router/UPDATED.html';

async function restoreHuaweiConfig(page) {
  const timeout = 20000;

  const getFunctionFrame = () =>
    page.frames().find(f =>
      f.name() === 'functioncontent' ||
      /configindex\.asp|cfgconfig|backup|recover/i.test(f.url())
    );

  let frame = getFunctionFrame();
  if (!frame) throw new Error('Iframe functioncontent não encontrado');

  // Garante que o menu lateral está disponível
  await frame.waitForSelector('#cfgconfig', { visible: true, timeout });

  // Clica no menu Backup And Recovery e aguarda a navegação do iframe
  const oldUrl = frame.url();

  await Promise.all([
    frame.waitForNavigation({ waitUntil: 'domcontentloaded', timeout }).catch(() => {}),
    frame.click('#cfgconfig')
  ]);

  // Reobtém o frame após a troca de src
  await page.waitForFunction(
    (prevUrl) => {
      const f = [...window.frames].find(() => false);
      return true;
    },
    { timeout: 1000 },
    oldUrl
  ).catch(() => {});

  frame = getFunctionFrame() || frame;

  // Espera a tela de importação aparecer
  await frame.waitForFunction(() =>
    document.body && document.body.innerText.includes('Import Configuration File'),
    { timeout }
  );

  // Tenta achar um input file direto
  let fileInput = await frame.$('input[type="file"]');

  if (!fileInput) {
    // fallback: abre o Browse... e usa o file chooser
    const browseXPath =
      "//button[contains(normalize-space(.), 'Browse')]" +
      " | //input[@type='button' and contains(@value, 'Browse')]" +
      " | //input[@type='submit' and contains(@value, 'Browse')]";

    const [browseBtn] = await frame.$x(browseXPath);

    if (!browseBtn) {
      throw new Error('Botão Browse... não encontrado');
    }

    const [chooser] = await Promise.all([
      page.waitForFileChooser({ timeout }),
      browseBtn.click()
    ]);

    await chooser.accept([UPDATED_FILE]);

  } else {
    await fileInput.uploadFile(UPDATED_FILE);
  }

  // Aguarda o arquivo ser reconhecido
  await frame.waitForTimeout(500);

  // Clica em Import Configuration File
  const importXPath =
    "//button[contains(normalize-space(.), 'Import Configuration File')]" +
    " | //input[@type='button' and contains(@value, 'Import Configuration File')]" +
    " | //input[@type='submit' and contains(@value, 'Import Configuration File')]";

  const [importBtn] = await frame.$x(importXPath);

  if (!importBtn) {
    throw new Error('Botão Import Configuration File não encontrado');
  }

  await importBtn.click();
}

// uso
await restoreHuaweiConfig(page);

    
    /////////////////////
    /////////////////////
    
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

    await wait(1500);
   await clickIfExistsBySelector('#security')
    await wait(1500);
    await clickIfExistsBySelectorRealClick(page, '#localServiceCtrl');
    await wait(1500);
    await screenshot('02-security.png');

    //////////
await wait(1500);
    await openServiceControlBars(page);
    await wait(1500);
await screenshot('03-service-control.png')
//////////
    
  console.log('Etapa WAN concluída.');
  }

  await browser.close();

})();













