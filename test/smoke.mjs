/* Prueba la app como la sirve Android: desde un origen local y con el puente simulado.
   Usa el motor real incluido en www/vendor. */
import { createRequire } from 'node:module';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const www = path.resolve(here, '..', process.env.WWW || 'www');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  const f = path.join(www, decodeURIComponent(new URL(req.url, 'http://x').pathname.replace(/^\/$/, '/index.html')));
  if (!f.startsWith(www) || !fs.existsSync(f)) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
const fail = [];
const check = (name, ok, detail = '') => { console.log(`${ok ? 'OK ' : 'MAL'} ${name}${detail ? ' · ' + detail : ''}`); if (!ok) fail.push(name); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 400, height: 800 }, isMobile: true, hasTouch: true, acceptDownloads: true });
await ctx.addInitScript(() => {
  const log = (window.__native = { name: null, mime: null, size: 0, head: null, saves: 0, shares: 0, exit: 0, back: null, bar: [] });
  window.Capacitor = {
    isNativePlatform: () => true,
    convertFileSrc: (p) => p,
    Plugins: {
      LumenNativo: {
        begin: async ({ name, mime }) => { log.name = name; log.mime = mime; log.size = 0; log.head = null; },
        chunk: async ({ data }) => { const raw = atob(data); if (log.head === null) log.head = raw.charCodeAt(0).toString(16) + raw.charCodeAt(1).toString(16); log.size += raw.length; },
        save: async () => { log.saves++; return { uri: 'content://prueba' }; },
        share: async () => { log.shares++; },
        addListener: (type, fn) => { if (type === 'sharedImage') log.incoming = fn; },
      },
      App: { addListener: (type, fn) => { if (type === 'backButton') log.back = fn; }, exitApp: () => { log.exit++; } },
      StatusBar: { hide: async () => log.bar.push('hide'), show: async () => log.bar.push('show'), setBackgroundColor: async () => {}, setStyle: async () => {} },
    },
  };
});
const page = await ctx.newPage();
const errors = [], external = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (/GL_INVALID|Feedback loop/.test(m.text())) errors.push(m.text()); });
page.on('request', (r) => { const u = r.url(); if (!u.startsWith(url) && !/^(data|blob):/.test(u)) external.push(u); });
await page.goto(url);
await page.click('.btn:has-text("ejemplo")');
await page.waitForSelector('#edCanvas');
await page.waitForFunction(() => !document.querySelector('.thumb-pic.wait') && document.querySelectorAll('.thumb:not(.fix)').length === 85, null, { timeout: 240000 });
check('85 miniaturas: sin look y 84 looks', true);
check('La foto abre sin ajuste automático', await page.evaluate(() => __lumen.S.params.auto.amount === 0 && !__lumen.S.params.fix));
check('Sugerencias visibles', (await page.$$('.thumb.fix')).length >= 1, await page.textContent('#diagRow'));
await page.tap('.thumb.fix');
await page.waitForFunction(() => window.__lumen.S.params.fix);
check('Tocar una sugerencia la aplica', true);
await page.tap('.thumb:not(.fix):nth-child(8)');
await page.waitForTimeout(300);
await page.tap('.dock-btn[data-mode="ajustes"]');
await page.waitForTimeout(300);
const layout = await page.evaluate(() => { const s = document.getElementById('stage').getBoundingClientRect(); return { stage: Math.round(s.height), share: s.height / innerHeight, compact: document.querySelector('.panel').classList.contains('compact'), sliders: [...document.querySelectorAll('.panel .ctl')].filter((c) => !c.hidden).length, pills: document.querySelectorAll('.tool').length }; });
check('Ajustes dejan la foto en grande', layout.share > 0.58 && layout.compact && layout.sliders === 1 && layout.pills >= 5, JSON.stringify(layout));
await page.tap('.tool:nth-child(2)');
const visible = await page.evaluate(() => [...document.querySelectorAll('.panel .ctl')].find((c) => !c.hidden).querySelector('input').id);
check('Un ajuste a la vez', visible === 's-contrast', visible);

