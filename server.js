async function schedulePresetRun(routerPassword, presetValues = {}) {
  await ensureBrowser();

  if (presetRunning) {
    const error = new Error('Já existe uma execução em andamento.');
    error.code = 'PRESET_ALREADY_RUNNING';
    throw error;
  }

  presetRunning = true;
  presetRunId += 1;

  const runId = `run-${presetRunId}-${Date.now()}`;
  const startedAt = new Date().toISOString();

  lastRun = {
    status: 'running',
    message: 'Preset em execução',
    startedAt,
    finishedAt: null,
    runId
  };
  broadcastStatus();

  log(`[API] Execução iniciada (${runId})`);

  const promise = (async () => {
    try {
      const result = await runPresetFlow(routerPassword, presetValues);
      lastRun = {
        status: 'success',
        message: result.message,
        startedAt,
        finishedAt: new Date().toISOString(),
        runId,
        result
      };
      broadcastStatus();
      log(`[API] Execução concluída com sucesso (${runId})`);
      return result;
    } catch (error) {
      const message = sanitizeError(error);
      lastRun = {
        status: 'error',
        message,
        startedAt,
        finishedAt: new Date().toISOString(),
        runId,
        error: {
          message,
          code: error?.code || 'PRESET_FAILED'
        }
      };
      broadcastStatus();
      log(`[API] Execução falhou (${runId}):`, message);
      throw error;
    } finally {
      presetRunning = false;
      broadcastStatus();
    }
  })();

  promise.catch(err => {
    log('[BACKGROUND ERROR]', sanitizeError(err));
  });

  return { runId, startedAt };
}
const http = require('http');
const fs = require('fs');
const path = require('path');
const util = require('util');
const puppeteer = require('puppeteer-core');

const SAVE_DIR = '/storage/emulated/0/Download/router';
const PUBLIC_DIR = path.join(__dirname, 'public');
const PORT = 7777;
const HOST = '127.0.0.1';
const ROUTER_URL = 'http://192.168.101.1/';
const API_PASSWORD = process.env.PRESET_PASSWORD || '50292230';

const login = 'root';
const defaultPassword = '@62474b3745JR';
const TEMPO_ESPERA_ROTEADOR_MS = 2 * 60 * 1000; // 2 minutos
const INTERVALO_TENTATIVA_ROTEADOR_MS = 20000;  // 20 segundos entre tentativas
const URL_ROTEADOR = 'http://192.168.101.1/';

let inputPassword = null;
let emailPPPoE = null;
let passwordPPPoE = null;
let nameSSID = null;
let passwordSSID = null;
let isLogged = false;
let initSetup = null;
let isPreset = null;
let printPPPoE = null;

let browser = null;
let page = null;
let server = null;
let startingBrowser = null;
let presetRunning = false;
let presetRunId = 0;
let lastRun = {
  status: 'idle',
  message: 'Aguardando execução',
  startedAt: null,
  finishedAt: null,
  runId: null
};

const ACCESS_COOKIE_NAME = 'router_access';
const CONSOLE_HISTORY_LIMIT = 500;

const originalConsole = {
  log: console.log.bind(console),
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console)
};

const consoleClients = new Set();
const consoleHistory = [];

function nowIso() {
  return new Date().toISOString();
}

function parseCookies(cookieHeader = '') {
  return String(cookieHeader || '')
    .split(';')
    .map(part => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const idx = part.indexOf('=');
      if (idx === -1) return acc;
      const key = decodeURIComponent(part.slice(0, idx).trim());
      const value = decodeURIComponent(part.slice(idx + 1).trim());
      acc[key] = value;
      return acc;
    }, {});
}

