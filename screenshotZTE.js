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

  async function clickIfExistsByText(text, selectorFallback = '*') {
    console.log(`Procurando texto: ${text}`);

    const clicked = await page.evaluate(
      ({ text, selectorFallback }) => {
        const elements = Array.from(document.querySelectorAll(selectorFallback));
        const target = elements.find(el => {
          const value = (el.innerText || el.textContent || '').trim();
          return value === text || value.includes(text);
        });

        if (target) {
          target.click();
          return true;
        }

        return false;
      },
      { text, selectorFallback }
    );

    console.log(`clickIfExistsByText(${text}) =>`, clicked);
    return clicked;
  }

  console.log('Abrindo roteador...');

  await page.goto('http://192.168.2.1/', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  await wait(3000);

  console.log('Preenchendo login...');

  await page.type('input[type="text"]', 'multipro');
  await page.type('input[type="password"]', '@62474b3745JR');

  console.log('Clicando login...');
  await page.click('input.button.login');

  await wait(8000);

  console.log('Abrindo menu WAN...');

  const clickedWan = await clickIfExistsByText(
    'WAN',
    'span.emColor.link2More, a, div, p, span'
  );

  if (clickedWan) {
    console.log('WAN clicado com sucesso.');
  } else {
    console.log('WAN não encontrado. Seguindo sem clicar.');
  }

  await wait(2000);

  console.log('Etapa WAN concluída. Nenhum print foi tirado.');

  await browser.close();

})();
