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

  var inputPassword = null;

  const page = await browser.newPage();

  await page.setViewport({
    width: 1280,
    height: 720
  });


  await loginHuawai();
  //await wanPage()



  async function clicarPorIdUsandoWhere(page, id, fakeClick = false) {
    if (!page) throw new Error('page é obrigatório');
    if (!id) throw new Error('id é obrigatório');

    id = String(id).replace(/^#/, '').trim();

    function escapeAttrValue(value) {
      return String(value)
        .replace(/\\/g, '\\\\')
        .replace(/"/g, '\\"');
    }

    const selector = `[id="${escapeAttrValue(id)}"]`;

    function getFrameByWhere(page, where) {
      if (!where || where === 'top') return page.mainFrame();

      const parts = where.split('.').slice(1); // remove "top"
      let frame = page.mainFrame();

      for (const part of parts) {
        const match = part.match(/^frame\[(\d+)\]$/);
        if (!match) return null;

        const index = Number(match[1]);
        const children = frame.childFrames();

        if (!children[index]) return null;
        frame = children[index];
      }

      return frame;
    }

    async function procurarFrameComId(frame, where = 'top') {
      try {
        const handle = await frame.$(selector);

        if (handle) {
          return {
            frame,
            where,
            handle
          };
        }
      } catch (e) {
        // segue procurando
      }

      const filhos = frame.childFrames();
      for (let i = 0; i < filhos.length; i++) {
        const achou = await procurarFrameComId(filhos[i], `${where}.frame[${i}]`);
        if (achou) return achou;
      }

      return null;
    }

    const encontrado = await procurarFrameComId(page.mainFrame(), 'top');

    if (!encontrado) {
      return {
        ok: false,
        id,
        fakeClick,
        error: `Elemento com id "${id}" não encontrado em nenhum frame`
      };
    }

    const frameAlvo = getFrameByWhere(page, encontrado.where);
    if (!frameAlvo) {
      return {
        ok: false,
        id,
        fakeClick,
        error: `Não foi possível localizar o frame pelo caminho "${encontrado.where}"`
      };
    }

    const handle = await frameAlvo.$(selector);
    if (!handle) {
      return {
        ok: false,
        id,
        fakeClick,
        error: `Elemento com id "${id}" não encontrado no frame "${encontrado.where}"`
      };
    }

    await handle.evaluate(el => {
      el.scrollIntoView({ block: 'center', inline: 'center' });
    });

    if (fakeClick) {
      await handle.evaluate(el => el.click());
    } else {
      try {
        await handle.click({ delay: 0 });
      } catch (err) {
        await handle.evaluate(el => el.click());
      }
    }

    return {
      ok: true,
      id,
      fakeClick,
      where: encontrado.where
    };
  }


  

  async function loginHuawai(login = 'root', password = 't8EtN?4y') {
    if (!password) {
      throw new Error('password é obrigatório');
    }

    
    console.log('Abrindo HUAWAI...');

    //await page.goto('http://100.68.12.253/', {
    await page.goto('http://192.168.101.1/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await wait(3000);

    console.log('Preenchendo login...');

    await page.type('input[type="text"]', `${login}`);
    await page.type('input[type="password"]', `${password}`);

    console.log('Clicando login...');
    await clickIfExistsBySelector('#loginbutton')
    console.log('Login realizado...');
    await wait(2000);


    ///////////////////
    ///////////////////
    const frame = page.frames().find(f => f.url().includes('portalInte'));

if (!frame) throw new Error('Frame do portal não encontrado');

const result = await frame.evaluate(() => {
  if (typeof jumpToAutoConnection === 'function') {
    jumpToAutoConnection();
    return true;
  }
  return false;
});

console.log('jumpToAutoConnection executada:', result);
    //await clicarPorIdUsandoWhere(page, '##test-up-content')
    await wait(5000)
    await screenshot('01-login-after.png')
    ///////////////////
    ///////////////////
    return true;
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

  async function presetHuawai(login = 'root') {

    if (!inputPassword) throw new Error('password é obrigatório');

    await loginHuawai('root', inputPassword);

    await wait(2000)

    await page.waitForSelector('#moreFunctionPage', { visible: true, timeout: 10000 });
    await page.click('#moreFunctionPage');
    
    await wait(8000)

    const frame = page.frames().find(
      f => f.url().includes('configindex.asp')
    );

    await frame.click('#systool');

    await wait(5000)  

    await frame.click('#cfgconfig');

    await wait(3000);
    
    console.log('[IMPORT] Procurando frame cfgfile...');
    const uploadFrame = page.frames().find(f => f.url().includes('cfgfile'));
    console.log('[IMPORT] Frame encontrado:', !!uploadFrame);

    const fileInput = await uploadFrame.$('input[type="file"]');
    console.log('[IMPORT] input[type=file] encontrado:', !!fileInput);

    if (!fileInput) {
      throw new Error('input[type=file] não encontrado');
    }

    console.log('[IMPORT] Iniciando upload...');
    await fileInput.uploadFile(
      '/storage/emulated/0/Download/router/upHuawai.html'
    );
    console.log('[IMPORT] Upload concluído');

    await wait(2000);

    console.log('[IMPORT] Aguardando #btnSubmit...');
    await uploadFrame.waitForSelector('#btnSubmit', { visible: true });
    console.log('[IMPORT] #btnSubmit encontrado');

    await wait(2000);
    
    // Aceita automaticamente o popup de confirmação (OK)
    page.once('dialog', async dialog => {
      console.log('[IMPORT] Dialog encontrado:', dialog.message());
      await dialog.accept();
      console.log('[IMPORT] Dialog confirmado');
    });

    await wait(3000);

    console.log('[IMPORT] Clicando em #btnSubmit...');
    await uploadFrame.evaluate(() => {
      document.querySelector('#btnSubmit')?.click();
    });

    await wait(1000);

    console.log('[IMPORT] Processo finalizado');

    return true;
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
