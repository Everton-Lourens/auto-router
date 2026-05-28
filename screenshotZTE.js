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

  async function wait(time) {
    await new Promise(resolve => setTimeout(resolve, time));
  }

  async function screenshot(name) {
    const path = `${SAVE_DIR}/${name}`;
    console.log(`Screenshot: ${path}`);
    await page.screenshot({
      path,
      fullPage: true
    });
  }

  async function clickByText(text, selectorFallback = '*') {
    console.log(`Procurando texto: ${text}`);

    const clicked = await page.evaluate(
      ({ text, selectorFallback }) => {
        const elements = Array.from(document.querySelectorAll(selectorFallback));
        const target = elements.find(el =>
          el.innerText && el.innerText.includes(text)
        );

        if (target) {
          target.scrollIntoView({ block: 'center', inline: 'center' });
          target.click();
          return true;
        }

        return false;
      },
      { text, selectorFallback }
    );

    console.log(`clickByText(${text}) =>`, clicked);
    return clicked;
  }

  async function clickContains(selector, textContains) {
    console.log(`Clique selector: ${selector}`);

    const clicked = await page.evaluate(
      ({ selector, textContains }) => {
        const elements = Array.from(document.querySelectorAll(selector));
        const target = elements.find(el =>
          el.innerText && el.innerText.includes(textContains)
        );

        if (target) {
          target.scrollIntoView({ block: 'center', inline: 'center' });
          target.click();
          return true;
        }

        return false;
      },
      { selector, textContains }
    );

    console.log(`clickContains(${textContains}) =>`, clicked);
    return clicked;
  }

  try {
    console.log('Abrindo roteador...');

    await page.goto('http://192.168.2.1/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await wait(3000);

    console.log('Preenchendo login...');

    await page.type('input[type="text"]', 'multipro');
    await page.type('input[type="password"]', '@62474b3745JR');

    await screenshot('01-before-login.png');

    console.log('Clicando login...');

    await page.click('input.button.login');

    await wait(8000);

    await screenshot('02-after-login.png');

    console.log('Abrindo menu WAN...');

    await clickByText('WAN', 'span.emColor.link2More');
    await wait(2000);

    await screenshot('03-wan-menu.png');

    console.log('Expandindo PPPoE...');

    await clickContains('span.instName.collapsibleInst', 'PPPoE');
    await wait(1500);

    await screenshot('04-pppoe-expanded.png');

    console.log('Abrindo Segurança...');

    await clickByText('Segurança', 'a');
    await wait(2000);

    await screenshot('05-security-menu.png');

    console.log('Abrindo Controle de serviço local...');

    await clickContains('p.AE1leMenu3', 'Controle de serviço local');
    await wait(2000);

    await screenshot('06-acess-control.png');

    console.log('Fluxo concluído com sucesso!');
  } catch (error) {
    console.error('Erro no fluxo:', error);
  } finally {
    await browser.close();
  }
})();
