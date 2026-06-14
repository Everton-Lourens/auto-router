const puppeteer = require('puppeteer-core');

const ONU_URL = 'http://192.168.1.1/';
const CHROME_PATH = '/data/data/com.termux/files/usr/lib/chromium/chrome';

async function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function loginONU(page, login = 'multipro', password = 'multipro') {
  console.log('Abrindo ONU...');

  await page.goto(ONU_URL, {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  await wait(3000);

  console.log('Preenchendo login...');

  await page.waitForSelector('input[type="text"]', { visible: true, timeout: 15000 });
  await page.waitForSelector('input[type="password"]', { visible: true, timeout: 15000 });

  await page.type('input[type="text"]', String(login));
  await page.type('input[type="password"]', String(password));

  console.log('Clicando login...');
  await page.waitForSelector('#LoginId', { visible: true, timeout: 15000 });
  await page.click('#LoginId');

  await wait(8000);

  console.log('Login realizado.');

  try {
    await page.waitForSelector('#mainFrame', { timeout: 15000 });
  } catch (error) {
    console.log('mainFrame não encontrado via seletor. Seguindo com a checagem por frames...');
  }

  const frame = page.frames().find(f => f.name() === 'mainFrame');

  if (!frame) {
    throw new Error('mainFrame não encontrado');
  }

  const softwareBox = await frame.evaluate(() => {
    const target = [...document.querySelectorAll('*')].find(el =>
      el.textContent?.replace(/\s+/g, ' ').trim().toUpperCase() === 'THE DEVICE WILL REBOOT AFTER UPGRADING'
    );

    if (!target) return null;

    let el = target;
    while (el && !el.id) {
      el = el.parentElement;
    }

    return el ? { id: el.id, tag: el.tagName, html: el.outerHTML } : null;
  });

  console.log('Elemento de referência encontrado:', softwareBox);

  return true;
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
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

  try {
    await loginONU(page);
  } finally {
    await browser.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error('Erro ao abrir a ONU:', error);
    process.exit(1);
  });
}

module.exports = {
  loginONU
};
