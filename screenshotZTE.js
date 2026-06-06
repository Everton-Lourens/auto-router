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

  // Funções auxiliares
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

      const parts = where.split('.').slice(1);
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

  async function screenshot(name) {
    await wait(2000);
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
      if (!box) continue;

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
    await clickIfExistsBySelector('#security');
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
      await wait(2000);
      await clickIfExistsBySelector('#localnet');
      await wait(1500);

      let clicked = await clickIfExistsBySelector('#upnp');

      if (!clicked) {
        clicked = await page.evaluate(() => {
          const el = document.querySelector('#upnp');
          if (el) {
            el.click();
            return true;
          }
          return false;
        });
      }

      if (!clicked) {
        await page.evaluate(() => {
          const candidates = [...document.querySelectorAll('a, li, span, div')];
          const el = candidates.find(node =>
            (node.textContent || '').replace(/\s+/g, ' ').trim() === 'UPnP'
          );
          if (el) el.click();
        });
      }

      await wait(2500);
      await screenshot('03-UPNP.png');
    }

    async function lanPage() {
      await wait(2000);
      await clickIfExistsBySelector('#localnet');
      await wait(2000);
      await clickIfExistsBySelector('#lanConfig');
      await wait(2000);
      await clickIfExistsBySelector('#lanMgrIpv4');
      await wait(2500);

      await setCollapsibleBarState(
        page,
        '#LANIPv4_DHCPHostsBar',
        'Endereço alocado (DHCP)',
        false
      );

      await wait(1000);

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

      await print2GHz_5GHz();
      await printSSID();

      async function printSSID() {
        await setCanalOnOff(page, '#WlanBasicAdOnOffBar', false);
        await wait(2000);
        await setCanalOnOff(page, '#WlanBasicAdConfBar', false);
        await wait(2000);
        await setCanalOnOff(page, '#WLANSSIDConfBar', true);

        await wait(2000);
        await setSSID2G5GHzOnOff(page, 0, false);
        await wait(2000);
        await setSSID2G5GHzOnOff(page, 1, true);
        await wait(2000);
        await setSSID2G5GHzOnOff(page, 5, true);
        await wait(2000);

        await screenshot('06-SSID.png');
      }

      async function setSSID2G5GHzOnOff(page, ssidIndex, open) {
        const templateSelector = `#template_WLANSSIDConf_${ssidIndex}`;
        const barSelector = `${templateSelector} .collapsibleInst`;
        const areaSelector = `${templateSelector} [id^='changeArea_WLANSSIDConf']`;
        const showPasswordSelector = `${templateSelector} [id^='Switch_KeyPassType']`;

        await page.waitForSelector(templateSelector, { visible: true });
        await page.waitForSelector(barSelector, { visible: true });
        await page.waitForSelector(areaSelector);

        const isOpen = await page.$eval(areaSelector, el => {
          return window.getComputedStyle(el).display !== 'none';
        });

        if (open && !isOpen) {
          await page.click(barSelector);
          await wait(1000);
        }

        if (!open && isOpen) {
          await page.click(barSelector);
          return true;
        }

        if (open) {
          const checkbox = await page.$(showPasswordSelector);
          if (checkbox) {
            const checked = await page.$eval(showPasswordSelector, el => el.checked);
            if (!checked) {
              await page.click(showPasswordSelector);
              await wait(1000);
            }
          }
        }

        return true;
      }

      async function print2GHz_5GHz() {
        await wait(2000);
        await setCanalOnOff(page, '#WlanBasicAdConfBar', true);
        await wait(2000);
        await set5GHzOnOff(page, true);
        await wait(2000);
        await screenshot('05-canal-2.4_5G.png');
      }

      async function setCanalOnOff(page, selector, open) {
        if (!page || !selector || open === undefined) {
          throw new Error('@@@@@ Parâmetros inválidos: setCanalOnOff @@@@@');
        }

        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        async function getState() {
          return await page.$eval(selector, el =>
            el.classList.contains('collapsibleBarExp')
          );
        }

        async function tryClick() {
          const el = await page.$(selector);
          if (!el) throw new Error(`@@@@@ Elemento não encontrado: ${selector} @@@@@`);

          await el.evaluate(node => node.scrollIntoView({ block: 'center', inline: 'center' }));
          await delay(300);

          try {
            await el.click({ delay: 80 });
          } catch (_) {
            await page.evaluate(sel => {
              const node = document.querySelector(sel);
              if (node) node.click();
            }, selector);
          }
        }

        await page.waitForSelector(selector, { visible: true, timeout: 10000 });

        for (let tentativa = 1; tentativa <= 4; tentativa++) {
          const isOpenBefore = await getState();

          if ((open && isOpenBefore) || (!open && !isOpenBefore)) {
            return true;
          }

          await tryClick();

          try {
            await page.waitForFunction(
              (sel, desiredOpen) => {
                const el = document.querySelector(sel);
                if (!el) return false;
                return el.classList.contains('collapsibleBarExp') === desiredOpen;
              },
              { timeout: 3000 },
              selector,
              open
            );
          } catch (_) {
            // segue para nova tentativa
          }

          const isOpenAfter = await getState();
          if ((open && isOpenAfter) || (!open && !isOpenAfter)) {
            await delay(500);
            return true;
          }

          await delay(800);
        }

        throw new Error(`@@@@@ Não ${open ? 'abriu' : 'fechou'} o canal em ${selector} @@@@@`);
      }

      async function set5GHzOnOff(page, open) {
        const selector = '#instName_WlanBasicAdConf\\:1';

        try {
          await page.waitForSelector(selector, { visible: true, timeout: 3000 });
        } catch (e) {
          await wait(2000);
          const el = await page.$(selector);
          if (el) {
            console.log('seletor 5GHz deu falha, porém foi corrigido...');
          } else {
            console.log('@@@@ 5GHz não encontrado');
            console.log('@@@@ Selector não apareceu:', selector);
            console.log('@@@@@ Fluxo não interrompido continuando...');
          }
        }

        const isOpen = await page.$eval(selector, el =>
          el.classList.contains('instNameExp')
        );

        if (open && !isOpen) {
          await page.click(selector);
        }

        if (!open && isOpen) {
          await page.click(selector);
        }

        return true;
      }
    }
  }

  async function updateZTE5Antenas(page) {
    console.log('Atualizando roteador ZTE 5 antenas para versão P9.');

    await wait(2000);

    await clickIfExistsBySelector('#mgrAndDiag');

    await wait(2000);

    await clickIfExistsBySelector('#devMgr');

    await wait(2000);

    await page.evaluate(() => {
      document.querySelector('#firmwareUpgr').click();
    });

    await wait(2000);

    await page.waitForSelector('#VersionUpload');

    const input = await page.$('#VersionUpload');
    await input.uploadFile('/storage/emulated/0/Download/router/update.bin');
    await wait(2000);
    await screenshot('01-upgrade-antes.png');

    await wait(2000);
    console.log(
      await page.$eval(
        '#VersionUpload',
        el => el.files.length
          ? `✅ Arquivo selecionado: ${el.files[0].name}`
          : '❌ Nenhum arquivo selecionado'
      )
    );

    await wait(2000);

    await page.waitForSelector('#Btn_Upload', {
      visible: true,
      timeout: 10000
    });

    await page.click('#Btn_Upload');

    await wait(2000);

    await page.waitForSelector('#confirmOK', {
      visible: true,
      timeout: 10000
    });

    await page.click('#confirmOK');

    await wait(5000);

    await screenshot('01-upgrade-depois.png');

    await wait(2000);
  }

  async function loginPage(login = 'multipro', password = '@62474b3745JR') {
    console.log('Abrindo roteador ZTE...');

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

    if (await page.$('#Btn_Close')) {
      await page.click('#Btn_Close');
      await wait(8000);
    }

    console.log('Login realizado.');

    if ((await page.$eval('#pdtVer', el => el.textContent.toUpperCase())).indexOf('P9') === -1) {
      await updateZTE5Antenas(page);
    } else {
      console.log('ZTE 5 antenas está atualizado: P9');
    }
  }

  async function loginONU(login = 'multipro', password = 'multipro') {
    console.log('Abrindo ONU...');
    await page.goto('http://192.168.1.1/', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await wait(3000);

    console.log('Preenchendo login...');

    await page.type('input[type="text"]', `${login}`);
    await page.type('input[type="password"]', `${password}`);

    console.log('Clicando login...');
    await page.click('#LoginId');

    await wait(8000);

    console.log('Login realizado.');

    await page.waitForSelector('#mainFrame', {
      timeout: 15000
    });

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

    console.log(softwareBox);

    return true;
  }

  async function wanPage() {
    await wait(1500);

    await clickIfExistsBySelector('#WANUrl');

    await wait(2000);

    console.log('Menu WAN aberto.');

    await clickFirstInternetItem(page);
    await wait(1500);

    await page.type('#UserName\\:0', '@@@@@@@@@@@');
    await wait(1500);
            await screenshot('01-escrevendo.png');
    await wait(1500);
    await page.type('#Password\\:0', 'senha123');
    await wait(1500);

    await screenshot('01-pppoe-expanded.png');

    console.log('Etapa WAN concluída.');
  }
})();














