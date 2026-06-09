# Dependências

```bash
pkg update -y
pkg upgrade -y

pkg install nodejs -y
pkg install chromium -y
```

```bash
npm init -y
```

```bash
npm install puppeteer-core express cors body-parser axios
```


```bash
const puppeteer = require('puppeteer-core');

(async () => {
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
      '--no-zygote'
    ]
  });

  const page = await browser.newPage();

  await page.setViewport({
    width: 1280,
    height: 720
  });

  console.log('Abrindo Google...');

  await page.goto('https://www.google.com', {
    waitUntil: 'networkidle2',
    timeout: 60000
  });

  console.log('Tirando screenshot...');

  await page.screenshot({
    path: 'google.png',
    fullPage: true
  });

  console.log('Screenshot salva em google.png');

  await browser.close();
})();