function validateAccessCodeValue(code) {
  const raw = String(code ?? '').trim();

  if (!/^\d{16}$/.test(raw)) {
    return {
      ok: false,
      statusCode: 403,
      code: 'INVALID_ACCESS_CODE',
      message: 'Código de acesso inválido.'
    };
  }

  const prefix = raw.slice(0, 4);
  const yearSegment = raw.slice(4, 8);
  const day = Number(raw.slice(8, 10));
  const month = Number(raw.slice(10, 12));
  const suffix = raw.slice(12, 16);

  const expectedPrefix = String(API_PASSWORD).slice(0, 4);
  const expectedSuffix = String(API_PASSWORD).slice(4);

  if (prefix !== expectedPrefix || suffix !== expectedSuffix) {
    return {
      ok: false,
      statusCode: 403,
      code: 'INVALID_ACCESS_CODE',
      message: 'Código de acesso inválido.'
    };
  }

  const expiryYear = Number(`${yearSegment.slice(2)}${yearSegment.slice(0, 2)}`);
  const expiryDate = new Date(expiryYear, month - 1, day, 23, 59, 59, 999);

  const validDate =
    Number.isInteger(expiryYear) &&
    expiryDate.getFullYear() === expiryYear &&
    expiryDate.getMonth() === month - 1 &&
    expiryDate.getDate() === day &&
    day >= 1 &&
    day <= 31 &&
    month >= 1 &&
    month <= 12;

  if (!validDate) {
    return {
      ok: false,
      statusCode: 403,
      code: 'INVALID_ACCESS_CODE',
      message: 'Código de acesso inválido.'
    };
  }

  if (Date.now() > expiryDate.getTime()) {
    return {
      ok: false,
      statusCode: 403,
      code: 'ACCESS_EXPIRED',
      message: 'Código expirado.',
      expiredAt: expiryDate.toISOString()
    };
  }

  return {
    ok: true,
    code: raw,
    expiresAt: expiryDate.toISOString(),
    expiresAtEpoch: expiryDate.getTime()
  };
}

function buildAccessCookie(code, expiresAtEpoch) {
  const maxAge = Math.max(1, Math.floor((expiresAtEpoch - Date.now()) / 1000));
  const expires = new Date(expiresAtEpoch).toUTCString();

  return [
    `${ACCESS_COOKIE_NAME}=${encodeURIComponent(code)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAge}`,
    `Expires=${expires}`
  ].join('; ');
}

function resolveAccessContext(req, url) {
  const queryCode = url.searchParams.get('code');

  if (queryCode !== null) {
    const validation = validateAccessCodeValue(queryCode);
    return {
      source: 'query',
      ...validation
    };
  }

  const cookies = parseCookies(req.headers.cookie || '');
  const cookieCode = cookies[ACCESS_COOKIE_NAME];

  if (cookieCode) {
    const validation = validateAccessCodeValue(cookieCode);
    return {
      source: 'cookie',
      ...validation
    };
  }

  return {
    ok: false,
    statusCode: 403,
    code: 'ACCESS_REQUIRED',
    message: 'Acesso negado. Informe ?code= válido.'
  };
}

