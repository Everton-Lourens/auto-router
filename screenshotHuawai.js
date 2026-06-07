//
const puppeteer = require('puppeteer-core');
const fs = require('fs');

const SAVE_DIR = '/storage/emulated/0/Download/router';
const login = 'root';
var inputPassword = null;

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

  inputPassword = '76%t9C=Z';
  await presetHuawai();

  async function presetHuawai() {
    if (!inputPassword) throw new Error('password é obrigatório');

    await loginHuawai(inputPassword);
    await wait(5000)
    ///////////////////
    ///////////////////
    try {
      await page.waitForSelector('#iframepage', { visible: true, timeout: 15000 });

      const iframeHandle = await page.$('#iframepage');
      const frameUrl = await iframeHandle.contentFrame();

      console.log('iframe URL:', frameUrl?.url());
    } catch (e) {
      await wait(8000)
    }

    await procurarEAcionarEmTodosFrames(page, 'a.continue-config', {
      modo: 'selector',
      acao: 'click'
    });

    await wait(3000)
    await clicarBotaoPorTextoNoFrame(page, '/PortalUPPort.asp', 'Next');
    await wait(3000)
    await clicarBotaoPorTextoNoFrame(page, '/PortalSetWiFiPwd.asp', 'Skip');
    await wait(3000)
    await clicarBotaoPorTextoNoFrame(page, '/PortalSetPWD.asp', 'Skip');

    await wait(30000); // aguarda o equipamento voltar
    await page.goto('http://192.168.101.1/', {
      waitUntil: 'domcontentloaded',
      timeout: 60000
    });

    await wait(5000)
    await loginHuawai(inputPassword);
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

  async function loginHuawai(password = '@62474b3745JR') {
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
    console.log('[Login Huawai] Login: ' + login);
    console.log('[Login Huawai] Senha: ' + password);

    await page.type('input[type="text"]', `${login}`);
    await page.type('input[type="password"]', `${password}`);

    console.log('Clicando login...');
    await clickIfExistsBySelector('#loginbutton')
    console.log('Login realizado...');
    await wait(2000);

    return true;
  }

  async function wait(time) {
    await new Promise(resolve => setTimeout(resolve, time));
  }

  async function clicarBotaoPorTextoNoFrame(page, srcParte, texto) {
    const frame = page.frames().find(f => f.url().includes(srcParte));

    if (!frame) {
      console.log(`Frame não encontrado: ${srcParte}`);
      return false;
    }

    await frame.waitForSelector('body', { timeout: 5000 }).catch(() => null);

    const handle = await frame.evaluateHandle((texto) => {
      const normaliza = (s) => (s || '').replace(/\s+/g, ' ').trim().toLowerCase();
      const alvoTexto = normaliza(texto);

      const candidatos = [
        ...document.querySelectorAll('button, a, input[type="button"], input[type="submit"], [role="button"]')
      ].filter(el => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return r.width > 0 && r.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden';
      });

      return candidatos.find(el => {
        const txt = normaliza(el.innerText || el.value || el.textContent);
        return txt === alvoTexto;
      }) || null;
    }, texto);

    const element = handle.asElement();
    if (!element) {
      console.log(`Texto não encontrado em: ${srcParte} -> ${texto}`);
      return false;
    }

    await element.evaluate(el => el.scrollIntoView({ block: 'center', inline: 'center' }));

    try {
      await element.click({ delay: 80 });
    } catch (err) {
      console.log('Falhou no elementHandle.click(), tentando mouse.click():', err.message);

      const box = await element.boundingBox();
      if (!box) return false;

      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }

    await wait(3000);

    console.log(`Achou e clicou em: ${srcParte} -> ${texto}`);
    return true;
  }

  async function procurarEAcionarEmTodosFrames(page, alvo, opts = {}) {
    const {
      modo = 'auto',   // 'auto' | 'id' | 'selector' | 'funcao'
      acao = 'click',   // 'click' | 'call'
      timeoutMs = 15000,
      verbose = true
    } = opts;

    if (!page) throw new Error('page é obrigatório');
    if (!alvo) throw new Error('alvo é obrigatório');

    const normalizarId = (v) => String(v).replace(/^#/, '').trim();

    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    // Garante tempo para o iframe ser criado/carregado
    await page.waitForSelector('#iframepage', { timeout: timeoutMs }).catch(() => { });
    await sleep(1000);

    const visitados = new Set();
    const frames = [];

    function coletarFrames(frame) {
      if (!frame || visitados.has(frame)) return;
      visitados.add(frame);
      frames.push(frame);
      for (const child of frame.childFrames()) {
        coletarFrames(child);
      }
    }

    coletarFrames(page.mainFrame());

    if (verbose) {
      console.log(`\n=== Procurando "${alvo}" em ${frames.length} frames ===`);
      frames.forEach((f, i) => {
        console.log(`[${i}] ${f.name() || '(sem nome)'} -> ${f.url()}`);
      });
      console.log('========================================\n');
    }

    for (const frame of frames) {
      try {
        const resultado = await frame.evaluate(
          ({ alvo, modo, acao }) => {
            const norm = (v) => String(v || '').replace(/^#/, '').trim();
            const valor = norm(alvo);

            const visivel = (el) => {
              const s = window.getComputedStyle(el);
              return (
                s &&
                s.visibility !== 'hidden' &&
                s.display !== 'none' &&
                el.getClientRects().length > 0
              );
            };

            const clicar = (el) => {
              const alvoClique = el.closest('a, button, [role="button"], [onclick]') || el;
              alvoClique.scrollIntoView({ block: 'center', inline: 'center' });

              alvoClique.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true, view: window }));
              alvoClique.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
              alvoClique.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
              alvoClique.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));

              if (typeof alvoClique.click === 'function') {
                alvoClique.click();
              }

              return alvoClique.outerHTML?.slice(0, 300) || '';
            };

            const seletores = [];

            if (modo === 'auto' || modo === 'id') {
              seletores.push(`#${CSS.escape(valor)}`);
              seletores.push(`[id="${CSS.escape(valor)}"]`);
            }

            if (modo === 'auto' || modo === 'selector') {
              seletores.push(alvo);
            }

            for (const sel of seletores) {
              let el = null;
              try {
                el = document.querySelector(sel);
              } catch {
                continue;
              }

              if (!el || !visivel(el)) continue;

              if (acao === 'click') {
                return {
                  ok: true,
                  tipo: 'elemento',
                  seletor: sel,
                  html: clicar(el)
                };
              }

              return {
                ok: true,
                tipo: 'elemento',
                seletor: sel,
                html: el.outerHTML?.slice(0, 300) || ''
              };
            }

            if (modo === 'auto' || modo === 'funcao') {
              const fn = window[valor];
              if (typeof fn === 'function') {
                if (acao === 'call') {
                  fn();
                }
                return {
                  ok: true,
                  tipo: 'funcao',
                  nome: valor
                };
              }
            }

            return { ok: false };
          },
          { alvo, modo, acao }
        );

        if (resultado?.ok) {
          if (verbose) {
            console.log(`ACHOU em: ${frame.url()}`);
            console.log(resultado);
          }

          return {
            ok: true,
            frameUrl: frame.url(),
            frameName: frame.name(),
            resultado
          };
        }
      } catch (err) {
        if (verbose) {
          console.log(`Ignorando frame ${frame.url()} -> ${err.message}`);
        }
      }
    }

    if (verbose) {
      console.log(`Não encontrou "${alvo}" em nenhum frame.`);
    }

    return { ok: false, alvo };
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

  await browser.close();

})();
