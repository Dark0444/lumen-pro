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

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
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
        addListener: (type, fn) => { if (type === 'sharedImage') log.incoming = fn; if (type === 'openCamera') log.openCamera = fn; },
        shareTo: async ({ pkg }) => { log.to = pkg; log.toName = log.name; return { opened: true }; },
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
await page.waitForFunction(() => !document.querySelector('.thumb-pic.wait') && document.querySelectorAll('.thumb:not(.fix)').length === 101, null, { timeout: 240000 });
check('101 miniaturas: sin look y 100 looks', true);
check('La foto abre sin ajuste automático', await page.evaluate(() => __lumen.S.params.auto.amount === 0 && !__lumen.S.params.fix));
check('Sugerencias visibles', (await page.$$('.thumb.fix')).length >= 1, await page.textContent('#diagRow'));
await page.tap('.thumb.fix');
await page.waitForFunction(() => window.__lumen.S.params.fix);
check('Tocar una sugerencia la aplica', true);
await page.tap('.thumb:not(.fix):nth-child(8)');
await page.waitForTimeout(300);
await page.tap('.dock-btn[data-mode="ajustes"]');
await page.waitForTimeout(300);
const layout = await page.evaluate(() => { const s = document.getElementById('stage').getBoundingClientRect(); return { stage: Math.round(s.height), share: s.height / innerHeight, knobs: document.querySelectorAll('.knob').length, dock: document.querySelectorAll('.dock-btn').length, dial: !!document.getElementById('dial') }; });
check('Ajustes dejan la foto en grande', layout.share > 0.58 && layout.knobs >= 18 && layout.dock === 5 && layout.dial, JSON.stringify(layout));
const before = await page.evaluate(() => window.__lumen.S.params.light.exposure);
const box = await page.locator('#stage').boundingBox();
await page.evaluate(({ x, y }) => {
  const stage = document.getElementById('stage');
  const fire = (type, cx) => stage.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', clientX: cx, clientY: y, isPrimary: true }));
  stage.setPointerCapture = () => {};
  fire('pointerdown', x); fire('pointermove', x + 20); fire('pointermove', x + 110); fire('pointerup', x + 110);
}, { x: box.x + box.width * 0.3, y: box.y + box.height * 0.5 });
const after = await page.evaluate(() => window.__lumen.S.params.light.exposure);
check('Deslizar sobre la foto sube el brillo', after > before, `${before} → ${after}`);
await page.tap('.knob[data-tool="a-contraste"]');
check('Cambia de herramienta sin esconder las demás', await page.evaluate(() => document.getElementById('dial').getAttribute('aria-label') === 'Contraste' && document.querySelectorAll('.knob').length >= 18));