function createAccessDeniedHtml(message) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Acesso negado</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #07111f;
      --panel: rgba(10, 20, 35, 0.82);
      --border: rgba(120, 180, 255, 0.18);
      --text: #eaf2ff;
      --muted: #97a8c4;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      font-family: Inter, ui-sans-serif, system-ui, sans-serif;
      color: var(--text);
      background:
        radial-gradient(circle at top left, rgba(248, 113, 113, 0.16), transparent 30%),
        radial-gradient(circle at top right, rgba(88, 166, 255, 0.12), transparent 28%),
        linear-gradient(180deg, #05101d 0%, #07111f 55%, #050b15 100%);
    }
    .card {
      width: min(720px, 100%);
      padding: 28px;
      border-radius: 24px;
      background: var(--panel);
      border: 1px solid var(--border);
      box-shadow: 0 18px 60px rgba(0,0,0,0.35);
      backdrop-filter: blur(16px);
    }
    .badge {
      display: inline-flex;
      padding: 8px 12px;
      border-radius: 999px;
      border: 1px solid rgba(248, 113, 113, 0.28);
      background: rgba(248, 113, 113, 0.12);
      color: #ffd2d2;
      font-size: 12px;
      letter-spacing: .08em;
      text-transform: uppercase;
      margin-bottom: 14px;
    }
    h1 { margin: 0 0 10px; font-size: clamp(1.8rem, 4vw, 2.6rem); }
    p { margin: 0; color: var(--muted); line-height: 1.6; }
    code {
      display: inline-block;
      margin-top: 14px;
      padding: 2px 7px;
      border-radius: 8px;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(255,255,255,0.08);
      color: #fff;
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="badge">Acesso bloqueado</div>
    <h1>É necessário um código válido</h1>
    <p>${String(message || 'Informe a query ?code= válida para liberar o painel.')}</p>
    <code>http://localhost:7777/?code=...</code>
  </main>
</body>
</html>`;
}

function sseWrite(res, eventName, data) {
  res.write(`event: ${eventName}\n`);
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function broadcastConsole(entry) {
  for (const client of consoleClients) {
    try {
      sseWrite(client, 'log', entry);
    } catch (error) {
      try { client.destroy?.(); } catch {}
      consoleClients.delete(client);
    }
  }
}

function broadcastStatus() {
  const payload = {
    ok: true,
    service: 'running',
    host: HOST,
    port: PORT,
    presetRunning,
    state: lastRun
  };

  for (const client of consoleClients) {
    try {
      sseWrite(client, 'status', payload);
    } catch (error) {
      try { client.destroy?.(); } catch {}
      consoleClients.delete(client);
    }
  }
}

function pushConsoleEntry(level, args) {
  const entry = {
    timestamp: nowIso(),
    level,
    message: util.format(...args)
  };

  consoleHistory.push(entry);
  if (consoleHistory.length > CONSOLE_HISTORY_LIMIT) {
    consoleHistory.splice(0, consoleHistory.length - CONSOLE_HISTORY_LIMIT);
  }

  broadcastConsole(entry);
  return entry;
}

function patchConsole() {
  for (const level of ['log', 'info', 'warn', 'error']) {
    console[level] = (...args) => {
      originalConsole[level](...args);
      try {
        pushConsoleEntry(level, args);
      } catch (error) {
        originalConsole.error('[console-broadcast-error]', error);
      }
    };
  }
}

patchConsole();

function log(...args) {
  console.log(new Date().toISOString(), ...args);
}

function ensureDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function readPublicFile(fileName, fallback = '') {
  const filePath = path.join(PUBLIC_DIR, fileName);
  if (!fs.existsSync(filePath)) return fallback;
  return fs.readFileSync(filePath, 'utf8');
}

function json(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders
  });
  res.end(body);
}

function text(res, statusCode, body, contentType = 'text/plain; charset=utf-8', extraHeaders = {}) {
  res.writeHead(statusCode, {
    'Content-Type': contentType,
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders
  });
  res.end(body);
}

function sanitizeError(error) {
  if (!error) return 'Erro desconhecido';
  if (typeof error === 'string') return error;
  return error.message || 'Erro desconhecido';
}

function createErrorPayload(code, message, details = undefined) {
  const payload = {
    ok: false,
    error: message,
    code
  };
  if (details !== undefined) payload.details = details;
  return payload;
}

function safeJsonParse(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function normalizeOptionalText(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function escapeHtmlAttribute(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function replaceInputValueByPredicate(html, predicate, newValue) {
  if (!newValue) return html;

  return html.replace(/<input\b[^>]*>/gi, tag => {
    if (!predicate(tag)) return tag;

    const valueMatch = tag.match(/\bvalue=(['"])(.*?)\1/i);
    if (!valueMatch) return tag;

    return tag.replace(
      /\bvalue=(['"])(.*?)\1/i,
      (_, quote) => `value=${quote}${escapeHtmlAttribute(newValue)}${quote}`
    );
  });
}

function updatePresetValues() {
  return {
    emailPPPoEInput: normalizeOptionalText(emailPPPoE),
    passwordPPPoEInput: normalizeOptionalText(passwordPPPoE),
    wifiName: normalizeOptionalText(nameSSID),
    wifiPassword: normalizeOptionalText(passwordSSID)
  };
}

function applyPresetValuesToHtml(html) {
  const values = updatePresetValues();
  let updated = String(html ?? '');

  if (values.wifiName) {
    updated = updated.replaceAll('JR TELECOM -', values.wifiName);
  }

  const emailPredicate = tag => /(?:id|name)=['"][^'"]*(?:user(?:name)?|pppoe|login|account|email)['"][^>]*>/i.test(tag);
  const passwordPredicate = tag => /(?:id|name)=['"][^'"]*(?:pppoe|user|login|account|auth|password|pwd|pass)['"][^>]*>/i.test(tag);
  const wifiNamePredicate = tag => /(?:id|name)=['"][^'"]*(?:ssid|wifi|wlan|network)[^'"]*['"][^>]*>/i.test(tag) || /JR TELECOM -/i.test(tag);
  const wifiPasswordPredicate = tag => /(?:id|name)=['"][^'"]*(?:ssid|wifi|wlan|key|pass|pwd|password|psk|preshared)['"][^>]*>/i.test(tag);

  updated = replaceInputValueByPredicate(updated, emailPredicate, values.emailPPPoEInput);
  updated = replaceInputValueByPredicate(updated, passwordPredicate, values.passwordPPPoEInput);
  updated = replaceInputValueByPredicate(updated, wifiNamePredicate, values.wifiName);
  updated = replaceInputValueByPredicate(updated, wifiPasswordPredicate, values.wifiPassword);

  return updated;
}

function writePresetHtmlFiles() {
  const basePath = path.join(SAVE_DIR, 'upHuawai.html');
  const updatedPath = path.join(SAVE_DIR, 'upHuawaiUpdated.html');
  const templatePath = path.join(SAVE_DIR, 'preDefault.html');

  if (!fs.existsSync(basePath)) {
    if (fs.existsSync(templatePath)) {
      fs.copyFileSync(templatePath, basePath);
    } else {
      throw new Error('Arquivo upHuawai.html não encontrado.');
    }
  }

  const baseHtml = fs.readFileSync(basePath, 'utf8');
  const updatedHtml = applyPresetValuesToHtml(baseHtml);
  fs.writeFileSync(updatedPath, updatedHtml);
  return updatedPath;
}

function isAuthenticatedPassword(password) {
  return String(password ?? '') === API_PASSWORD;
}

function validatePresetRequest(payload) {
  if (!payload || typeof payload !== 'object') {
    return { ok: false, statusCode: 400, message: 'JSON inválido.' };
  }

  if (!isAuthenticatedPassword(payload.password)) {
    return { ok: false, statusCode: 401, message: 'Senha inválida.' };
  }

  if (payload.preset !== true) {
    return { ok: false, statusCode: 400, message: 'O campo preset deve ser true.' };
  }

  if (typeof payload.inputPassword !== 'string' || !payload.inputPassword.trim()) {
    return { ok: false, statusCode: 400, message: 'Senha do roteador não informada.' };
  }

  return { ok: true };
}

async function ensureBrowser() {
  if (browser && page) return { browser, page };
  if (startingBrowser) return startingBrowser;

  startingBrowser = (async () => {
    ensureDirectory(SAVE_DIR);

    browser = await puppeteer.launch({
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

    page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });

    page.on('error', err => log('[PAGE ERROR]', err.message));
    page.on('pageerror', err => log('[PAGE JS ERROR]', err.message));

    browser.on('disconnected', () => {
      log('[BROWSER] disconnected');
      browser = null;
      page = null;
      startingBrowser = null;
    });

    return { browser, page };
  })();

  try {
    return await startingBrowser;
  } finally {
    startingBrowser = null;
  }
}

function resetSessionState() {
  inputPassword = null;
  emailPPPoE = null;
  passwordPPPoE = null;
  nameSSID = null;
  passwordSSID = null;
  isLogged = false;
  initSetup = null;
  isPreset = null;
  printPPPoE = null;
}

async function runPresetFlow(routerPassword, presetValues = {}) {
  await ensureBrowser();

  const activeRouterPassword = String(routerPassword ?? '').trim();
  if (!activeRouterPassword) {
    throw new Error('Senha do roteador não informada.');
  }

  resetSessionState();
  inputPassword = activeRouterPassword;
  emailPPPoE = normalizeOptionalText(presetValues.emailPPPoEInput);
  passwordPPPoE = normalizeOptionalText(presetValues.passwordPPPoEInput);
  nameSSID = normalizeOptionalText(presetValues.wifiName);
  passwordSSID = normalizeOptionalText(presetValues.wifiPassword);

  try {
    log('[FLOW] Iniciando initRouter / preset completo');
    await loginHuawai();
    await presetHuawai();

    printPPPoE = false;
    await goPPPoEConfig();
    await goTR068();

    log('[FLOW] Fluxo completo finalizado');
    return {
      ok: true,
      message: 'Fluxo completo executado com sucesso.',
      isLogged,
      isPreset
    };
  } finally {
    inputPassword = null;
  }
}

async function schedulePresetRun(routerPassword, presetValues = {}) {
  await ensureBrowser();

  if (presetRunning) {
    const error = new Error('Já existe uma execução em andamento.');
    error.code = 'PRESET_ALREADY_RUNNING';
    throw error;
  }

  presetRunning = true;
  presetRunId += 1;

  const runId = `run-${presetRunId}-${Date.now()}`;
  const startedAt = new Date().toISOString();

  lastRun = {
    status: 'running',
    message: 'Preset em execução',
    startedAt,
    finishedAt: null,
    runId
  };

  log(`[API] Execução iniciada (${runId})`);

  const promise = (async () => {
    try {
      const result = await runPresetFlow(routerPassword, presetValues);
      lastRun = {
        status: 'success',
        message: result.message,
        startedAt,
        finishedAt: new Date().toISOString(),
        runId,
        result
      };
      log(`[API] Execução concluída com sucesso (${runId})`);
      return result;
    } catch (error) {
      const message = sanitizeError(error);
      lastRun = {
        status: 'error',
        message,
        startedAt,
        finishedAt: new Date().toISOString(),
        runId,
        error: {
          message,
          code: error?.code || 'PRESET_FAILED'
        }
      };
      log(`[API] Execução falhou (${runId}):`, message);
      throw error;
    } finally {
      presetRunning = false;
    }
  })();

  promise.catch(err => {
    log('[BACKGROUND ERROR]', sanitizeError(err));
  });

  return { runId, startedAt };
}

async function GENIALgetIdSelector() {
  await ensureBrowser();

  for (const frame of page.frames()) {
    try {
      const campos = await frame.evaluate(() => {
        return [...document.querySelectorAll('input')]
          .map(el => ({
            id: el.id,
            name: el.name,
            type: el.type,
            value: el.value
          }))
          .filter(el => el.value);
      });

      console.log('FRAME:', frame.url());
      console.table(campos);
    } catch (e) {}
  }
}

async function initRouter() {
  await loginHuawai();
  await presetHuawai();

  printPPPoE = false;
  await goPPPoEConfig();
  await goTR068();
}

async function goTR068() {
  await ensureBrowser();
  await goMoreOptions();

  const frame = page.frames().find(
    f => f.url().includes('configindex.asp')
  );

  if (!frame) {
    throw new Error('Frame configindex.asp não encontrado.');
  }

  await frame.click('#systool');
  await wait(5000);
  await frame.click('#tr069config');
  await wait(2000);

  const tr069Frame = page.frames().find(
    f => f.url().includes('/html/ssmp/tr069/tr069.asp')
  );

  const presetAplicado = tr069Frame
    ? await tr069Frame.$eval(
        '#URL',
        el => (el.value || '').includes('tr069.jrtelecom.com.br')
      ).catch(() => false)
    : false;

  if (presetAplicado) {
    console.log('✅ tr069.jrtelecom.com.br =》 Preset já foi aplicado!');
    await wait(2000);
    await screenshot('01-TR-069.png');
    isPreset = true;
  } else {
    console.log('❌ tr069.jrtelecom.com.br =》 Preset NÃO foi aplicado...');
    isPreset = false;
  }
}

async function presetHuawai() {
  await ensureBrowser();
  await goSystemManagement();

  const frame = page.frames().find(
    f => f.url().includes('configindex.asp')
  );

  if (!frame) {
    throw new Error('Frame configindex.asp não encontrado.');
  }

  await frame.click('#cfgconfig');
  await wait(3000);

  const presetHtmlPath = writePresetHtmlFiles();

  console.log('[IMPORT] Procurando frame cfgfile...');
  const uploadFrame = page.frames().find(f => f.url().includes('cfgfile'));
  console.log('[IMPORT] Frame encontrado:', !!uploadFrame);

  if (!uploadFrame) {
    throw new Error('Frame cfgfile não encontrado');
  }

  const fileInput = await uploadFrame.$('input[type="file"]');
  console.log('[IMPORT] input[type=file] encontrado:', !!fileInput);

  if (!fileInput) {
    throw new Error('input[type=file] não encontrado');
  }

  console.log('[IMPORT] Iniciando upload...');
  await fileInput.uploadFile(presetHtmlPath);
  console.log('[IMPORT] Upload concluído');

  await wait(2000);

  console.log('[IMPORT] Aguardando #btnSubmit...');
  await uploadFrame.waitForSelector('#btnSubmit', { visible: true });
  console.log('[IMPORT] #btnSubmit encontrado');

  await wait(2000);

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
  isLogged = false;
  isPreset = true;

  return true;
}

async function goPPPoEConfig() {
  await ensureBrowser();
  if (!isLogged) await loginHuawai();
  if (initSetup) await initConfig();
  await wait(3000);

  await page.waitForSelector('#internetPageBtn', { visible: true, timeout: 10000 });
  await page.click('#internetPageBtn');

  await wait(5000);

  const pppoeFrame = page.frames().find(
    f => f.url().includes('/html/bbsp/internetAP/internetAP.asp')
  );

  if (!pppoeFrame) {
    console.log('❌ Frame PPPoE não encontrado');
    return false;
  }

  const usuarioAtual = await pppoeFrame
    .$eval('#UserName', el => el.value.trim())
    .catch(() => '');

  if (usuarioAtual === emailPPPoE || (printPPPoE)) {
    console.log(`✅ PPPoE já configurado: ${usuarioAtual}`);
    await screenshot('02-PPPoE.png');
    return true;
  }

  if (!emailPPPoE || !passwordPPPoE) throw new Error('EMAIL OU SENHA DO "PPPoE" INVÁLIDA.');

  console.log(`🔄 Alterando PPPoE para: ${emailPPPoE}`);

  await pppoeFrame.$eval('#UserName', (el, valor) => {
    el.value = '';
    el.value = valor;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, emailPPPoE);

  await pppoeFrame.$eval('#Password', (el, valor) => {
    el.value = '';
    el.value = valor;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, passwordPPPoE);

  await wait(1000);

  await pppoeFrame.click('#btnSaveTransmit');

  console.log('✅ PPPoE salvo');
  await wait(4000);
  await screenshot('02-PPPoE.png');
  return true;
}

async function goMoreOptions() {
  await ensureBrowser();
  if (!isLogged) await loginHuawai();
  if (initSetup) await initConfig();
  await wait(3000);

  await page.waitForSelector('#moreFunctionPage', { visible: true, timeout: 10000 });
  await page.click('#moreFunctionPage');

  await wait(8000);
}

async function goSystemManagement() {
  await ensureBrowser();
  if (!isLogged) await loginHuawai();
  if (initSetup) await initConfig();
  await wait(3000);

  await goMoreOptions();

  const frame = page.frames().find(
    f => f.url().includes('configindex.asp')
  );

  if (!frame) {
    throw new Error('Frame configindex.asp não encontrado.');
  }

  await frame.click('#systool');
  await wait(5000);
}

async function initConfig() {
  await ensureBrowser();
  await wait(5000);
  if (!isLogged) await loginHuawai();
  if (!initSetup) return true;

  try {
    await page.waitForSelector('#iframepage', { visible: true, timeout: 15000 });

    const iframeHandle = await page.$('#iframepage');
    const frameUrl = await iframeHandle.contentFrame();

    console.log('iframe URL:', frameUrl?.url());
  } catch (e) {
    await wait(8000);
  }

  await procurarEAcionarEmTodosFrames(page, 'a.continue-config', {
    modo: 'selector',
    acao: 'click'
  });

  await wait(3000);
  await clicarBotaoPorTextoNoFrame(page, '/PortalUPPort.asp', 'Next');
  await wait(3000);
  await clicarBotaoPorTextoNoFrame(page, '/PortalSetWiFiPwd.asp', 'Skip');
  await wait(3000);
  await clicarBotaoPorTextoNoFrame(page, '/PortalSetPWD.asp', 'Skip');
  await wait(3000);
  isLogged = false;
  initSetup = false;

  await wait(30000);
  if (!isLogged) await loginHuawai();
  return true;
}

async function loginHuawai() {
  await ensureBrowser();

const roteadorPronto = await aguardarRoteadorLigar();

  if (!roteadorPronto) {
    isLogged = false;
    return false;
  }

  if (inputPassword)
    await tryLogin(inputPassword);

  if (!isLogged)
    await tryLogin(defaultPassword);

  if (!isLogged) {
    throw new Error('SENHA DO ROTEADOR INVÁLIDA.');
  }

  const loginButton = await page.$('#loginbutton');
  const moreOptions = await page.$('#moreFunctionPage');

  if (!loginButton && moreOptions) {
    console.log('Roteador já configurado.');
    initSetup = false;
  } else {
    console.log('Roteador requer configuração inicial.');
    initSetup = true;
  }

  async function tryLogin(password) {
    await wait(2000);
    if (isPreset) password = defaultPassword;

    console.log('Abrindo IP do HUAWEI...');
    console.log(ROUTER_URL);

    await page.goto(ROUTER_URL, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    try {
      await wait(5000);

      let loginButton = await page.$('#loginbutton');

      if (!loginButton) {
        isLogged = true;
        return true;
      }

      console.log('Tentando login...');
      console.log('[Login Huawei] Login: ' + login);
      console.log('[Login Huawei] Senha: ' + password);

      await page.type('input[type="text"]', login);
      await page.type('input[type="password"]', password);

      console.log('Clicando login...');
      await clickIfExistsBySelector('#loginbutton');

      await wait(5000);

      loginButton = await page.$('#loginbutton');

      if (loginButton) {
        console.log('Login falhou');
        isLogged = false;
        return false;
      }

      console.log('Login realizado');
      isLogged = true;
      return true;

    } catch (err) {
      console.log('Erro no login:', err.message);
      isLogged = false;
      return false;
    }
  }
}


async function screenshot(name) {
  ensureDirectory(SAVE_DIR);
  const shotPath = `${SAVE_DIR}/${name}`;

  console.log(`Screenshot: ${shotPath}`);

  await page.screenshot({
    path: shotPath,
    fullPage: true
  });
}

async function wait(time) {
  await new Promise(resolve => setTimeout(resolve, time));
}

async function clicarBotaoPorTextoNoFrame(pageInstance, srcParte, texto) {
  const frame = pageInstance.frames().find(f => f.url().includes(srcParte));

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

    await pageInstance.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }

  await wait(3000);

  console.log(`Achou e clicou em: ${srcParte} -> ${texto}`);
  return true;
}

async function procurarEAcionarEmTodosFrames(pageInstance, alvo, opts = {}) {
  const {
    modo = 'auto',
    acao = 'click',
    timeoutMs = 15000,
    verbose = true
  } = opts;

  if (!pageInstance) throw new Error('page é obrigatório');
  if (!alvo) throw new Error('alvo é obrigatório');

  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  await pageInstance.waitForSelector('#iframepage', { timeout: timeoutMs }).catch(() => { });
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

  coletarFrames(pageInstance.mainFrame());

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

async function aguardarRoteadorLigar() {
  const inicio = Date.now();

  while (Date.now() - inicio < TEMPO_ESPERA_ROTEADOR_MS) {
    try {
      console.log('Aguardando o roteador responder...');
      await page.goto(URL_ROTEADOR, {
        waitUntil: 'domcontentloaded',
        timeout: 10000
      });

      const loginButton = await page.$('#loginbutton');
      const moreOptions = await page.$('#moreFunctionPage');

      if (loginButton || moreOptions) {
        console.log('Roteador respondeu e a página carregou.');
        return true;
      }
    } catch (err) {
      console.log('Roteador ainda não respondeu:', err.message);
    }

    await wait(INTERVALO_TENTATIVA_ROTEADOR_MS);
  }

  console.log('Tempo limite de espera do roteador atingido. Seguindo o fluxo normalmente.');
  return false;
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

function getDashboardHtml() {
  return readPublicFile('index.html', `<!doctype html><html><head><meta charset="utf-8"><title>Router Preset</title></head><body><h1>Router Preset</h1></body></html>`);
}

function getDashboardCss() {
  return readPublicFile('styles.css', 'body{font-family:sans-serif;}');
}

function parseBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > limit) {
        reject(new Error('Payload muito grande.'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(raw));
    req.on('error', reject);
  });
}

async function routeRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
    const pathname = url.pathname;

    if (req.method === 'OPTIONS' && pathname.startsWith('/api/')) {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Cache-Control': 'no-store'
      });
      return res.end();
    }

    if (pathname === '/' || pathname === '/styles.css' || pathname.startsWith('/api/')) {
      const access = resolveAccessContext(req, url);

      if (!access.ok) {
        if (pathname === '/' || pathname === '/styles.css') {
          return text(
            res,
            403,
            createAccessDeniedHtml(access.message),
            'text/html; charset=utf-8'
          );
        }

        return json(
          res,
          access.statusCode || 403,
          createErrorPayload(access.code || 'ACCESS_REQUIRED', access.message)
        );
      }

      const cookieHeader = access.source === 'query'
        ? buildAccessCookie(access.code, access.expiresAtEpoch)
        : null;
      const responseHeaders = cookieHeader ? { 'Set-Cookie': cookieHeader } : {};

      if (req.method === 'GET' && pathname === '/') {
        return text(res, 200, getDashboardHtml(), 'text/html; charset=utf-8', responseHeaders);
      }

      if (req.method === 'GET' && pathname === '/styles.css') {
        return text(res, 200, getDashboardCss(), 'text/css; charset=utf-8', responseHeaders);
      }

      if (req.method === 'GET' && pathname === '/api/status') {
        return json(res, 200, {
          ok: true,
          service: 'running',
          host: HOST,
          port: PORT,
          presetRunning,
          state: lastRun
        }, responseHeaders);
      }

      if (req.method === 'GET' && pathname === '/api/stream') {
        res.writeHead(200, {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
          ...responseHeaders
        });

        res.write('\\n');

        consoleClients.add(res);

        for (const entry of consoleHistory) {
          try {
            sseWrite(res, 'log', entry);
          } catch {}
        }

        sseWrite(res, 'status', {
          ok: true,
          service: 'running',
          host: HOST,
          port: PORT,
          presetRunning,
          state: lastRun
        });

        const heartbeat = setInterval(() => {
          try {
            res.write(': ping\n\n');
          } catch (error) {
            clearInterval(heartbeat);
          }
        }, 20000);

        req.on('close', () => {
          clearInterval(heartbeat);
          consoleClients.delete(res);
        });

        return;
      }

      if (req.method === 'POST' && pathname === '/api/preset') {
        const raw = await parseBody(req);
        const payload = safeJsonParse(raw);

        const validation = validatePresetRequest(payload);
        if (!validation.ok) {
          return json(
            res,
            validation.statusCode,
            createErrorPayload('INVALID_REQUEST', validation.message),
            responseHeaders
          );
        }

        if (presetRunning) {
          return json(
            res,
            409,
            createErrorPayload('PRESET_RUNNING', 'Já existe uma execução em andamento.'),
            responseHeaders
          );
        }

        const queued = await schedulePresetRun(String(payload.inputPassword ?? ''), {
          emailPPPoEInput: payload.emailPPPoEInput,
          passwordPPPoEInput: payload.passwordPPPoEInput,
          wifiName: payload.wifiName,
          wifiPassword: payload.wifiPassword
        });

        return json(
          res,
          202,
          {
            ok: true,
            message: 'Preset aceito e iniciado.',
            runId: queued.runId,
            startedAt: queued.startedAt,
            statusUrl: '/api/status'
          },
          responseHeaders
        );
      }
    }

    return json(res, 404, createErrorPayload('NOT_FOUND', 'Rota não encontrada.'));
  } catch (error) {
    log('[ROUTE ERROR]', sanitizeError(error));
    return json(res, 500, createErrorPayload('INTERNAL_ERROR', sanitizeError(error)));
  }
}

async function startServer() {
  await ensureBrowser();

  server = http.createServer((req, res) => {
    routeRequest(req, res).catch(err => {
      log('[SERVER] Erro não tratado na rota:', sanitizeError(err));
      json(res, 500, createErrorPayload('INTERNAL_ERROR', sanitizeError(err)));
    });
  });

  server.listen(PORT, HOST, () => {
    log(`[HTTP] Servidor iniciado em http://${HOST}:${PORT}`);
    broadcastStatus();
  });
}

async function shutdown() {
  try {
    log('[SHUTDOWN] Encerrando serviço...');
    if (server) {
      await new Promise(resolve => server.close(resolve));
    }
    if (browser) {
      await browser.close();
    }
  } catch (error) {
    log('[SHUTDOWN ERROR]', sanitizeError(error));
  } finally {
    process.exit(0);
  }
}

process.on('uncaughtException', error => {
  log('[UNCAUGHT EXCEPTION]', sanitizeError(error));
});

process.on('unhandledRejection', error => {
  log('[UNHANDLED REJECTION]', sanitizeError(error));
});

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

(async () => {
  ensureDirectory(SAVE_DIR);
  await startServer();
})();
