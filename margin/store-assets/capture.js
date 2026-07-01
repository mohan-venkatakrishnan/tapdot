// Renders every Margin store-asset HTML mockup to a pixel-exact PNG.
//   node store-assets/capture.js   (run from a folder that has puppeteer-core,
//   with ROOT pointing at the Margin site dir that contains img/icon.png)
// The tapdot/margin dir has no node_modules; render from a sibling that does
// (e.g. the commentiq extension) via a small runner, or copy puppeteer-core in.
import puppeteer from 'puppeteer-core';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const MIME = { '.html':'text/html','.css':'text/css','.png':'image/png' };

// Inline /img/... and /icons/... as data URIs so they survive the resize pass.
function preprocessHtml(html) {
  return html.replace(/src="(\/(img|icons)\/[^"]+)"/g, (match, src) => {
    const p = path.join(ROOT, decodeURIComponent(src.replace(/^\//, '')));
    return fs.existsSync(p) ? `src="data:image/png;base64,${fs.readFileSync(p).toString('base64')}"` : match;
  });
}
const server = http.createServer((req, res) => {
  const fp = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  try { const e = path.extname(fp); let d = fs.readFileSync(fp);
    if (e === '.html') d = Buffer.from(preprocessHtml(d.toString('utf8')));
    res.writeHead(200, { 'Content-Type': MIME[e] || 'application/octet-stream' }); res.end(d);
  } catch { res.writeHead(404); res.end('x'); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const PORT = server.address().port;
function resizePng(src, dst, w, h) {
  const ps = path.join(__dirname, '_r.ps1');
  fs.writeFileSync(ps, `Add-Type -AssemblyName System.Drawing
function Q($g){$g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic;$g.SmoothingMode=[System.Drawing.Drawing2D.SmoothingMode]::HighQuality;$g.PixelOffsetMode=[System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality;$g.CompositingQuality=[System.Drawing.Drawing2D.CompositingQuality]::HighQuality}
$img=[System.Drawing.Bitmap]::new([System.Drawing.Image]::FromFile('${src}'));$tw=${w};$th=${h}
while(($img.Width/2)-ge $tw -and ($img.Height/2)-ge $th){$nw=[int]($img.Width/2);$nh=[int]($img.Height/2);$t=[System.Drawing.Bitmap]::new($nw,$nh);$g=[System.Drawing.Graphics]::FromImage($t);Q $g;$g.DrawImage($img,0,0,$nw,$nh);$g.Dispose();$img.Dispose();$img=$t}
$o=[System.Drawing.Bitmap]::new($tw,$th);$g=[System.Drawing.Graphics]::FromImage($o);Q $g;$g.DrawImage($img,0,0,$tw,$th);$g.Dispose();$img.Dispose();$o.Save('${dst}',[System.Drawing.Imaging.ImageFormat]::Png);$o.Dispose()`, 'utf8');
  execSync(`powershell -ExecutionPolicy Bypass -File "${ps}"`, { stdio: 'pipe' }); fs.unlinkSync(ps);
}
const ASSETS = [
  { file: 'small-promo.html',   width: 440,  height: 280, scale: 3 },
  { file: 'marquee-promo.html', width: 1400, height: 560, scale: 3 },
  { file: 'promo-1200x800.html',width: 1280, height: 800, scale: 3 },
  { file: 'ss1-feed.html',      width: 1280, height: 800, scale: 2 },
  { file: 'ss2-topics.html',    width: 1280, height: 800, scale: 2 },
  { file: 'ss3-summary.html',   width: 1280, height: 800, scale: 2 },
  { file: 'ss4-insights.html',  width: 1280, height: 800, scale: 2 },
  { file: 'ss5-themes.html',    width: 1280, height: 800, scale: 3 },
];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
for (const { file, width, height, scale } of ASSETS) {
  const page = await browser.newPage();
  await page.setViewport({ width, height, deviceScaleFactor: scale });
  await page.goto(`http://127.0.0.1:${PORT}/store-assets/${file}`, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 400));
  const raw = path.join(__dirname, file.replace('.html', '_hi.png'));
  const fin = path.join(__dirname, file.replace('.html', '.png'));
  await page.screenshot({ path: raw }); await page.close();
  resizePng(raw, fin, width, height); fs.unlinkSync(raw);
  console.log(`OK ${file.replace('.html', '.png')}`);
}
await browser.close(); server.close(); console.log('done');