await page.tap('#bExport');
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
  const c = document.createElement('canvas'); c.width = 4000; c.height = 3000;
  const x = c.getContext('2d'); const g = x.createLinearGradient(0, 0, 4000, 3000); g.addColorStop(0, '#2a7fd0'); g.addColorStop(1, '#f2c14e'); x.fillStyle = g; x.fillRect(0, 0, 4000, 3000);
  await window.__native.incoming({ path: c.toDataURL('image/png'), name: 'desde-galeria.png', mime: 'image/png' });
});
await page.waitForFunction(() => window.__lumen.S.name === 'desde-galeria.png' && document.querySelector('#edCanvas'), null, { timeout: 60000 });
check('Una foto compartida desde la Galería abre en el editor', true);
await page.tap('.dock-btn[data-mode="pro"]');
await page.tap('#bPro');
await page.waitForFunction(() => window.__lumen.S.proFailed === window.__lumen.S.baseId, null, { timeout: 120000 });
check('Modo Pro: sin persona lo explica y no cambia la foto', await page.evaluate(() => window.__lumen.S.params.pro.amount === 0));
await page.tap('.dock-btn[data-mode="looks"]');
await page.tap('#bExport');
await page.tap('.opt:has(strong:text-is("Redes sociales"))');
await page.tap('.step:text-is("Guardar")');
await page.waitForFunction(() => { const d = document.querySelector('#bDownload'); return d && !d.disabled && window.__lumen.S.enh.mode === 'whatsappHd' && window.__lumen.S.finalC.width === 3840; }, null, { timeout: 180000 });
check('Redes sociales: se prepara para WhatsApp HD', true);
await page.tap('#bToIg');
await page.waitForFunction(() => window.__native.to === 'com.instagram.android', null, { timeout: 120000 });
const ig = await page.evaluate(() => ({ ...window.__lumen.S.shareInfo, name: window.__native.toName, saves: window.__native.saves }));
check('Instagram: comparte en 1080 px sin guardar', ig.w === 1080 && /_instagram\.jpg$/.test(ig.name) && ig.saves === 1, JSON.stringify(ig));
await page.waitForFunction(() => !document.querySelector('#bToFb').disabled);
await page.tap('#bToFb');
await page.waitForFunction(() => window.__native.to === 'com.facebook.katana', null, { timeout: 120000 });
const fb = await page.evaluate(() => ({ ...window.__lumen.S.shareInfo, name: window.__native.toName, saves: window.__native.saves }));
check('Facebook: comparte en 2048 px sin guardar', fb.w === 2048 && /_facebook\.jpg$/.test(fb.name) && fb.saves === 1, JSON.stringify(fb));
await page.tap('.step:text-is("Calidad")');
await page.waitForSelector('.opt:has(strong:text-is("Foto de perfil"))');
await page.tap('.opt:has(strong:text-is("Foto de perfil"))');
await page.tap('.step:text-is("Guardar")');
await page.waitForFunction(() => { const d = document.querySelector('#bDownload'); return d && !d.disabled && window.__lumen.S.enh.mode === 'perfil'; }, null, { timeout: 120000 });
const social = await page.evaluate(() => ({ fmtHidden: !document.querySelector('#fmt').offsetParent, qualHidden: !document.querySelector('#qual').offsetParent, note: !!document.querySelector('#socialNote').offsetParent, name: document.querySelector('#fname').value, dims: document.querySelector('#estDims').textContent }));
check('Redes: formato definido y preparación automática', social.fmtHidden && social.qualHidden && social.note && social.name.endsWith('.jpg') && social.dims.startsWith('640×'), JSON.stringify(social));
const savesBefore = await page.evaluate(() => window.__native.saves);
await page.evaluate(() => window.__native.openCamera());
await page.waitForFunction(() => window.__lumen.CAM.stream && window.__lumen.CAM.video.videoWidth > 0, null, { timeout: 60000 });
check('Cámara: el widget la abre en vivo con todos los presets', await page.evaluate(() => document.querySelectorAll('.cam-thumb').length === 101 && getComputedStyle(document.querySelector('.top')).display === 'none'));
await page.tap('.cam-thumb[data-id="campeon"]');
await page.tap('#camShutter');
await page.waitForTimeout(300);
await page.tap('#camShutter');
check('Cámara: permite otra foto mientras guarda', await page.evaluate(() => window.__lumen.CAM.pending >= 1));
await page.waitForFunction((n) => window.__native.saves >= n + 2, savesBefore, { timeout: 180000 });
const shot = await page.evaluate(() => ({ name: window.__native.name, head: window.__native.head, mime: window.__native.mime, pending: window.__lumen.CAM.pending, info: window.__lumen.CAM.lastInfo }));
check('Cámara: guarda en segundo plano', /^LUMEN_.*campeon\.jpg$/.test(shot.name) && shot.head === 'ffd8' && shot.pending === 0, JSON.stringify(shot));
await page.tap('#camClose');
await page.waitForFunction(() => !window.__lumen.CAM.stream && window.__lumen.S.step !== 'camara');
check('Cámara: al salir se apaga', true);
check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
server.close();
if (fail.length) { console.error('Fallaron: ' + fail.join(', ')); process.exit(1); }
