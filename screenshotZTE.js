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

  async function clickByText(text, selectorFallback = '*') {
    console.log(`Procurando texto: ${text}`);

    const clicked = await page.evaluate(
      async ({ text, selectorFallback }) => {
        const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
        const elements = Array.from(document.querySelectorAll(selectorFallback));

        const normalize = value => (value || '').replace(/\s+/g, ' ').trim();
        const matchesText = el => {
          const value = normalize(el.innerText || el.textContent || '');
          return value === text || value.includes(text);
        };

        const target = elements.find(matchesText);
        if (!target) {
          return false;
        }

        const getClickable = el =>
          el.closest('a, button, [role="button"], [onclick]') ||
          el.closest('li, div, span') ||
          el;

        const clickable = getClickable(target);

        try {
          clickable.scrollIntoView({ block: 'center', inline: 'center' });
        } catch (e) {}

        await sleep(50);

        const rect = clickable.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const dispatch = (type, init = {}) => {
          const event = new MouseEvent(type, {
            bubbles: true,
            cancelable: true,
            view: window,
            buttons: 1,
            ...init,
          });
          return clickable.dispatchEvent(event);
        };

        const withinViewport =
          rect.width > 0 && rect.height > 0 &&
          centerX >= 0 && centerY >= 0 &&
          centerX <= window.innerWidth && centerY <= window.innerHeight;

        if (withinViewport) {
          dispatch('mouseover');
          dispatch('mousemove', { clientX: centerX, clientY: centerY });
          dispatch('mousedown', { clientX: centerX, clientY: centerY });
          dispatch('mouseup', { clientX: centerX, clientY: centerY });
          dispatch('click', { clientX: centerX, clientY: centerY });
        }

        if (typeof clickable.click === 'function') {
          clickable.click();
        }

        return true;
      },
      { text, selectorFallback }
    );

    console.log(`clickByText(${text}) =>`, clicked);
    return clicked;
  }

  async function clickIfExistsByText(text, selectorFallback = '*') {
    return clickByText(text, selectorFallback);
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

  console.log('Abrindo menu WAN...');

  await clickIfExistsByText(
    'WAN',
    'span.emColor.link2More, a, div, p, span'
  );

  await wait(2000);

  console.log('Menu WAN aberto.');

  await screenshot('01-pppoe-expanded.png')
  
  console.log('Etapa WAN concluída.');
  }

  async function pppoePage() {

    console.log('Abrindo menu PPPoE/PPOE...');

    const result = await page.evaluate(
      ({ texts }) => {
        const normalize = value => (value || '')
          .replace(/\s+/g, ' ')
          .trim();

        const exact = value => {
          const normalized = normalize(value).toLowerCase();
          return texts.some(t => normalized === t.toLowerCase());
        };

        const dispatchClick = el => {
          if (!el) return false;

          try {
            el.scrollIntoView({ block: 'center', inline: 'center' });
          } catch (e) {}

          const rect = el.getBoundingClientRect();
          const centerX = rect.left + rect.width / 2;
          const centerY = rect.top + rect.height / 2;

          const fire = (type, init = {}) => {
            const event = new MouseEvent(type, {
              bubbles: true,
              cancelable: true,
              view: window,
              buttons: 1,
              ...init,
            });
            el.dispatchEvent(event);
          };

          fire('mouseover');
          fire('mousemove', { clientX: centerX, clientY: centerY });
          fire('mousedown', { clientX: centerX, clientY: centerY });
          fire('mouseup', { clientX: centerX, clientY: centerY });
          fire('click', { clientX: centerX, clientY: centerY });

          if (typeof el.click === 'function') {
            el.click();
          }

          return true;
        };

        const isOpen = el => {
          if (!el) return false;
          const cls = String(el.className || '').toLowerCase();
          const aria = el.getAttribute && el.getAttribute('aria-expanded');
          return cls.includes('open') || cls.includes('expanded') || cls.includes('active') || aria === 'true';
        };

        const elements = Array.from(document.querySelectorAll('a, span, div, p, li, td, button'));
        const target = elements.find(el => exact(el.innerText || el.textContent || ''));

        if (!target) {
          return { found: false, clicked: false };
        }

        let clicked = false;
        let used = 'none';

        if (!isOpen(target)) {
          const parent = target.parentElement;
          const previous = target.previousElementSibling;

          const arrowCandidates = [
            previous,
            parent && Array.from(parent.querySelectorAll('a, span, div, img, i, button')).find(node => node !== target),
            target.closest('li, div, p') && Array.from(target.closest('li, div, p').querySelectorAll('a, span, div, img, i, button')).find(node => node !== target),
          ].filter(Boolean);

          const arrow = arrowCandidates.find(node => {
            const cls = String(node.className || '').toLowerCase();
            const txt = normalize(node.innerText || node.textContent || '').toLowerCase();
            return node.tagName === 'IMG' ||
              cls.includes('arrow') ||
              cls.includes('toggle') ||
              cls.includes('expand') ||
              cls.includes('collapse') ||
              cls.includes('seta') ||
              txt === '';
          });

          if (arrow && dispatchClick(arrow)) {
            clicked = true;
            used = 'arrow';
          } else if (dispatchClick(target)) {
            clicked = true;
            used = 'text';
          }
        }

        return {
          found: true,
          clicked,
          used,
          text: normalize(target.innerText || target.textContent || ''),
        };
      },
      { texts: ['PPPoE', 'PPOE'] }
    );

    if (!result.found) {
      console.log('PPPoE/PPOE não existe por enquanto.');
      return false;
    }

    console.log('PPPoE/PPOE encontrado:', result);

    await wait(2000);

    await screenshot('02-pppoe-expanded.png');

    console.log('Etapa PPPoE concluída.');
    return true;
  }

  await browser.close();

})();














