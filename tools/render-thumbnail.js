// Render thumbnail(s) for a GLB using Puppeteer and a minimal static server
// Usage: 1) npm install puppeteer
//        2) node tools/render-thumbnail.js /models/avocado-toast.glb avocado-toast-thumb

const http = require('http');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

const PUBLIC_DIR = path.join(__dirname, '..', 'ember-and-brew', 'public');
const PORT = 8765;

function startStaticServer() {
  const server = http.createServer((req, res) => {
    try {
      let urlPath = decodeURIComponent(req.url.split('?')[0]);
      if (urlPath === '/') urlPath = '/index.html';
      const filePath = path.join(PUBLIC_DIR, urlPath);
      if (!filePath.startsWith(PUBLIC_DIR)) return res.writeHead(403).end('Forbidden');
      if (!fs.existsSync(filePath)) return res.writeHead(404).end('Not found');
      const stream = fs.createReadStream(filePath);
      res.writeHead(200);
      stream.pipe(res);
    } catch (e) {
      res.writeHead(500).end('Server error');
    }
  });
  return new Promise((resolve) => server.listen(PORT, () => resolve(server)));
}

(async () => {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.log('Usage: node tools/render-thumbnail.js <modelPath> <outName>');
    console.log('Example: node tools/render-thumbnail.js /models/avocado-toast.glb avocado-toast-thumb');
    process.exit(1);
  }
  const [modelPath, outName] = args;
  const server = await startStaticServer();
  console.log('Static server running at http://localhost:' + PORT);

  const browser = await puppeteer.launch({args: ['--no-sandbox','--disable-setuid-sandbox']});
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1200, height: 800, deviceScaleFactor: 1 });
    const url = `http://localhost:${PORT}/tools/thumbnail.html?model=${encodeURIComponent(modelPath)}`;
    console.log('Loading', url);
    await page.goto(url, { waitUntil: 'networkidle0' });
    // wait for the page to signal model ready or timeout
    try {
      await page.waitForFunction('window.__THUMB_READY__ === true', { timeout: 8000 });
      console.log('Model ready — capturing thumbnails');
    } catch (e) {
      console.log('Model did not signal ready in time — capturing anyway');
    }
    // find canvas
    const canvas = await page.$('canvas');
    if (!canvas) throw new Error('Canvas not found on page');
    // capture regular
    const out1 = path.join(PUBLIC_DIR, 'images', `${outName}.png`);
    const out2 = path.join(PUBLIC_DIR, 'images', `${outName}@2x.png`);
    await canvas.screenshot({ path: out1 });
    console.log('Wrote', out1);
    // capture double size by setting device scale
    await page.setViewport({ width: 2400, height: 1600, deviceScaleFactor: 2 });
    await new Promise(r => setTimeout(r, 200));
    const canvas2 = await page.$('canvas');
    await canvas2.screenshot({ path: out2 });
    console.log('Wrote', out2);
  } finally {
    await browser.close();
    server.close();
  }
})();
