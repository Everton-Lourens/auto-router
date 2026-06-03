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



  async function loginHuawai(login = 'root', password = '@62474b3745JR') {
  console.log('Abrindo HUAWAI...');

    await page.goto('http://100.68.12.253/', {
  //await page.goto('http://192.168.101.1/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  await wait(3000);

  console.log('Preenchendo login...');

  await page.type('input[type="text"]', login);
  await page.type('input[type="password"]', password);

  console.log('Clicando login...');
  await page.click('#LoginId');

  await wait(8000);

  console.log('Login realizado.');

  const frame = page.frames().find(f =>
    f.name() === 'mainFrame' || f.name() === 'functioncontent'
  );

  if (!frame) {
    throw new Error('Frame principal não encontrado');
  }

  const systemManagementInfo = await frame.evaluate(() => {
    const target = [...document.querySelectorAll('*')].find(el =>
      el.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() === 'system management'
    );

    if (!target) return null;

    let parent = target.parentElement;

    while (parent && parent.tagName !== 'DIV') {
      parent = parent.parentElement;
    }

    return {
      targetTag: target.tagName,
      targetId: target.id || null,
      targetClass: target.className || null,
      parentTag: parent ? parent.tagName : null,
      parentId: parent ? parent.id || null : null,
      parentClass: parent ? parent.className || null : null,
      parentHtml: parent ? parent.outerHTML : null
    };
  });

  console.log('System Management:', systemManagementInfo);

  return systemManagementInfo;
}
  
  

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


////////////////////
    ////////////////////
    
const frame = page.frames().find(f =>
    f.name() === 'mainFrame' || f.name() === 'functioncontent'
  );

  if (!frame) {
    throw new Error('Frame principal não encontrado');
  }

  const systemManagementInfo = await frame.evaluate(() => {
    const target = [...document.querySelectorAll('*')].find(el =>
      el.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() === 'system management'
    );

    if (!target) return null;

    let parent = target.parentElement;

    while (parent && parent.tagName !== 'DIV') {
      parent = parent.parentElement;
    }

    return {
      targetTag: target.tagName,
      targetId: target.id || null,
      targetClass: target.className || null,
      parentTag: parent ? parent.tagName : null,
      parentId: parent ? parent.id || null : null,
      parentClass: parent ? parent.className || null : null,
      parentHtml: parent ? parent.outerHTML : null
    };
  });

  console.log('System Management:', systemManagementInfo);
    return;
    ////////////////////
    ////////////////////
    
    
    //const frame = page.frames().find(f => f.name() === 'functioncontent' || f.url().includes('configindex.asp'));

//if (!frame) throw new Error('Iframe não encontrado');

//const html = await frame.content();
//console.log(html);

    /////////////////////
    /////////////////////

const UPDATED_FILE = '/storage/emulated/0/Download/router/UPDATED.html';

async function restoreHuaweiConfig(page) {
  const timeout = 30000;

  const getFrame = () =>
    page.frames().find(f =>
      f.name() === 'functioncontent' || /configindex\.asp/i.test(f.url())
    );

  const frame = getFrame();
  if (!frame) throw new Error('Iframe functioncontent não encontrado');

  // 1) garante que o menu lateral já foi carregado
  await frame.waitForSelector('#systool', { visible: true, timeout });

  // 2) abre "System Management"
  await frame.click('#systool');

  // 3) espera o submenu ficar visível
  await frame.waitForFunction(() => {
    const el = document.querySelector('#menu_systool');
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== 'none' && style.visibility !== 'hidden';
  }, { timeout, polling: 200 });

  // 4) agora sim o item aparece e pode ser clicado
  await frame.waitForSelector('#cfgconfig', { visible: true, timeout });
  await frame.click('#cfgconfig');

  // 5) espera a tela de backup/importação carregar
  await frame.waitForFunction(() => {
    return document.body && /Import Configuration File/i.test(document.body.innerText);
  }, { timeout, polling: 250 });

  // 6) upload do arquivo
  const fileInput = await frame.$('input[type="file"]');

  if (fileInput) {
    await fileInput.uploadFile(UPDATED_FILE);
  } else {
    const [browseBtn] = await frame.$x(
      "//button[contains(normalize-space(.), 'Browse')] | " +
      "//input[contains(@value, 'Browse')]"
    );

    if (!browseBtn) throw new Error('Botão Browse... não encontrado');

    const [chooser] = await Promise.all([
      page.waitForFileChooser({ timeout }),
      browseBtn.click()
    ]);

    await chooser.accept([UPDATED_FILE]);
  }

  // 7) clica no botão de importação
  const [importBtn] = await frame.$x(
    "//button[contains(normalize-space(.), 'Import Configuration File')] | " +
    "//input[contains(@value, 'Import Configuration File')]"
  );

  if (!importBtn) {
    throw new Error('Botão Import Configuration File não encontrado');
  }
  await wait(1500);
   await screenshot('ANTES.png')
  await wait(1500);
  await importBtn.click();
  await wait(1500);
  await screenshot('DepiisS.png')
}

    
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













