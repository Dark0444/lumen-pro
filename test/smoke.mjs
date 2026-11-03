/* Prueba la app compilada en un navegador real, con el puente de Android simulado. */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const here = path.dirname(fileURLToPath(import.meta.url));
const url = pathToFileURL(path.resolve(here, '../dist/LUMEN-PRO.html')).href;
const fail = [];
const check = (name, ok, detail = '') => { console.log(`${ok ? 'OK ' : 'MAL'} ${name}${detail ? ' · ' + detail : ''}`); if (!ok) fail.push(name); };

const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const ctx = await browser.newContext({ viewport: { width: 400, height: 800 }, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => {
  const log = (window.__native = { name: null, mime: null, size: 0, head: null, saves: 0, shares: 0, exit: 0, back: null, bar: [] });
  window.Capacitor = {
    isNativePlatform: () => true,
    Plugins: {
      LumenNativo: {
        begin: async ({ name, mime }) => { log.name = name; log.mime = mime; log.size = 0; log.head = null; },
        chunk: async ({ data }) => { const raw = atob(data); if (log.head === null) log.head = raw.charCodeAt(0).toString(16) + raw.charCodeAt(1).toString(16); log.size += raw.length; },
        save: async () => { log.saves++; return { uri: 'content://prueba' }; },
        share: async () => { log.shares++; },
      },
      App: { addListener: (type, fn) => { if (type === 'backButton') log.back = fn; }, exitApp: () => { log.exit++; } },
      StatusBar: { hide: async () => log.bar.push('hide'), show: async () => log.bar.push('show') },
    },
  };
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(url);
await page.click('.btn:has-text("ejemplo")');
await page.waitForSelector('#edCanvas');
await page.waitForFunction(() => document.querySelectorAll('.thumb').length === 41 && !document.querySelector('.thumb-pic.wait'), null, { timeout: 180000 });
check('41 miniaturas con looks reales', true);
await page.tap('.thumb:nth-child(3)');
await page.waitForTimeout(300);
await page.tap('.dock-btn[data-mode="ajustes"]');
await page.waitForTimeout(200);
await page.tap('.step:text-is("Guardar")');
await page.waitForSelector('#bDownload:not([disabled])', { timeout: 60000 });
await page.tap('#bDownload');
await page.waitForFunction(() => window.__native.saves === 1, null, { timeout: 15000 });
const saved = await page.evaluate(() => ({ ...window.__native, back: null, real: 0 }));
check('Guardar pasa por el plugin de Android', saved.head === 'ffd8' && saved.size > 5000 && saved.mime === 'image/jpeg' && /\.jpg$/.test(saved.name), `${saved.name}, ${saved.size} bytes`);
const sent = await page.evaluate(() => document.getElementById('estSize').textContent);
check('El peso mostrado es el del archivo guardado', /KB|MB/.test(sent), sent);
check('Compartir disponible en Android', await page.evaluate(() => !document.getElementById('bShare').hidden));
await page.tap('#bShare');
await page.waitForFunction(() => window.__native.shares === 1, null, { timeout: 15000 });
check('Compartir pasa por el plugin de Android', true);
await page.evaluate(() => window.__native.back());
await page.waitForSelector('#edCanvas');
check('Atrás: de Guardar a Editar', true);
await page.tap('.dock-btn[data-mode="auto"]');
await page.evaluate(() => window.__native.back());
check('Atrás: cierra el panel', await page.evaluate(() => document.getElementById('studio').dataset.mode === 'looks'));
await page.evaluate(() => window.__native.back());
await page.waitForSelector('.drop');
check('Atrás: de Editar a la portada', true);
await page.evaluate(() => window.__native.back());
check('Atrás: en la portada sale de la app', await page.evaluate(() => window.__native.exit === 1));
check('Sin errores de JavaScript', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
if (fail.length) { console.error('Fallaron: ' + fail.join(', ')); process.exit(1); }
