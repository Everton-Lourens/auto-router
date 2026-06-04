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

  await page.goto('http://100.68.12.253/', {
  //await page.goto('http://192.168.101.1/', {
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

const frame = page.frames().find(
f => f.url().includes('configindex.asp')
);

await frame.click('#systool');

await wait(5000)  
   await screenshot('03-openMenu.png')

await wait(2000)

await frame.click('#cfgconfig');

await wait(2000)  
   await screenshot('04-openBackReco.png')

await wait(3000);

const uploadFrame = page.frames().find(f =>
  f.url().includes('cfgfile')
);

const fileInput = await uploadFrame.$('input[type="file"]');

if (!fileInput) {
  throw new Error('input[type=file] não encontrado');
}

await fileInput.uploadFile(
  '/storage/emulated/0/Download/router/upHuawai.html'
);

await wait(2000);

//await uploadFrame.click('#btnSubmit');



// Se houver botão de envio depois do upload
await wait(1000);
await frame.click('#btnSubmit');

await wait(2000);
await screenshot('05-uploadDone.png');

return true;
    
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