await page.tap('.step:text-is("Calidad")');
await page.waitForFunction(() => window.__lumen.S.finalC, null, { timeout: 120000 });
await page.tap('.opt:has(strong:text-is("4K"))');
await page.tap('#bApply');
await page.waitForFunction(() => /Reconstruyendo detalle/.test(document.querySelector('.panelbox .note')?.textContent || ''), null, { timeout: 240000 });
check('Muestra progreso y tiempo', true, await page.textContent('.panelbox .note'));
await page.waitForFunction(() => !window.__lumen.S.enhBusy && window.__lumen.S.enh.mode === '4k', null, { timeout: 900000 });
const q = await page.evaluate(() => { const { S } = window.__lumen; return { w: S.finalC.width, h: S.finalC.height, label: S.enh.label, cas: S.enh.cas }; });
check('4K real con el motor incluido', q.w === 3840 && q.h === 2560 && /Real-ESRGAN/.test(q.label) && q.cas > 0, JSON.stringify(q));
await page.tap('#bToDownload');
await page.waitForSelector('#bDownload:not([disabled])', { timeout: 120000 });
await page.tap('#bDownload');
await page.waitForFunction(() => window.__native.saves === 1, null, { timeout: 60000 });
const saved = await page.evaluate(() => ({ ...window.__native, back: null }));
check('Guardar pasa por el plugin de Android', saved.head === 'ffd8' && saved.size > 100000 && /_4k\.jpg$/.test(saved.name), `${saved.name}, ${saved.size} bytes`);
check('Compartir disponible en Android', await page.evaluate(() => !document.getElementById('bShare').hidden));
await page.tap('#bShare');
await page.waitForFunction(() => window.__native.shares === 1, null, { timeout: 60000 });
await page.evaluate(() => window.__native.back());
await page.waitForSelector('#edCanvas');
await page.tap('.dock-btn[data-mode="auto"]');
await page.evaluate(() => window.__native.back());
check('Atrás: cierra el panel', await page.evaluate(() => document.getElementById('studio').dataset.mode === 'looks'));
await page.evaluate(() => window.__native.back());
await page.waitForSelector('.drop');
await page.evaluate(() => window.__native.back());
check('Atrás: en la portada sale de la app', await page.evaluate(() => window.__native.exit === 1));
check('Sin peticiones a internet', external.filter((u) => !/fonts\.g/.test(u)).length === 0, external.slice(0, 3).join(', '));
await page.evaluate(async () => {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 900;
  const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 1200, 900); g.addColorStop(0, '#2a7fd0'); g.addColorStop(1, '#f2c14e'); x.fillStyle = g; x.fillRect(0, 0, 1200, 900);
  await window.__native.incoming({ path: c.toDataURL('image/png'), name: 'desde-galeria.png', mime: 'image/png' });
});
await page.waitForFunction(() => window.__lumen.S.name === 'desde-galeria.png' && document.querySelector('#edCanvas'), null, { timeout: 60000 });
check('Una foto compartida desde la Galería abre en el editor', true);
await page.tap('.step:text-is("Calidad")');
await page.waitForSelector('.opt:has(strong:text-is("WhatsApp y Facebook"))');
await page.tap('.opt:has(strong:text-is("Foto de perfil"))');
await page.tap('.step:text-is("Guardar")');
await page.waitForFunction(() => { const d = document.querySelector('#bDownload'); return d && !d.disabled && window.__lumen.S.enh.mode === 'perfil'; }, null, { timeout: 120000 });
const social = await page.evaluate(() => ({ fmtHidden: !document.querySelector('#fmt').offsetParent, qualHidden: !document.querySelector('#qual').offsetParent, note: !!document.querySelector('#socialNote').offsetParent, name: document.querySelector('#fname').value, dims: document.querySelector('#estDims').textContent }));
check('Redes: formato definido y preparación automática', social.fmtHidden && social.qualHidden && social.note && social.name.endsWith('.jpg') && social.dims.startsWith('640×'), JSON.stringify(social));
check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
server.close();
if (fail.length) { console.error('Fallaron: ' + fail.join(', ')); process.exit(1); }
