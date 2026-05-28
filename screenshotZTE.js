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
  await wanPage()

  
  

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

  console.log('Abrindo menu Internet...');

  await page.click('#internet');
  await wait(1500);

  console.log('Abrindo submenu WAN...');

  await clickIfExistsByText(
    'WAN',
    'a'
  );

  await wait(2000);

  console.log('Menu WAN aberto.');

    ///////
await page.evaluate(async () => {
  const normalize = (v) => (v || '').replace(/\s+/g, ' ').trim().toLowerCase();

  const isVisible = (el) => {
    if (!el) return false;
    const s = getComputedStyle(el);
    return s.display !== 'none' && s.visibility !== 'hidden' && el.getClientRects().length > 0;
  };

  const clickEl = (el) => {
    if (!el) return false;
    el.scrollIntoView({ block: 'center', inline: 'center' });
    el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
    el.click?.();
    return true;
  };

  const getMatches = () =>
    [...document.querySelectorAll('span.instName.collapsibleInst')].filter((el) => {
      const t = normalize(el.textContent);
      return isVisible(el) && (t === 'pppoe' || t === 'ppoe' || t.includes('pppoe') || t.includes('ppoe'));
    });

  const getClickable = (el) =>
    el.closest('tr, li, div') ||
    el.parentElement ||
    el;

  const all = getMatches();

  for (const el of all) {
    if (el.classList.contains('instNameExp')) {
      clickEl(getClickable(el));
    }
  }

  await new Promise((r) => setTimeout(r, 400));

  const first = getMatches().find((el) => !el.classList.contains('instNameExp')) || getMatches()[0];
  if (!first) return false;

  clickEl(getClickable(first));
  return true;
});
    ///////

  await screenshot('01-pppoe-expanded.png')

  console.log('Etapa WAN concluída.');
  }

  await browser.close();

})();














