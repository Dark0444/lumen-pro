/* LUMEN PRO · interfaz */
const LUTS = JSON.parse(document.getElementById('lut-data').textContent);
document.getElementById('lut-data').remove();
const CATS = ['moviles', 'retratos', 'viajes', 'noche', 'limpios', 'calidos', 'moody', 'cine', 'pelicula', 'vintage', 'bn'];
const STEPS = [['editar', 'Editar'], ['galeria', 'Looks'], ['mejorar', 'Calidad'], ['descargar', 'Guardar'], ['subir', 'Nueva foto']];
const $ = (s, r = document) => r.querySelector(s);
function el(tag, attrs, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (k in n && k !== 'list' && k !== 'form' && typeof v !== 'string') n[k] = v;
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) n.append(c);
  return n;
}
const ICON = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
const I = {
  undo: ICON('<path d="M8 7 4 11l4 4"/><path d="M4 11h10a5 5 0 0 1 0 10h-2"/>'),
  redo: ICON('<path d="m16 7 4 4-4 4"/><path d="M20 11H10a5 5 0 0 0 0 10h2"/>'),
  split: ICON('<path d="M12 3v18"/><rect x="3" y="5" width="18" height="14" rx="1"/>'),
  plus: ICON('<path d="M12 5v14M5 12h14"/>'), minus: ICON('<path d="M5 12h14"/>'),
  fit: ICON('<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>'),
  sun: ICON('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19"/>'),
  info: ICON('<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>'),
  star: ICON('<path d="m12 4 2.4 5 5.6.8-4 3.9.9 5.5-4.9-2.6-4.9 2.6.9-5.5-4-3.9 5.6-.8z"/>'),
  x: ICON('<path d="M6 6l12 12M18 6 6 18"/>'),
  gear: ICON('<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'),
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const nextFrame = () => new Promise((r) => { let d = false; const f = () => { if (!d) { d = true; r(); } }; requestAnimationFrame(f); setTimeout(f, 60); });
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const haptic = () => { try { if (navigator.vibrate) navigator.vibrate(8); } catch { /* opcional */ } };
function toast(msg, kind) {
  const t = el('div', { class: 'toast' + (kind === 'err' ? ' err' : ''), role: kind === 'err' ? 'alert' : 'status' }, msg);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), kind === 'err' ? 8000 : 4500);
}

const S = {
  step: 'subir', mode: 'looks', versions: [], vi: 0, baseId: 0, stripCache: new Map(), holdOrig: false, intensityById: {}, file: null, name: 'foto', bytes: 0, exif: {}, bmp: null, W: 0, H: 0,
  thumbC: null, previewC: null, thumbTex: null, previewTex: null, fullTex: null, fullUploaded: false,
  stats: null, scene: null, rank: [], recById: {}, presets: new Map(), customs: [], params: Core.defaultParams(),
  favs: new Set(), compare: new Set(), filter: 'todos', query: '', hist: [], histI: -1, tab: 'auto', zoom: 1, panX: 0, panY: 0, split: null,
  enh: { mode: 'original', engine: 'classic', src: null, w: 0, h: 0, label: 'Sin cambios', left: null }, finalC: null, finalKey: '', atmos: [0.9, 0.9, 0.9],
  sky: null, skin: null, person: null, maskW: 0, maskH: 0, showMask: 0, aiCancel: null, enhBusy: false, format: 'image/jpeg', quality: 92, keepExif: true, stripGps: true, editedSinceEnh: false,
};
LUTS.forEach((p) => S.presets.set(p.id, p));
try { S.favs = new Set(JSON.parse(localStorage.getItem('lumen.favs') || '[]')); } catch { /* sin almacenamiento */ }
const presetLabel = (p) => (p ? p.name : 'Sin look');

let R;
try { R = new Renderer(); } catch (e) { document.body.innerHTML = `<p style="padding:24px;color:#eee">${e.message}</p>`; throw e; }
R.onLost = () => toast('La tarjeta gráfica se reinició. Restaurando tu trabajo…');
R.onRestored = () => {
  S.fullTexReal = null;
  if (S.previewC) {
    S.thumbTex = R.uploadImage(S.thumbC); S.previewTex = R.uploadImage(S.previewC);
    rebuildMask();
    S.stripCache.clear();
    if (S.step === 'editar' || S.step === 'galeria') renderScreen($('#main'));
    toast('Listo: todo se restauró.');
  }
};

/* ---------- LUT ---------- */
function b64ToBytes(b) { const s = atob(b), a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
async function decodePng(blob) {
  const bmp = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' });
  const c = document.createElement('canvas');
  c.width = bmp.width; c.height = bmp.height;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(bmp, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  const w = bmp.width, h = bmp.height;
  bmp.close();
  return { rgba: new Uint8Array(d.buffer), w, h };
}
const lutLoads = new Map();
function getLut(id) {
  if (!id) return null;
  const hit = R.luts.get(id);
  if (hit) { hit.t = ++R.lutClock; return hit; }
  return null;
}
async function ensureLut(id) {
  if (!id) return null;
  const hit = getLut(id);
  if (hit) return hit;
  if (!lutLoads.has(id)) {
    lutLoads.set(id, (async () => {
      const p = S.presets.get(id);
      let cube;
      if (p.cube) cube = p.cube;
      else if (p.png || p.ref) { const png = p.png || S.presets.get(p.ref).png; const { rgba, w, h } = await decodePng(new Blob([b64ToBytes(png)], { type: 'image/png' })); cube = Core.haldToCube(rgba, w, h); }
      else return null;
      return R.bindLut(id, () => cube);
    })().finally(() => lutLoads.delete(id)));
  }
  return lutLoads.get(id);
}
function paramsFor(id) {
  const p = S.presets.get(id);
  const auto = S.params.auto;
  if (p && p.params) { const q = Core.clone(p.params); q.presetId = id; q.intensity = 100; q.xmpOverlay = true; q.auto = auto; return q; }
  const q = Core.defaultParams();
  q.presetId = id; q.intensity = 100; q.auto = auto; q.recipe = p && p.fin ? p.fin : null;
  return q;
}

/* ---------- Carga de foto ---------- */
function scaleCanvas(img, W, H, long) {
  const s = Math.min(1, long / Math.max(W, H)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(W * s)); c.height = Math.max(1, Math.round(H * s));
  const x = c.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high';
  if (s < 0.5) {
    let tmp = img, tw = W, th = H;
    while (tw * 0.5 > c.width) {
      const t = document.createElement('canvas');
      t.width = tw = Math.round(tw / 2); t.height = th = Math.round(th / 2);
      const tx = t.getContext('2d'); tx.imageSmoothingQuality = 'high'; tx.drawImage(tmp, 0, 0, tw, th);
      tmp = t;
    }
    x.drawImage(tmp, 0, 0, c.width, c.height);
  } else x.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
async function decodeFile(file) {
  const isHeic = /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name || '');
  const opts = { premultiplyAlpha: 'none', imageOrientation: 'from-image' };
  try { return await createImageBitmap(file, opts); } catch (e) {
    if (!isHeic) throw new Error('No se pudo leer esa imagen. Usa un archivo JPG, PNG, WebP o HEIC que no esté dañado.');
  }
  if (!window.heic2any) {
    try { await loadScript(VENDOR + 'heic/heic2any.min.js'); } catch {
      throw new Error('No se pudo abrir esta foto HEIC. Expórtala como JPG desde tu galería.');
    }
  }
  const out = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.97 });
  return createImageBitmap(Array.isArray(out) ? out[0] : out, opts);
}
async function loadFile(file, restore) {
  if (!file) return;
  if (file.type && !/^image\//.test(file.type) && !/\.(heic|heif)$/i.test(file.name || '')) { toast('Ese archivo no es una imagen. Sube un JPG, PNG, WebP o HEIC.', 'err'); return; }
  try {
    setBusy(true);
    const buf = new Uint8Array(await file.arrayBuffer());
    const exif = Core.readExif(buf);
    const bmp = await decodeFile(file);
    S.versions.forEach((v) => { try { v.bmp.close(); } catch { /* ya cerrado */ } });
    S.versions = [{ bmp, blob: file, label: 'Original' }];
    S.vi = 0;
    Object.assign(S, { file, name: file.name || 'foto', bytes: file.size, exif0: exif, compare: new Set(), split: null, showMask: 0, mode: 'looks', tab: 'auto', zoom: 1, panX: 0, panY: 0, intensityById: {}, filter: 'todos', query: '', announce: null });
    S.params = restore ? { ...Core.defaultParams(), ...restore } : Core.defaultParams();
    const hadAuto = !!(restore && restore.auto && restore.auto.amount === 0);
    applyBase(bmp, file, false);
    if (hadAuto) S.params.auto.amount = 0;
    S.hist = []; S.histI = -1; commit();
    S.announce = `${S.autoInfo.title}`;
    go('editar');
    detectFaces();
    IDB.set('project', { blob: file, name: S.name, params: S.params });
  } catch (e) { toast(e.message, 'err'); } finally { setBusy(false); }
}
/* Pone una imagen como base: la original o el resultado de una edición con IA. */
function applyBase(bmp, blob, isEdit) {
  const dimsChanged = bmp.width !== S.W || bmp.height !== S.H;
  S.bmp = bmp; S.W = bmp.width; S.H = bmp.height; S.bytes = blob.size || S.bytes;
  S.file = blob instanceof File ? blob : S.file;
  S.exif = isEdit ? {} : (S.exif0 || {});
  S.baseId += 1;
  S.stripCache.clear();
  S.person = null; S.personSkin = null;
  S.thumbC = scaleCanvas(bmp, S.W, S.H, 512);
  S.previewC = scaleCanvas(bmp, S.W, S.H, 1600);
  S.thumbTex = R.uploadImage(S.thumbC, S.thumbTex);
  S.previewTex = R.uploadImage(S.previewC, S.previewTex);
  if (S.fullTexReal) { R.gl.deleteTexture(S.fullTexReal); S.fullTexReal = null; }
  if (dimsChanged) S.params.geo = Core.defaultParams().geo;
  if (S.enh.src) { try { S.enh.src.close(); } catch { /* ya cerrado */ } }
  S.enh = { mode: 'original', engine: 'classic', src: null, w: 0, h: 0, label: 'Sin cambios', left: null, geoKey: JSON.stringify(S.params.geo) };
  S.enhUI = null;
  S.finalC = null; S.finalKey = '';
  analyzeBase();
}
function setBusy(b) { document.body.style.cursor = b ? 'progress' : ''; }

/* ---------- Análisis ---------- */
function sampleOf(long) {
  const c = scaleCanvas(S.previewC, S.previewC.width, S.previewC.height, long);
  const x = c.getContext('2d', { willReadFrequently: true });
  return { rgba: x.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
}
function buildMasks() {
  const m = sampleOf(512);
  S.maskW = m.w; S.maskH = m.h;
  S.skin = Core.computeSkinMask(m.rgba, m.w, m.h);
  S.sky = Core.computeSkyMask(m.rgba, m.w, m.h);
  S.person = null;
  rebuildMask();
  /* Luz atmosférica para eliminar neblina: 1 % de píxeles con canal oscuro más alto */
  const a = sampleOf(128), n = a.w * a.h, arr = [];
  for (let i = 0; i < n; i++) arr.push([Math.min(a.rgba[i * 4], a.rgba[i * 4 + 1], a.rgba[i * 4 + 2]), i]);
  arr.sort((x, y) => y[0] - x[0]);
  const k = Math.max(1, Math.floor(n * 0.01));
  let r = 0, g = 0, b = 0;
  for (let i = 0; i < k; i++) { const j = arr[i][1]; r += a.rgba[j * 4]; g += a.rgba[j * 4 + 1]; b += a.rgba[j * 4 + 2]; }
  S.atmos = [r / k / 255, g / k / 255, b / k / 255];
}
function rebuildMask() {
  if (!S.skin) return;
  const w = S.maskW, h = S.maskH, d = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const p = S.person ? S.person[i] : 0;
    d[i * 4] = p * 255;
    d[i * 4 + 1] = (S.sky ? S.sky.mask[i] : 0) * 255 * (1 - p);
    d[i * 4 + 2] = S.person ? (1 - p) * 255 : 0;
    d[i * 4 + 3] = (S.personSkin ? S.personSkin[i] : S.skin[i]) * 255;
  }
  R.setMask(d, w, h);
}
function drawHist(canvas, hist) {
  const dpr = Math.min(2, devicePixelRatio || 1), cw = canvas.clientWidth || 300, ch = canvas.clientHeight || 80;
  if (canvas.width !== Math.round(cw * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); }
  const x = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  x.clearRect(0, 0, W, H);
  const light = document.documentElement.dataset.theme === 'light';
  x.globalCompositeOperation = light ? 'multiply' : 'screen';
  let max = 1;
  for (const k of ['r', 'g', 'b']) for (let i = 2; i < 254; i++) max = Math.max(max, hist[k][i]);
  max = Math.sqrt(max);
  const cols = light ? { r: '#e0413a', g: '#2f9e44', b: '#3366dd' } : { r: '#d8473f', g: '#3fa35a', b: '#3f6fd8' };
  for (const k of ['r', 'g', 'b']) {
    x.fillStyle = cols[k];
    x.beginPath(); x.moveTo(0, H);
    for (let i = 0; i < 256; i++) x.lineTo((i / 255) * W, H - Math.min(1, Math.sqrt(hist[k][i]) / max) * (H - 2));
    x.lineTo(W, H); x.closePath(); x.fill();
  }
  x.globalCompositeOperation = 'source-over';
  x.strokeStyle = 'rgba(128,128,128,.35)'; x.lineWidth = 1;
  for (const q of [0.25, 0.5, 0.75]) { x.beginPath(); x.moveTo(q * W, 0); x.lineTo(q * W, H); x.stroke(); }
}
function histFrom(rgba, stride) {
  const h = { r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256) };
  for (let i = 0; i < rgba.length; i += 4 * stride) { h.r[rgba[i]]++; h.g[rgba[i + 1]]++; h.b[rgba[i + 2]]++; }
  return h;
}
function analyzeBase() {
  const px = sampleOf(256);
  S.stats = Core.analyzePixels(px.rgba, px.w, px.h, S.exif);
  if (S.knownFaces !== undefined && S.vi === 0) S.stats.faces = S.knownFaces;
  buildMasks();
  settleScene();
}
function settleScene() {
  S.scene = Core.classifyScene(S.stats);
  S.rank = Core.rankPresets(S.stats, S.scene, LUTS);
  S.recById = Object.fromEntries(S.rank.map((r) => [r.id, r]));
  const a = Core.autoAdjust(S.stats, S.scene);
  const { label, notes, ...values } = a;
  const amount = S.params.auto && S.params.auto.wb && S.autoInfo && S.params.auto.amount !== undefined && S.autoInfoBase === S.baseId ? S.params.auto.amount : 100;
  S.params.auto = { ...values, amount };
  S.autoInfoBase = S.baseId;
  const titles = { oscura: 'Foto oscura', clara: 'Foto clara', plana: 'Foto plana', equilibrada: 'Buena luz' };
  S.diag = Core.diagnose(S.stats, S.scene);
  S.autoInfo = { title: S.diag.summary, label: S.diag.summary, notes, scene: S.scene };
}
async function detectFaces() {
  S.knownFaces = undefined;
  const base = S.baseId;
  try {
    const n = await Promise.race([Vision.countFaces(S.previewC), wait(9000).then(() => { throw new Error('tiempo'); })]);
    if (base !== S.baseId) return;
    S.knownFaces = n;
    S.stats.faces = n;
    const before = S.scene.id;
    settleScene();
    S.stripCache.clear();
    if (S.step === 'editar') { paintPanel(); paintStrip(); requestRender(false); }
    if (before !== S.scene.id && S.step === 'editar') toast(n ? `Detecté ${n} rostro${n > 1 ? 's' : ''} y ajusté las recomendaciones.` : 'Ajusté las recomendaciones para esta foto.');
  } catch { /* sin modelo: siguen las reglas de color */ }
}

/* ---------- Render de vistas previas ---------- */
function drawPresetTo(canvas, id, tex, w, h, intensity) {
  const p = paramsFor(id), lut = getLut(id);
  R.render({ src: { tex, w, h }, params: p, lut, intensity: intensity === undefined ? 100 : intensity, outW: w, outH: h, pxW: w, pxH: h, dither: false, atmos: S.atmos, lowSrc: { tex }, maskXf: Core.IDENTITY_XF });
  const x = canvas.getContext('2d');
  x.clearRect(0, 0, canvas.width, canvas.height);
  x.drawImage(R.canvas, 0, 0, canvas.width, canvas.height);
}
/* ---------- Navegación ---------- */
function paintSteps() {
  const ol = $('#steps');
  ol.innerHTML = '';
  ol.hidden = !S.bmp;
  document.documentElement.classList.toggle('has-photo', !!S.bmp);
  if (!S.bmp) return;
  STEPS.forEach(([id, label]) => {
    const b = el('button', { class: 'step' + (S.step === id ? ' on' : ''), onclick: () => go(id), 'aria-current': S.step === id ? 'step' : null }, label);
    ol.append(el('li', {}, b));
    if (S.step === id) requestAnimationFrame(() => b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'auto' }));
  });
  $('#bUndo').hidden = $('#bRedo').hidden = S.step !== 'editar';
}
function go(step, opts) {
  S.thumbToken = null;
  const swap = () => { S.step = step; paintSteps(); renderScreen($('#main')); paintHistoryButtons(); };
  if (opts && opts.vt && document.startViewTransition && !reduced()) document.startViewTransition(swap);
  else swap();
}
function renderScreen(main) {
  main.innerHTML = '';
  const host = el('div', { class: 'screen', style: 'height:100%' });
  main.append(host);
  ({ subir: screenUpload, galeria: screenGallery, editar: screenEditor, mejorar: screenEnhance, descargar: screenDownload })[S.step](host);
}

/* ---------- Portada ---------- */
const WALL_LOOKS = ['golden-hour', 'classic-chrome', 'teal-orange', 'airy', 'moody', 'trix'];
async function screenUpload(host) {
  const input = el('input', { type: 'file', id: 'fileInput', accept: 'image/*,.heic,.heif', hidden: true, onchange: (e) => loadFile(e.target.files[0]) });
  const cam = el('input', { type: 'file', id: 'camInput', accept: 'image/*', capture: 'environment', hidden: true, onchange: (e) => loadFile(e.target.files[0]) });
  const drop = el('section', { class: 'drop', 'aria-label': 'Zona para subir la foto' },
    el('h1', { html: 'Sube una foto.<br><em>Te la dejo lista.</em>' }),
    el('p', {}, 'Detecta si está oscura, opaca o muy saturada, te sugiere cómo arreglarla y te deja deslizar entre más de 80 looks. Exporta hasta 4K, gratis y sin internet.'),
    el('div', { class: 'row' },
      el('button', { class: 'btn primary', onclick: () => input.click() }, 'Elegir foto'),
      el('button', { class: 'btn', onclick: useSample }, 'Probar con una de ejemplo'),
      el('button', { class: 'btn link', onclick: () => cam.click() }, 'Usar la cámara')),
    el('p', { class: 'hint' }, Native.on ? 'JPG, PNG, WebP y HEIC.' : 'Arrástrala aquí o pégala con Ctrl+V. JPG, PNG, WebP y HEIC.'), input, cam);
  ['dragenter', 'dragover'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));
  const wall = el('div', { class: 'wall', 'aria-hidden': 'true' });
  host.append(el('div', { class: 'upload' }, drop, wall));
  paintWall(wall);
  const prev = await IDB.get('project');
  if (prev && prev.blob && S.step === 'subir') {
    drop.append(el('div', { class: 'resume' }, el('div', {}, el('strong', {}, 'Tu último proyecto'), el('div', { class: 'hint' }, prev.name)),
      el('button', { class: 'btn small', onclick: () => { const f = new File([prev.blob], prev.name, { type: prev.blob.type }); loadFile(f, prev.params); } }, 'Continuar')));
  }
}
async function paintWall(wall) {
  try {
    const bytes = b64ToBytes(document.getElementById('sample-photo').textContent.trim());
    const bmp = await createImageBitmap(new Blob([bytes], { type: 'image/jpeg' }));
    const small = scaleCanvas(bmp, bmp.width, bmp.height, 420);
    const tex = R.uploadImage(small);
    for (const id of WALL_LOOKS) {
      const p = S.presets.get(id);
      if (!p || S.step !== 'subir') continue;
      const lut = await ensureLut(id);
      const canvas = el('canvas', { width: small.width, height: small.height });
      const q = Core.defaultParams();
      q.presetId = id; q.recipe = p.fin;
      R.render({ src: { tex, w: small.width, h: small.height }, lowSrc: { tex }, params: q, lut, intensity: 100, outW: small.width, outH: small.height, pxW: small.width, pxH: small.height, dither: false, maskXf: Core.IDENTITY_XF });
      canvas.getContext('2d').drawImage(R.canvas, 0, 0);
      wall.append(el('figure', {}, canvas, el('figcaption', {}, p.name)));
      await nextFrame();
    }
    R.gl.deleteTexture(tex);
    bmp.close();
  } catch { /* la portada funciona sin el muro */ }
}
function useSample() {
  const b = b64ToBytes(document.getElementById('sample-photo').textContent.trim());
  loadFile(new File([b], 'cafe-ejemplo.jpg', { type: 'image/jpeg' }));
}
window.addEventListener('paste', (e) => {
  if (e.target.matches && e.target.matches('input[type=text],input[type=password],input[type=search]')) return;
  const it = [...(e.clipboardData ? e.clipboardData.items : [])].find((i) => i.type.startsWith('image/'));
  if (it) { e.preventDefault(); loadFile(it.getAsFile()); }
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer && e.dataTransfer.files[0] && !(e.target.closest && e.target.closest('.drop'))) loadFile(e.dataTransfer.files[0]); });

/* ---------- Importar ---------- */
function importClick() {
  const i = el('input', { type: 'file', accept: '.cube,.png,.xmp', multiple: true, onchange: async (e) => { for (const f of e.target.files) await importPreset(f); } });
  i.click();
}
async function importPreset(f) {
  try {
    const ext = (f.name.split('.').pop() || '').toLowerCase();
    const id = 'custom-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const base = f.name.replace(/\.[^.]+$/, '');
    let p;
    if (ext === 'cube') { const c = Core.parseCube(await f.text()); p = { id, name: c.title || base, cat: 'custom', cube: { size: c.size, data: c.data }, kind: '.cube' }; }
    else if (ext === 'png') { const d = await decodePng(f); const c = Core.haldToCube(d.rgba, d.w, d.h); p = { id, name: base, cat: 'custom', cube: { size: c.size, data: c.data }, kind: 'HaldCLUT' }; }
    else if (ext === 'xmp') {
      const r = Core.parseXmp(await f.text());
      p = { id, name: r.name || base, cat: 'custom', params: r.params, kind: '.xmp' };
      showXmpReport(p.name, r);
    } else throw new Error('Formato no admitido. Usa .cube, .png (HaldCLUT) o .xmp.');
    p.custom = true;
    p.m = { bw: false };
    S.presets.set(id, p);
    S.customs.push(p);
    saveCustoms();
    toast(`Importado: ${p.name}`);
    if (S.step === 'galeria' || S.step === 'editar') go(S.step);
  } catch (e) { toast(`${f.name}: ${e.message}`, 'err'); }
}
function saveCustoms() { IDB.set('customs', S.customs.map(({ id, name, cat, kind, cube, params, m, custom }) => ({ id, name, cat, kind, cube, params, m, custom }))); }
function showXmpReport(name, r) {
  const d = el('dialog', {},
    el('div', { class: 'dlg' },
      el('h2', {}, `Preset importado: ${name}`),
      el('p', {}, 'El resultado es aproximado. Lightroom procesa el color con su propio motor y sus perfiles internos.'),
      el('h3', {}, 'Se aplicó'), el('p', {}, r.applied.length ? r.applied.join(', ') : 'Ningún ajuste distinto de cero.'),
      el('h3', {}, 'No se pudo aplicar'), el('p', {}, r.ignored.length ? r.ignored.join(', ') : 'Todos los ajustes del archivo son compatibles.'),
      el('div', { class: 'row' }, el('button', { class: 'btn primary', onclick: () => d.close() }, 'Entendido'))));
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.showModal();
}

/* ---------- Looks: selección, tira y vista de todos ---------- */
function orderedPresets() {
  const list = S.rank.map((r) => S.presets.get(r.id));
  return [...S.customs, ...list];
}
function visiblePresets() {
  const q = S.query.trim().toLowerCase();
  return orderedPresets().filter((p) => {
    if (S.filter === 'fav' && !S.favs.has(p.id)) return false;
    if (CATS.includes(S.filter) && p.cat !== S.filter) return false;
    if (S.filter === 'custom' && !p.custom) return false;
    return !q || `${p.name} ${Core.CAT_LABEL[p.cat] || ''}`.toLowerCase().includes(q);
  });
}
const lookIds = () => [null, ...visiblePresets().map((p) => p.id)];
function fitInto(w, h, cw, ch) { const k = Math.min(cw / w, ch / h); return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }; }
function lookName(id) { const p = S.presets.get(id); return p ? p.name : 'Sin look'; }
async function selectLook(id, opts = {}) {
  const prev = S.params.presetId;
  if (id) await ensureLut(id);
  const apply = () => {
    const p = id ? S.presets.get(id) : null;
    S.params.presetId = id;
    S.params.recipe = p && p.fin ? p.fin : null;
    S.params.intensity = id && S.intensityById[id] !== undefined ? S.intensityById[id] : 100;
    if (p && p.params) applyCustomParams(id, true);
    commit();
    invalidateEnh();
    paintIntensity();
    markStrip();
    showLookPill(id);
  };
  if (opts.dir && S.step === 'editar' && prev !== id) { slideStage(opts.dir, apply); return; }
  apply();
  if (S.step === 'editar') requestRender(false);
}
function toggleFix(f) {
  const on = S.params.fixId === f.id;
  S.params.fixId = on ? null : f.id;
  S.params.fix = on ? null : f.fix;
  commit();
  invalidateEnh();
  markStrip();
  showLookPill(null, on ? 'Sugerencia quitada' : f.name);
  haptic();
  if (S.step === 'editar') { if (S.tab === 'auto') paintPanel(); requestRender(false); }
}
function stepLook(d) {
  const list = lookIds();
  const i = list.indexOf(S.params.presetId);
  const next = list[((i < 0 ? 0 : i) + d + list.length) % list.length];
  haptic();
  selectLook(next, { dir: d });
}
function slideStage(dir, apply) {
  const c = $('#edCanvas');
  if (!c || reduced()) { apply(); requestRender(false); return; }
  const snap = document.createElement('canvas');
  snap.width = c.width; snap.height = c.height;
  snap.getContext('2d').drawImage(c, 0, 0);
  snap.className = 'snap';
  c.parentElement.append(snap);
  apply();
  renderEditor(false);
  c.style.transform = '';
  snap.animate([{ transform: 'translateX(0)', opacity: 1 }, { transform: `translateX(${-dir * 42}%)`, opacity: 0 }], { duration: 240, easing: 'cubic-bezier(.2,.7,.2,1)' }).onfinish = () => snap.remove();
  c.animate([{ transform: `translateX(${dir * 26}%)`, opacity: 0.2 }, { transform: 'translateX(0)', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.7,.2,1)' });
}
function showLookPill(id, text) {
  const pill = $('#lookPill');
  if (!pill) return;
  const rec = S.recById[id];
  pill.innerHTML = '';
  pill.append(el('strong', {}, text || lookName(id)));
  if (!text && id && rec && rec.recommended) pill.append(el('span', {}, 'Para esta foto'));
  pill.classList.remove('off');
  clearTimeout(S.pillT);
  S.pillT = setTimeout(() => pill.classList.add('off'), 1700);
}
function paintIntensity() {
  const row = $('#intensityRow');
  if (!row) return;
  const id = S.params.presetId;
  row.hidden = !id;
  const dr = $('#diagRow');
  if (dr) dr.hidden = !!id;
  if (!id) return;
  const range = $('#lookIntensity'), out = $('#lookIntensityOut'), name = $('#lookNow');
  range.value = S.params.intensity;
  out.textContent = `${S.params.intensity} %`;
  name.textContent = lookName(id);
  const fav = $('#lookFav');
  fav.classList.toggle('on', S.favs.has(id));
  fav.setAttribute('aria-pressed', String(S.favs.has(id)));
}
function markStrip() {
  document.querySelectorAll('.thumb.fix').forEach((t) => { const on = t.dataset.fix === S.params.fixId; t.classList.toggle('on', on); t.setAttribute('aria-pressed', String(on)); });
  document.querySelectorAll('.thumb:not(.fix)').forEach((t) => {
    const on = (t.dataset.id || null) === S.params.presetId;
    t.classList.toggle('on', on);
    t.setAttribute('aria-pressed', String(on));
    if (on) t.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduced() ? 'auto' : 'smooth' });
  });
}
function thumbCache(id) {
  const key = `${S.baseId}|${S.params.auto.amount}|${id}`;
  return { key, hit: S.stripCache.get(key) };
}
function paintStrip() {
  const strip = $('#strip');
  if (!strip) return;
  strip.innerHTML = '';
  const queue = [];
  const tw = S.thumbC.width >= S.thumbC.height ? 240 : Math.round(240 * S.thumbC.width / S.thumbC.height);
  const th = Math.round(tw * S.thumbC.height / S.thumbC.width);
  const addThumb = (id, name) => {
    const rec = S.recById[id];
    const canvas = el('canvas', { width: tw, height: th, 'aria-hidden': 'true' });
    const pic = el('span', { class: 'thumb-pic wait' }, canvas);
    const b = el('button', { class: 'thumb', 'data-id': id || '', 'aria-label': `Aplicar ${name}`, 'aria-pressed': 'false', onclick: () => selectLook(id) }, pic,
      el('span', { class: 'thumb-name' }, name), rec && rec.recommended ? el('i', { class: 'dot-rec', title: 'Recomendado para esta foto' }) : null);
    strip.append(b);
    const { key, hit } = thumbCache(id);
    if (hit) { canvas.getContext('2d').drawImage(hit, 0, 0); pic.classList.remove('wait'); } else queue.push({ id, canvas, pic, key });
  };
  const diagRow = $('#diagRow');
  if (diagRow && S.diag) { diagRow.innerHTML = ''; diagRow.append(el('span', { class: 'ai-mark', 'aria-hidden': 'true' }, '✦'), el('strong', {}, S.diag.summary), el('span', {}, 'Toca una sugerencia')); }
  if (S.filter === 'todos' && !S.query && S.diag) {
    S.diag.fixes.forEach((f) => {
      const canvas = el('canvas', { width: tw, height: th, 'aria-hidden': 'true' });
      const pic = el('span', { class: 'thumb-pic wait' }, canvas, el('i', { class: 'fix-badge', 'aria-hidden': 'true' }, '✦'));
      strip.append(el('button', { class: 'thumb fix', 'data-fix': f.id, 'aria-label': `Sugerencia: ${f.name}. ${f.issue}`, 'aria-pressed': 'false', onclick: () => toggleFix(f) }, pic, el('span', { class: 'thumb-name' }, f.name)));
      const key = `fix|${S.baseId}|${S.params.auto.amount}|${f.id}`, hit = S.stripCache.get(key);
      if (hit) { canvas.getContext('2d').drawImage(hit, 0, 0); pic.classList.remove('wait'); } else queue.unshift({ fix: f, canvas, pic, key });
    });
    strip.append(el('span', { class: 'strip-sep', 'aria-hidden': 'true' }));
  }
  addThumb(null, 'Sin look');
  visiblePresets().forEach((p) => addThumb(p.id, p.name));
  markStrip();
  generateThumbs(queue, tw, th);
}
async function generateThumbs(queue, tw, th) {
  const token = (S.thumbToken = {});
  const t0 = performance.now();
  for (const { id, fix, canvas, pic, key } of queue) {
    if (S.thumbToken !== token) return;
    try {
      if (id) await ensureLut(id);
      if (S.thumbToken !== token) return;
      const p = id ? paramsFor(id) : { ...Core.defaultParams(), auto: S.params.auto, fix: fix ? fix.fix : null };
      R.render({ src: { tex: S.thumbTex, w: S.thumbC.width, h: S.thumbC.height }, lowSrc: { tex: S.thumbTex }, params: p, lut: getLut(id), intensity: id ? 100 : 0, outW: tw, outH: th, pxW: tw, pxH: th, dither: false, atmos: S.atmos, maskXf: Core.IDENTITY_XF });
      canvas.getContext('2d').drawImage(R.canvas, 0, 0, canvas.width, canvas.height);
      const copy = document.createElement('canvas');
      copy.width = canvas.width; copy.height = canvas.height;
      copy.getContext('2d').drawImage(canvas, 0, 0);
      S.stripCache.set(key, copy);
      pic.classList.remove('wait');
    } catch (e) { toast(`No se pudo aplicar ${lookName(id)}: ${e.message}`, 'err'); }
    S.firstThumbMs = S.firstThumbMs || performance.now() - t0;
    await nextFrame();
  }
  S.allThumbsMs = performance.now() - t0;
  if (S.step === 'editar') requestRender(false);
}
function chipRow(onChange) {
  const counts = {};
  orderedPresets().forEach((p) => { counts[p.cat] = (counts[p.cat] || 0) + 1; });
  const chip = (id, label) => el('button', { class: 'chip' + (S.filter === id ? ' on' : ''), 'aria-pressed': String(S.filter === id), onclick: () => { S.filter = id; onChange(); } }, label);
  const chips = [chip('todos', 'Para ti')];
  if (S.customs.length) chips.push(chip('custom', 'Mis presets'));
  CATS.forEach((c) => chips.push(chip(c, Core.CAT_LABEL[c])));
  chips.push(chip('fav', `Favoritos${S.favs.size ? ' ' + S.favs.size : ''}`));
  return chips;
}
function toggleFav(id, btn) {
  if (S.favs.has(id)) S.favs.delete(id); else S.favs.add(id);
  try { localStorage.setItem('lumen.favs', JSON.stringify([...S.favs])); } catch { /* opcional */ }
  if (btn) { btn.classList.toggle('on', S.favs.has(id)); btn.setAttribute('aria-pressed', String(S.favs.has(id))); }
  haptic();
}
function toggleCompare(id, btn) {
  if (S.compare.has(id)) S.compare.delete(id);
  else if (S.compare.size >= 4) { toast('Puedes comparar hasta 4 looks. Quita uno para añadir otro.'); return; } else S.compare.add(id);
  if (btn) { btn.classList.toggle('on', S.compare.has(id)); btn.setAttribute('aria-pressed', String(S.compare.has(id))); }
  paintCmpBar();
}
function paintCmpBar() {
  let b = $('#cmpbar');
  if (b) b.remove();
  if (S.step !== 'galeria' || !S.compare.size) return;
  b = el('div', { class: 'cmpbar', id: 'cmpbar' }, el('span', {}, `${S.compare.size} de 4`),
    el('button', { class: 'btn small', onclick: () => { S.compare.clear(); go('galeria'); } }, 'Limpiar'),
    el('button', { class: 'btn small primary', onclick: openCompare }, 'Comparar'));
  document.body.append(b);
}
function screenGallery(host) {
  const sheet = el('div', { class: 'sheet' });
  const chips = el('div', { class: 'chips' });
  const search = el('input', { class: 'search', type: 'search', id: 'gsearch', placeholder: 'Buscar un look', 'aria-label': 'Buscar look', value: S.query });
  const paint = () => {
    chips.innerHTML = '';
    chips.append(...chipRow(paint));
    sheet.innerHTML = '';
    const vis = visiblePresets(), queue = [];
    if (!vis.length) sheet.append(el('p', { class: 'note' }, S.filter === 'fav' ? 'Todavía no tienes favoritos. Toca la estrella de un look.' : 'Ningún look coincide con esa búsqueda.'));
    const frames = el('div', { class: 'frames' });
    const tw = S.thumbC.width, th = S.thumbC.height;
    vis.forEach((p) => {
      const rec = S.recById[p.id];
      const canvas = el('canvas', { width: tw, height: th, 'aria-hidden': 'true' });
      const pic = el('div', { class: 'pic wait', style: `aspect-ratio:${tw}/${th}` }, canvas);
      const fav = el('button', { class: 'tick' + (S.favs.has(p.id) ? ' on' : ''), 'aria-label': `Favorito: ${p.name}`, 'aria-pressed': String(S.favs.has(p.id)), html: '★', onclick: (e) => { e.stopPropagation(); toggleFav(p.id, fav); } });
      const cmp = el('button', { class: 'tick' + (S.compare.has(p.id) ? ' on' : ''), 'aria-label': `Comparar: ${p.name}`, 'aria-pressed': String(S.compare.has(p.id)), html: '⊞', onclick: (e) => { e.stopPropagation(); toggleCompare(p.id, cmp); } });
      const card = el('div', { class: 'card', tabindex: '0', role: 'button', 'data-id': p.id, 'aria-label': `Ver ${p.name} en grande`, onclick: () => openLook(p.id), onkeydown: (e) => { if (e.target === card && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openLook(p.id); } } },
        pic, el('div', { class: 'card-tools' }, fav, cmp),
        el('div', { class: 'card-foot' }, el('strong', {}, p.name), rec && rec.recommended ? el('span', {}, 'Para esta foto') : el('span', {}, Core.CAT_LABEL[p.cat] || ''), rec && rec.recommended ? el('p', {}, rec.reason) : null));
      frames.append(card);
      queue.push({ id: p.id, canvas, pic, key: `grid|${S.baseId}|${S.params.auto.amount}|${p.id}` });
    });
    sheet.append(frames);
    generateThumbs(queue, tw, th);
  };
  search.addEventListener('input', () => { S.query = search.value; paint(); });
  host.append(el('div', { class: 'gal' }, el('div', { class: 'bar' }, chips, search, el('button', { class: 'btn small', onclick: importClick }, 'Importar')), sheet));
  paint();
  paintCmpBar();
}
async function openLook(id) {
  await selectLook(id);
  go('editar', { vt: true });
}
function applyCustomParams(id, replace) {
  const p = S.presets.get(id);
  if (p && p.params && replace) {
    const keep = S.params.geo, auto = S.params.auto, q = Core.clone(p.params);
    q.presetId = id; q.intensity = 100; q.geo = keep; q.auto = auto; q.xmpOverlay = true;
    S.params = q;
  }
}
async function openCompare() {
  const ids = [...S.compare];
  const n = ids.length, cols = n <= 1 ? 1 : 2;
  const grid = el('div', { class: 'cmpgrid', style: `grid-template-columns:repeat(${cols},minmax(0,1fr));grid-template-rows:repeat(${Math.ceil(n / cols)},minmax(0,1fr))` });
  const close = () => { ov.remove(); window.removeEventListener('keydown', key); };
  const key = (e) => { if (e.key === 'Escape') close(); };
  const ov = el('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Comparar looks', style: 'grid-template-rows:auto minmax(0,1fr)' },
    el('div', { class: 'ov-top' }, el('h2', {}, `Comparar ${n} look${n > 1 ? 's' : ''}`), el('button', { class: 'icon', 'aria-label': 'Cerrar', html: I.x, onclick: close })), grid);
  document.body.append(ov);
  window.addEventListener('keydown', key);
  for (const id of ids) {
    const p = S.presets.get(id);
    const c = el('canvas', { width: S.previewC.width, height: S.previewC.height });
    grid.append(el('div', { class: 'cmpcell' }, c, el('span', {}, p.name), el('button', { class: 'btn small primary', onclick: () => { close(); openLook(id); } }, 'Elegir')));
    await ensureLut(id);
    drawPresetTo(c, id, S.previewTex, S.previewC.width, S.previewC.height);
    await nextFrame();
  }
}

/* ---------- Historial ---------- */
function commit() {
  const snap = JSON.stringify(S.params);
  if (S.hist[S.histI] === snap) return;
  S.hist = S.hist.slice(0, S.histI + 1);
  S.hist.push(snap);
  if (S.hist.length > 120) S.hist.shift();
  S.histI = S.hist.length - 1;
  clearTimeout(S.saveT);
  S.saveT = setTimeout(() => { const v = S.versions[S.vi]; if (v) IDB.set('project', { blob: v.blob, name: S.name, params: S.params }); }, 600);
  paintHistoryButtons();
}
function undo(d) {
  const i = S.histI + d;
  if (i < 0 || i >= S.hist.length) return;
  S.histI = i;
  S.params = JSON.parse(S.hist[i]);
  invalidateEnh();
  if (S.step === 'editar') { paintPanel(); paintIntensity(); markStrip(); requestRender(false); paintHistoryButtons(); }
}
function paintHistoryButtons() {
  const u = $('#bUndo'), r = $('#bRedo');
  if (u) u.disabled = S.histI <= 0;
  if (r) r.disabled = S.histI >= S.hist.length - 1;
}
function invalidateEnh() { S.finalC = null; S.finalKey = ''; }
/* La mejora se calcula sobre el recorte: si cambia la geometría hay que rehacerla. Si solo cambia el color, se conserva. */
function syncEnhGeo() {
  const key = JSON.stringify(S.params.geo);
  if (S.enh.geoKey === key) return;
  const had = !!S.enh.src;
  if (S.enh.src) S.enh.src.close();
  S.enh = { mode: 'original', engine: 'classic', src: null, w: 0, h: 0, label: 'Sin cambios', left: null, geoKey: key };
  S.finalC = null; S.finalKey = '';
  if (S.enhUI) S.enhUI.mode = 'original';
  if (had) toast('Cambiaste el recorte. Vuelve a aplicar la mejora para esta nueva composición.');
}

/* ---------- Editor ---------- */
const SECTIONS = {
  luz: { title: 'Luz', key: 'light', items: [['exposure', 'Exposición', -4, 4, 0.05, ' EV'], ['contrast', 'Contraste', -100, 100, 1], ['highlights', 'Altas luces', -100, 100, 1], ['shadows', 'Sombras', -100, 100, 1], ['whites', 'Blancos', -100, 100, 1], ['blacks', 'Negros', -100, 100, 1]] },
  color: { title: 'Color', key: 'color', items: [['temp', 'Temperatura', -100, 100, 1], ['tint', 'Tinte', -100, 100, 1], ['vibrance', 'Vibrancia', -100, 100, 1], ['saturation', 'Saturación', -100, 100, 1]] },
  detalle: { title: 'Detalle', key: 'detail', items: [['sharpen', 'Nitidez', 0, 100, 1], ['clarity', 'Claridad', -100, 100, 1], ['texture', 'Textura', -100, 100, 1], ['denoise', 'Reducción de ruido', 0, 100, 1], ['dehaze', 'Eliminar neblina', -100, 100, 1]] },
  efectos: { title: 'Efectos', key: 'fx', items: [['vignette', 'Viñeta', -100, 100, 1], ['grain', 'Grano', 0, 100, 1], ['halation', 'Halación', 0, 100, 1]] },
};
const TABS = [['auto', 'Auto'], ['luz', 'Luz'], ['color', 'Color'], ['curvas', 'Curvas'], ['etalonaje', 'Etalonaje'], ['detalle', 'Detalle'], ['efectos', 'Efectos'], ['geometria', 'Geometría'], ['mascaras', 'Máscaras']];
const HSL_LABEL = ['Rojo', 'Naranja', 'Amarillo', 'Verde', 'Aguamarina', 'Azul', 'Púrpura', 'Magenta'];
const HSL_CSS = ['#d9423a', '#e88a2c', '#e7c62d', '#47a84a', '#35b5ad', '#3b6fd6', '#8c52c9', '#d04aa5'];
function sliderRow(id, label, min, max, step, get, set, unit = '') {
  const def = get.def;
  const out = el('output', { for: id });
  const r = el('input', { type: 'range', id, min, max, step, value: get(), 'aria-label': label });
  const fmt = (v) => `${Number(v) > 0 && min < 0 ? '+' : ''}${Number(v).toFixed(step < 1 ? 2 : 0)}${unit}`;
  out.textContent = fmt(get());
  r.addEventListener('input', () => { set(Number(r.value)); out.textContent = fmt(r.value); invalidateEnh(); requestRender(true); paintTabMarks(); });
  r.addEventListener('change', () => { commit(); requestRender(false); });
  const reset = () => { r.value = def === undefined ? 0 : def; set(Number(r.value)); out.textContent = fmt(r.value); haptic(); invalidateEnh(); commit(); requestRender(false); paintTabMarks(); };
  r.addEventListener('dblclick', reset);
  let last = 0;
  r.addEventListener('touchend', () => { const n = Date.now(); if (n - last < 300) reset(); last = n; }, { passive: true });
  return el('div', { class: 'ctl' }, el('label', { for: id }, label), out, r);
}
function sectionModified(tab) {
  const d = Core.defaultParams(), p = S.params;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  if (tab === 'auto') return !!p.auto.amount || !!p.fix;
  if (tab === 'luz') return !same(p.light, d.light);
  if (tab === 'color') return !same(p.color, d.color);
  if (tab === 'curvas') return !same(p.curves, d.curves);
  if (tab === 'etalonaje') return !same(p.grade, d.grade);
  if (tab === 'detalle') return !same(p.detail, d.detail);
  if (tab === 'efectos') return !same(p.fx, d.fx);
  if (tab === 'geometria') return !Core.geoIsIdentity(p.geo);
  if (tab === 'mascaras') return !same(p.masks, d.masks);
  return false;
}
function paintTabMarks() { document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('mod', sectionModified(t.dataset.tab))); }
function resetBtn(tab, fn) { return el('button', { class: 'btn small', onclick: () => { fn(); commit(); invalidateEnh(); paintPanel(); requestRender(false); } }, 'Restablecer'); }
function paintPanel() {
  const panel = $('#panel');
  if (!panel) return;
  const top = panel.scrollTop;
  panel.innerHTML = '';
  const d = Core.defaultParams(), t = S.tab;
  document.querySelectorAll('.tab').forEach((b) => { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-selected', String(b.dataset.tab === t)); });
  paintTabMarks();
  const head = (title, fn) => el('div', { class: 'panel-head' }, el('h3', {}, title), resetBtn(t, fn));
  if (t === 'auto') {
    const info = S.autoInfo, a = S.params.auto;
    panel.append(el('div', { class: 'auto-badge' }, info.label));
    const fixBox = el('div', { class: 'seg' });
    S.diag.fixes.forEach((f) => fixBox.append(el('button', { class: S.params.fixId === f.id ? 'on' : '', 'aria-pressed': String(S.params.fixId === f.id), onclick: () => { toggleFix(f); paintPanel(); } }, `✦ ${f.name}`)));
    panel.append(fixBox);
    panel.append(el('ul', { class: 'auto-list' }, info.notes.map((n) => el('li', {}, n))));
    panel.append(sliderRow('auto-amount', 'Fuerza del autoajuste', 0, 100, 1, Object.assign(() => a.amount, { def: 100 }), (v) => { S.params.auto.amount = v; S.stripCache.clear(); }, ' %'));
    const amt = $('#auto-amount', panel);
    amt.addEventListener('change', () => paintStrip());
    panel.append(el('p', { class: 'note' }, `Escena: ${info.scene.label.toLowerCase()}. ${info.scene.why}.`));
  } else if (SECTIONS[t]) {
    const s = SECTIONS[t];
    panel.append(head(s.title, () => { if (t === 'color') { const h = d.color; S.params.color = h; } else S.params[s.key] = d[s.key]; }));
    s.items.forEach(([k, label, min, max, step, unit]) => {
      const get = () => S.params[s.key][k];
      panel.append(sliderRow(`s-${k}`, label, min, max, step, get, (v) => { S.params[s.key][k] = v; }, unit));
    });
    if (t === 'color') {
      S.hslBand = S.hslBand || 0;
      const box = el('div', { style: 'display:contents' });
      const bands = el('div', { class: 'hsl-bands', role: 'group', 'aria-label': 'Banda de color' });
      HSL_LABEL.forEach((lab, i) => bands.append(el('button', { class: S.hslBand === i ? 'on' : '', title: lab, 'aria-label': lab, 'aria-pressed': String(S.hslBand === i), style: `background:${HSL_CSS[i]}`, onclick: () => { S.hslBand = i; paintPanel(); } })));
      box.append(el('div', { class: 'sub' }, `HSL · ${HSL_LABEL[S.hslBand]}`), bands);
      const i = S.hslBand, h = S.params.color.hsl;
      box.append(sliderRow('hsl-h', 'Tono', -100, 100, 1, () => h.h[i], (v) => { h.h[i] = v; }));
      box.append(sliderRow('hsl-s', 'Saturación', -100, 100, 1, () => h.s[i], (v) => { h.s[i] = v; }));
      box.append(sliderRow('hsl-l', 'Luminancia', -100, 100, 1, () => h.l[i], (v) => { h.l[i] = v; }));
      panel.append(box);
    }
  } else if (t === 'curvas') {
    panel.append(head('Curvas', () => { S.params.curves = d.curves; }));
    panel.append(curveEditor());
    panel.append(el('p', { class: 'note' }, 'Toca la curva para añadir un punto. Doble toque sobre un punto lo quita. Con el teclado, enfoca un punto y usa las flechas.'));
  } else if (t === 'etalonaje') {
    panel.append(head('Etalonaje', () => { S.params.grade = d.grade; }));
    [['shadows', 'Sombras'], ['mids', 'Medios tonos'], ['highs', 'Altas luces']].forEach(([k, label]) => {
      const g = S.params.grade[k];
      const dot = el('span', { class: 'dot', style: `background:hsl(${g.h} ${Math.max(g.s, 25)}% 50%)` });
      panel.append(el('div', { class: 'sub swatch' }, dot, label));
      panel.append(sliderRow(`g-${k}-h`, 'Tono', 0, 360, 1, Object.assign(() => g.h, { def: d.grade[k].h }), (v) => { g.h = v; dot.style.background = `hsl(${g.h} ${Math.max(g.s, 25)}% 50%)`; }, '°'));
      panel.append(sliderRow(`g-${k}-s`, 'Cantidad', 0, 100, 1, () => g.s, (v) => { g.s = v; }));
    });
  } else if (t === 'geometria') {
    panel.append(head('Geometría', () => { S.params.geo = d.geo; }));
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Proporción del recorte' });
    [['libre', 'Libre', null], ['1:1', '1:1', 1], ['4:5', '4:5', 0.8], ['3:2', '3:2', 1.5], ['16:9', '16:9', 16 / 9], ['9:16', '9:16', 9 / 16]].forEach(([id, label, ar]) => {
      seg.append(el('button', { class: S.params.geo.aspect === ar ? 'on' : '', 'aria-pressed': String(S.params.geo.aspect === ar), onclick: () => { setAspect(ar); paintPanel(); } }, label));
    });
    panel.append(el('div', { class: 'sub' }, 'Recorte'), seg);
    const out = Core.geoOutputSize(S.params.geo, S.W, S.H);
    panel.append(el('p', { class: 'note', id: 'cropInfo' }, `Resultado: ${out.w}×${out.h} px`));
    panel.append(el('div', { class: 'sub' }, 'Giro y volteo'));
    panel.append(el('div', { class: 'seg' },
      el('button', { onclick: () => rotate(-1) }, '↺ 90°'), el('button', { onclick: () => rotate(1) }, '↻ 90°'),
      el('button', { class: S.params.geo.flipH ? 'on' : '', 'aria-pressed': String(S.params.geo.flipH), onclick: () => { S.params.geo.flipH = !S.params.geo.flipH; afterGeo(); } }, 'Voltear ↔'),
      el('button', { class: S.params.geo.flipV ? 'on' : '', 'aria-pressed': String(S.params.geo.flipV), onclick: () => { S.params.geo.flipV = !S.params.geo.flipV; afterGeo(); } }, 'Voltear ↕')));
    panel.append(sliderRow('g-angle', 'Enderezar', -45, 45, 0.1, () => S.params.geo.angle, (v) => { S.params.geo.angle = v; }, '°'));
  } else if (t === 'mascaras') {
    panel.append(head('Máscaras', () => { S.params.masks = d.masks; S.showMask = 0; }));
    panel.append(el('p', { class: 'note' }, 'Ajustes locales que siguen a la persona, el cielo o el fondo.'));
    const can = { person: !!S.person, sky: S.sky && S.sky.area > 0, background: !!S.person };
    const label = { person: 'Persona', sky: 'Cielo', background: 'Fondo' };
    const idx = { person: 1, sky: 2, background: 3 };
    if (!S.person) {
      const box = el('div', { class: 'panelbox' },
        el('strong', {}, 'Detectar persona con IA'),
        el('p', { class: 'note' }, 'Descarga una vez MediaPipe y su modelo (unos 26 MB). La foto se analiza aquí y no se envía.'));
      const b = el('button', { class: 'btn small primary', id: 'bSeg', onclick: () => runSegment(b) }, 'Descargar y detectar');
      box.append(b);
      panel.append(box);
    }
    S.maskTab = S.maskTab || 'sky';
    const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Máscara' });
    ['person', 'sky', 'background'].forEach((k) => seg.append(el('button', { class: S.maskTab === k ? 'on' : '', disabled: !can[k], 'aria-pressed': String(S.maskTab === k), onclick: () => { S.maskTab = k; if (S.showMask && S.showMask !== 4) S.showMask = idx[k]; paintPanel(); requestRender(false); } }, label[k])));
    panel.append(seg);
    if (!can[S.maskTab]) panel.append(el('p', { class: 'note' }, S.maskTab === 'sky' ? 'No se encontró cielo conectado con el borde superior de esta foto.' : 'Primero detecta a la persona.'));
    else {
      const m = S.params.masks[S.maskTab];
      panel.append(el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: S.showMask === idx[S.maskTab], id: 'maskShow', onchange: (e) => { S.showMask = e.target.checked ? idx[S.maskTab] : 0; requestRender(false); } }), `Ver la máscara de ${label[S.maskTab].toLowerCase()} sobre la foto`));
      if (S.maskTab === 'sky') panel.append(el('p', { class: 'note' }, 'El cielo se detecta en tu dispositivo con reglas de color y conectividad. Revisa la máscara en fotos con mucha niebla.'));
      panel.append(sliderRow('m-exp', 'Exposición', -2, 2, 0.05, () => m.exposure, (v) => { m.exposure = v; }, ' EV'));
      panel.append(sliderRow('m-con', 'Contraste', -100, 100, 1, () => m.contrast, (v) => { m.contrast = v; }));
      panel.append(sliderRow('m-sat', 'Saturación', -100, 100, 1, () => m.saturation, (v) => { m.saturation = v; }));
      panel.append(sliderRow('m-tem', 'Temperatura', -100, 100, 1, () => m.temp, (v) => { m.temp = v; }));
    }
    panel.append(el('div', { class: 'sub' }, 'Tonos de piel'));
    panel.append(sliderRow('m-skin', 'Protección de la piel', 0, 100, 1, () => S.params.masks.skinProtect, (v) => { S.params.masks.skinProtect = v; }));
    panel.append(el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: S.showMask === 4, id: 'skinShow', onchange: (e) => { S.showMask = e.target.checked ? 4 : 0; requestRender(false); } }), 'Ver la piel detectada'));
  }
  panel.scrollTop = top;
  compactPanel(panel, t);
}
const COMPACT_TABS = new Set(['luz', 'color', 'etalonaje', 'detalle', 'efectos']);
/* En el teléfono: un solo deslizador a la vez para que la foto conserve el espacio */
function compactPanel(panel, t) {
  const st = $('#studio');
  if (st) st.dataset.sheet = t === 'curvas' ? 'tall' : COMPACT_TABS.has(t) ? 'compact' : 'mid';
  panel.classList.remove('compact');
  if (innerWidth > 900 || !COMPACT_TABS.has(t)) return;
  const ctls = [...panel.querySelectorAll('.ctl')];
  if (!ctls.length) return;
  panel.classList.add('compact');
  S.activeTool = S.activeTool || {};
  const ids = ctls.map((c) => c.querySelector('input').id);
  if (!ids.includes(S.activeTool[t])) S.activeTool[t] = ids[0];
  const pills = el('div', { class: 'tool-pills', role: 'group', 'aria-label': 'Ajuste' });
  const bands = panel.querySelector('.hsl-bands');
  const show = () => {
    ctls.forEach((c) => { c.hidden = c.querySelector('input').id !== S.activeTool[t]; });
    pills.querySelectorAll('.tool').forEach((b) => { const on = b.dataset.tool === S.activeTool[t]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
    if (bands) bands.hidden = !S.activeTool[t].startsWith('hsl-');
  };
  ctls.forEach((c) => {
    const id = c.querySelector('input').id;
    let label = c.querySelector('label').textContent;
    if (t === 'etalonaje') label = `${id.includes('shadows') ? 'Sombras' : id.includes('mids') ? 'Medios' : 'Luces'} ${id.endsWith('-h') ? 'tono' : 'cantidad'}`;
    if (id.startsWith('hsl-')) label = `HSL ${label.toLowerCase()}`;
    pills.append(el('button', { class: 'tool', 'data-tool': id, onclick: () => { S.activeTool[t] = id; show(); } }, label));
  });
  const reset = panel.querySelector('.panel-head .btn');
  if (reset) { reset.classList.add('tool-reset'); pills.append(reset); }
  panel.prepend(pills);
  show();
}
async function runSegment(btn) {
  btn.disabled = true; btn.textContent = 'Descargando modelo…';
  try {
    const r = await Vision.segment(S.previewC);
    const W = S.maskW, H = S.maskH, person = new Float32Array(W * H), skin = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const sx = Math.min(r.w - 1, Math.round((x / (W - 1 || 1)) * (r.w - 1))), sy = Math.min(r.h - 1, Math.round((y / (H - 1 || 1)) * (r.h - 1))), k = sy * r.w + sx;
      person[y * W + x] = 1 - r.bg[k]; skin[y * W + x] = r.skin[k];
    }
    S.person = person; S.personSkin = skin;
    if (![...person].some((v) => v > 0.5)) toast('El modelo no encontró a ninguna persona en esta foto.');
    rebuildMask();
    S.maskTab = 'person';
    paintPanel(); requestRender(false);
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Reintentar';
    toast('No se pudo descargar el modelo de personas. Revisa tu conexión a internet. Cielo y piel siguen disponibles sin él.', 'err');
  }
}
function rotate(d) { S.params.geo.rot90 = (S.params.geo.rot90 + d + 4) % 4; S.params.geo.crop = { x: 0, y: 0, w: 1, h: 1 }; if (S.params.geo.aspect) setAspect(S.params.geo.aspect); afterGeo(); }
function afterGeo() { commit(); invalidateEnh(); paintPanel(); paintTabMarks(); layoutCrop(); requestRender(false); }
function setAspect(ar) {
  const g = S.params.geo, f = Core.frameSize(g, S.W, S.H);
  g.aspect = ar;
  if (!ar) { commit(); layoutCrop(); return; }
  let w = 1, h = (f.w / f.h) / ar;
  if (h > 1) { w = 1 / h; h = 1; }
  g.crop = { x: (1 - w) / 2, y: (1 - h) / 2, w, h };
  commit(); invalidateEnh(); layoutCrop(); requestRender(false);
}
function curveEditor() {
  S.curveCh = S.curveCh || 'rgb';
  const seg = el('div', { class: 'seg', role: 'group', 'aria-label': 'Canal de la curva' });
  [['rgb', 'RGB'], ['r', 'Rojo'], ['g', 'Verde'], ['b', 'Azul']].forEach(([k, l]) => seg.append(el('button', { class: S.curveCh === k ? 'on' : '', 'aria-pressed': String(S.curveCh === k), onclick: () => { S.curveCh = k; paintPanel(); } }, l)));
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 256 256'); svg.setAttribute('class', 'curve'); svg.setAttribute('role', 'application'); svg.setAttribute('aria-label', 'Editor de curva tonal');
  const col = { rgb: 'var(--text)', r: '#e0534b', g: '#4cb569', b: '#5a86e8' }[S.curveCh];
  const redraw = () => {
    svg.innerHTML = '';
    const pts = S.params.curves[S.curveCh];
    [64, 128, 192].forEach((v) => {
      for (const [a, b, c, e] of [[v, 0, v, 256], [0, v, 256, v]]) {
        const l = document.createElementNS(NS, 'line');
        l.setAttribute('x1', a); l.setAttribute('y1', b); l.setAttribute('x2', c); l.setAttribute('y2', e); l.setAttribute('stroke', 'var(--line)');
        svg.append(l);
      }
    });
    const t = Core.curveToTable(pts);
    let dp = '';
    for (let i = 0; i < 256; i++) dp += `${i ? 'L' : 'M'}${i} ${256 - t[i] * 255} `;
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', dp); path.setAttribute('fill', 'none'); path.setAttribute('stroke', col); path.setAttribute('stroke-width', '2');
    svg.append(path);
    pts.forEach((pt, i) => {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', pt[0] * 255); c.setAttribute('cy', 256 - pt[1] * 255); c.setAttribute('r', 7); c.setAttribute('fill', col); c.setAttribute('stroke', 'var(--bg)'); c.setAttribute('stroke-width', 1.5);
      c.setAttribute('tabindex', '0'); c.setAttribute('role', 'slider'); c.setAttribute('aria-label', `Punto ${i + 1}`); c.setAttribute('aria-valuenow', Math.round(pt[1] * 255));
      c.dataset.i = i;
      c.addEventListener('keydown', (e) => {
        const step = e.shiftKey ? 0.05 : 0.01;
        const map = { ArrowUp: [0, step], ArrowDown: [0, -step], ArrowLeft: [-step, 0], ArrowRight: [step, 0] }[e.key];
        if (!map) return;
        e.preventDefault();
        movePoint(i, pt[0] + map[0], pt[1] + map[1]);
        redraw(); requestRender(false); invalidateEnh(); commit();
        svg.querySelector(`circle[data-i="${i}"]`).focus();
      });
      c.addEventListener('dblclick', () => { if (i > 0 && i < pts.length - 1) { pts.splice(i, 1); redraw(); requestRender(false); invalidateEnh(); commit(); paintTabMarks(); } });
      svg.append(c);
    });
  };
  const movePoint = (i, x, y) => {
    const pts = S.params.curves[S.curveCh];
    const lo = i === 0 ? 0 : pts[i - 1][0] + 0.01, hi = i === pts.length - 1 ? 1 : pts[i + 1][0] - 0.01;
    pts[i] = [Core.clamp(x, lo, hi), Core.clamp(y)];
  };
  let drag = -1;
  const pos = (e) => { const r = svg.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height]; };
  svg.addEventListener('pointerdown', (e) => {
    const [x, y] = pos(e), pts = S.params.curves[S.curveCh];
    let best = -1, bd = 0.05;
    pts.forEach((p, i) => { const d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = i; } });
    if (best < 0) {
      pts.push([Core.clamp(x), Core.clamp(y)]);
      pts.sort((a, b) => a[0] - b[0]);
      best = pts.findIndex((p) => p[0] === Core.clamp(x));
    }
    drag = best;
    svg.setPointerCapture(e.pointerId);
    redraw(); paintTabMarks(); requestRender(true);
  });
  svg.addEventListener('pointermove', (e) => { if (drag < 0) return; const [x, y] = pos(e); movePoint(drag, x, y); redraw(); invalidateEnh(); requestRender(true); });
  const end = () => { if (drag >= 0) { drag = -1; commit(); paintTabMarks(); requestRender(false); } };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  redraw();
  return el('div', { style: 'display:flex;flex-direction:column;gap:8px' }, seg, svg);
}

let rafPending = false, wantLow = false, settleT = null, lastHist = 0;
function requestRender(low) {
  wantLow = !!low;
  clearTimeout(settleT);
  if (low) settleT = setTimeout(() => requestRender(false), 180);
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => { rafPending = false; renderEditor(wantLow); });
  setTimeout(() => { if (rafPending) { rafPending = false; renderEditor(wantLow); } }, 80);
}
function viewGeo() {
  if (S.tab === 'geometria' && (innerWidth > 900 || S.mode === 'recortar')) return { ...S.params.geo, crop: { x: 0, y: 0, w: 1, h: 1 } };
  return S.params.geo;
}
function editorRect() {
  const c = $('#edCanvas');
  if (!c) return null;
  const box = c.parentElement.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
  const cw = Math.max(1, Math.round(box.width * dpr)), ch = Math.max(1, Math.round(box.height * dpr));
  const g = viewGeo(), out = Core.geoOutputSize(g, S.W, S.H);
  const pad = S.tab === 'geometria' ? 24 * dpr : 0;
  const fit = Math.min((cw - pad * 2) / out.w, (ch - pad * 2) / out.h);
  const ds = fit * S.zoom;
  const dw = out.w * ds, dh = out.h * ds;
  return { c, cw, ch, dpr, out, ds, fit, dw, dh, dx: (cw - dw) / 2 + S.panX * dpr, dy: (ch - dh) / 2 + S.panY * dpr, g };
}
function ensureFullTex() {
  if (S.fullTexReal) return S.fullTexReal;
  const max = R.maxTex;
  const img = S.W <= max && S.H <= max ? S.bmp : scaleCanvas(S.bmp, S.W, S.H, max);
  S.fullTexReal = R.uploadImage(img);
  return S.fullTexReal;
}
function renderEditor(low) {
  const r = editorRect();
  if (!r || S.step !== 'editar') return;
  const { c, cw, ch, ds, dw, dh, dx, dy, out, g, dpr } = r;
  if (c.width !== cw || c.height !== ch) { c.width = cw; c.height = ch; }
  const x0 = Math.max(0, dx), y0 = Math.max(0, dy), x1 = Math.min(cw, dx + dw), y1 = Math.min(ch, dy + dh);
  if (x1 <= x0 || y1 <= y0) return;
  const id = S.params.presetId, lut = getLut(id);
  if (id && !lut && S.presets.get(id) && !S.presets.get(id).params) { ensureLut(id).then(() => requestRender(low)); return; }
  const q = low && Math.max(x1 - x0, y1 - y0) > 900 ? 0.5 : 1;
  const pxW = Math.max(1, Math.round((x1 - x0) * q)), pxH = Math.max(1, Math.round((y1 - y0) * q));
  const previewEnough = ds <= S.previewC.width / S.W + 1e-3;
  const usePrev = low || previewEnough;
  const tex = usePrev ? S.previewTex : ensureFullTex();
  const texW = usePrev ? S.previewC.width : Math.min(S.W, R.maxTex), texH = usePrev ? S.previewC.height : Math.min(S.H, R.maxTex);
  const xf = Core.geoMatrix(g, S.W, S.H);
  const split = S.holdOrig ? 2 : S.split === null || S.split === undefined ? null : Core.clamp((S.split * cw - dx) / dw);
  R.render({
    src: { tex, w: texW, h: texH }, lowSrc: { tex: S.previewTex }, srcXf: xf, lowXf: xf, maskXf: xf, params: S.params, lut, intensity: id ? S.params.intensity : 0, outW: out.w, outH: out.h,
    tile: [(x0 - dx) / dw, (y0 - dy) / dh, (x1 - x0) / dw, (y1 - y0) / dh], pxW, pxH, split, showMask: S.showMask, atmos: S.atmos,
  });
  const x = c.getContext('2d');
  x.clearRect(0, 0, cw, ch);
  x.imageSmoothingQuality = 'high';
  x.drawImage(R.canvas, x0, y0, x1 - x0, y1 - y0);
  const now = performance.now();
  if (!low || now - lastHist > 140) {
    lastHist = now;
    const h = $('#edHist');
    if (h) {
      const d = R.read();
      drawHist(h, histFrom(d, Math.max(1, Math.round(pxW * pxH / 60000))));
    }
  }
  const line = $('#splitLine');
  if (line) {
    line.hidden = S.split === null;
    if (S.split !== null) line.style.left = `calc(${S.split * 100}% - 1px)`;
    $('#tagB').hidden = S.split === null; $('#tagA').hidden = S.split === null;
  }
  layoutCrop();
}
function layoutCrop() {
  const box = $('#cropBox');
  if (!box) return;
  const r = editorRect();
  if (!r || S.tab !== 'geometria' || (innerWidth <= 900 && S.mode !== 'recortar')) { box.hidden = true; return; }
  box.hidden = false;
  const cr = S.params.geo.crop;
  box.style.left = (r.dx + cr.x * r.dw) / r.dpr + 'px';
  box.style.top = (r.dy + cr.y * r.dh) / r.dpr + 'px';
  box.style.width = (cr.w * r.dw) / r.dpr + 'px';
  box.style.height = (cr.h * r.dh) / r.dpr + 'px';
  const info = $('#cropInfo');
  if (info) { const o = Core.geoOutputSize(S.params.geo, S.W, S.H); info.textContent = `Resultado: ${o.w}×${o.h} px`; }
}
/* ---------- Estudio: foto en grande, deslizar, instrucciones y herramientas ---------- */
function screenEditor(host) {
  const canvas = el('canvas', { id: 'edCanvas', style: 'view-transition-name:hero', role: 'img', 'aria-label': 'Foto en edición' });
  const stage = el('div', { class: 'stage', id: 'stage', tabindex: '0', 'aria-label': 'Foto. Desliza para cambiar de look, mantén pulsado para ver el original y usa las flechas del teclado.' }, canvas,
    el('div', { id: 'splitLine', class: 'splitline', hidden: true, role: 'slider', 'aria-label': 'Divisor antes y después', tabindex: '0' }),
    el('span', { id: 'tagB', class: 'splittag', style: 'left:12px', hidden: true }, 'Antes'),
    el('span', { id: 'tagA', class: 'splittag', style: 'right:12px', hidden: true }, 'Después'),
    el('div', { id: 'lookPill', class: 'look-pill off', 'aria-live': 'polite' }),
    el('div', { id: 'origPill', class: 'look-pill', hidden: true }, el('strong', {}, 'Original')),
    el('button', { class: 'nav l', 'aria-label': 'Look anterior', onclick: () => stepLook(-1) }, '‹'),
    el('button', { class: 'nav r', 'aria-label': 'Look siguiente', onclick: () => stepLook(1) }, '›'),
    el('div', { class: 'stage-tools' },
      el('button', { class: 'glass', id: 'bSplit', html: I.split, 'aria-label': 'Antes y después', title: 'Antes y después (\\)', onclick: toggleSplit }),
      el('button', { class: 'glass', id: 'bFull', html: I.fit, 'aria-label': 'Pantalla completa', title: 'Pantalla completa (F)', onclick: toggleImmersive })));
  const cropBox = el('div', { class: 'crop', id: 'cropBox', hidden: true }, ...['nw', 'n', 'ne', 'w', 'e', 'sw', 's', 'se'].map((h) => el('i', { 'data-h': h, style: handleStyle(h) })));
  stage.append(cropBox);

  const stripChips = el('div', { class: 'chips', id: 'stripChips' });
  const paintChips = () => { stripChips.innerHTML = ''; stripChips.append(...chipRow(() => { paintChips(); paintStrip(); })); };
  const range = el('input', { type: 'range', id: 'lookIntensity', min: 0, max: 100, step: 1, value: S.params.intensity, 'aria-label': 'Intensidad del look' });
  range.addEventListener('input', () => { S.params.intensity = Number(range.value); S.intensityById[S.params.presetId] = S.params.intensity; $('#lookIntensityOut').textContent = `${range.value} %`; invalidateEnh(); requestRender(true); });
  range.addEventListener('change', () => { commit(); requestRender(false); });
  range.addEventListener('dblclick', () => { range.value = 100; range.dispatchEvent(new Event('input')); range.dispatchEvent(new Event('change')); });
  const intensity = el('div', { id: 'intensityRow', class: 'intensity' },
    el('strong', { id: 'lookNow' }), range, el('output', { id: 'lookIntensityOut', for: 'lookIntensity' }),
    el('button', { class: 'icon', id: 'lookFav', html: I.star, 'aria-label': 'Favorito', onclick: (e) => { if (S.params.presetId) toggleFav(S.params.presetId, e.currentTarget); } }));
  const diag = el('div', { class: 'diag', id: 'diagRow' });
  const strip = el('div', { class: 'strip', id: 'strip', role: 'group', 'aria-label': 'Sugerencias y looks' });
  const stripWrap = el('div', { class: 'strip-wrap' }, intensity, diag, stripChips, strip);

  const dock = el('nav', { class: 'dock', 'aria-label': 'Herramientas' },
    [['looks', 'Looks'], ['auto', 'Auto'], ['ajustes', 'Ajustes'], ['recortar', 'Recortar']].map(([id, label]) => el('button', { class: 'dock-btn', 'data-mode': id, onclick: () => setMode(id) }, label)));

  const tabs = el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Secciones de edición' }, TABS.map(([id, label]) => el('button', { class: 'tab', role: 'tab', 'data-tab': id, onclick: () => setTab(id) }, label)));
  const side = el('aside', { class: 'side' },
    el('div', { class: 'side-head' }, el('canvas', { class: 'hist', id: 'edHist', role: 'img', 'aria-label': 'Histograma en vivo' })), tabs, el('div', { class: 'panel', id: 'panel', role: 'tabpanel' }));
  const studio = el('div', { class: 'studio', id: 'studio', 'data-mode': S.mode || 'looks' },
    el('section', { class: 'st-main' }, stage, stripWrap, dock), side);
  host.append(studio);
  bindStage(stage);
  bindCrop(cropBox);
  paintChips();
  paintPanel();
  paintHistoryButtons();
  paintIntensity();
  paintDock();
  paintStrip();
  new ResizeObserver(() => requestRender(false)).observe(stage);
  requestRender(false);
  if (S.announce) { const a = S.announce; S.announce = null; setTimeout(() => showLookPill(null, a), 250); }
}
function setTab(id) {
  S.tab = id;
  if (id === 'geometria') { S.zoom = 1; S.panX = S.panY = 0; }
  paintPanel();
  requestRender(false);
}
function setMode(id) {
  S.mode = id;
  const st = $('#studio');
  if (st) st.dataset.mode = id;
  if (id === 'auto') setTab('auto');
  else if (id === 'recortar') setTab('geometria');
  else if (id === 'ajustes') setTab(S.tab === 'auto' || S.tab === 'geometria' ? 'luz' : S.tab);
  else if (S.tab === 'geometria') setTab('luz');
  paintDock();
  requestRender(false);
}
function paintDock() { document.querySelectorAll('.dock-btn').forEach((b) => { const on = b.dataset.mode === (S.mode || 'looks'); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }); }
function toggleImmersive() {
  const on = document.documentElement.classList.toggle('immersive');
  if (Native.on) {
    const bar = Capacitor.Plugins.StatusBar;
    if (bar) (on ? bar.hide() : bar.show()).catch(() => {});
    requestRender(false);
    return;
  }
  try {
    if (on && document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    else if (!on && document.fullscreenElement) document.exitFullscreen().catch(() => {});
  } catch { /* opcional */ }
  requestRender(false);
}
document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && document.documentElement.classList.contains('immersive')) { document.documentElement.classList.remove('immersive'); requestRender(false); } });
function handleStyle(h) {
  const m = { n: 'left:50%;top:0', s: 'left:50%;top:100%', w: 'left:0;top:50%', e: 'left:100%;top:50%', nw: 'left:0;top:0', ne: 'left:100%;top:0', sw: 'left:0;top:100%', se: 'left:100%;top:100%' };
  return m[h] + `;cursor:${h}-resize`;
}
function toggleSplit() { S.split = S.split === null ? 0.5 : null; const b = $('#bSplit'); if (b) b.classList.toggle('on', S.split !== null); requestRender(false); }
function zoomBy(f) { S.zoom = Core.clamp(S.zoom * f, 1, 16); if (S.zoom === 1) { S.panX = S.panY = 0; } requestRender(false); }
function bindStage(stage) {
  const pts = new Map();
  let start = null, splitDrag = false, holdT = null, lastTap = 0;
  const canvas = $('#edCanvas', stage);
  stage.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = editorRect(); if (!r) return;
    const old = S.zoom;
    S.zoom = Core.clamp(S.zoom * Math.exp(-e.deltaY * 0.0016), 1, 16);
    const box = stage.getBoundingClientRect();
    const cx = e.clientX - box.left - box.width / 2, cy = e.clientY - box.top - box.height / 2, k = S.zoom / old;
    S.panX = cx - (cx - S.panX) * k; S.panY = cy - (cy - S.panY) * k;
    if (S.zoom === 1) S.panX = S.panY = 0;
    requestRender(true);
  }, { passive: false });
  const endHold = () => { clearTimeout(holdT); if (S.holdOrig) { S.holdOrig = false; $('#origPill').hidden = true; requestRender(false); } };
  stage.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.crop,button')) return;
    stage.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (e.target.id === 'splitLine') { splitDrag = true; return; }
    if (pts.size === 2) { clearTimeout(holdT); const [a, b] = [...pts.values()]; start = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), zoom: S.zoom }; return; }
    start = { x: e.clientX, y: e.clientY, px: S.panX, py: S.panY, moved: false };
    if (S.tab !== 'geometria') holdT = setTimeout(() => { if (start && !start.moved) { S.holdOrig = true; $('#origPill').hidden = false; haptic(); requestRender(false); } }, 240);
    stage.classList.add('pan');
  });
  stage.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (splitDrag) { const b = stage.getBoundingClientRect(); S.split = Core.clamp((e.clientX - b.left) / b.width, 0, 1); requestRender(true); return; }
    if (pts.size === 2 && start && start.d) { const [a, b] = [...pts.values()]; S.zoom = Core.clamp(start.zoom * Math.hypot(a[0] - b[0], a[1] - b[1]) / start.d, 1, 16); requestRender(true); return; }
    if (!start || start.x === undefined) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.hypot(dx, dy) > 8) { start.moved = true; clearTimeout(holdT); }
    if (S.zoom > 1) { S.panX = start.px + dx; S.panY = start.py + dy; requestRender(true); } else if (S.tab !== 'geometria' && !S.holdOrig && start.moved) canvas.style.transform = `translateX(${dx * 0.35}px)`;
  });
  const end = (e) => {
    const s = start, wasHold = S.holdOrig;
    pts.delete(e.pointerId); splitDrag = false; start = null; stage.classList.remove('pan');
    endHold();
    canvas.style.transform = '';
    if (s && s.x !== undefined && e.type === 'pointerup' && !wasHold) {
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (S.zoom === 1 && S.tab !== 'geometria' && Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy)) { stepLook(dx < 0 ? 1 : -1); return; }
      if (!s.moved) {
        const now = Date.now();
        if (now - lastTap < 300) { S.zoom = S.zoom > 1 ? 1 : 2.5; if (S.zoom === 1) S.panX = S.panY = 0; lastTap = 0; } else lastTap = now;
      }
    }
    requestRender(false);
  };
  stage.addEventListener('pointerup', end);
  stage.addEventListener('pointercancel', end);
}
function bindCrop(box) {
  let start = null;
  box.addEventListener('pointerdown', (e) => {
    box.setPointerCapture(e.pointerId);
    e.preventDefault();
    start = { h: e.target.dataset.h || 'move', x: e.clientX, y: e.clientY, c: { ...S.params.geo.crop } };
  });
  box.addEventListener('pointermove', (e) => {
    if (!start) return;
    const r = editorRect(); if (!r) return;
    const dx = ((e.clientX - start.x) * r.dpr) / r.dw, dy = ((e.clientY - start.y) * r.dpr) / r.dh, c = { ...start.c }, h = start.h, ar = S.params.geo.aspect;
    if (h === 'move') { c.x = Core.clamp(c.x + dx, 0, 1 - c.w); c.y = Core.clamp(c.y + dy, 0, 1 - c.h); } else {
      const MIN = 0.03;
      let l = c.x, t = c.y, rt = c.x + c.w, b = c.y + c.h;
      if (h.includes('w')) l = Core.clamp(l + dx, 0, rt - MIN);
      if (h.includes('e')) rt = Core.clamp(rt + dx, l + MIN, 1);
      if (h.includes('n')) t = Core.clamp(t + dy, 0, b - MIN);
      if (h.includes('s')) b = Core.clamp(b + dy, t + MIN, 1);
      if (ar) {
        const f = Core.frameSize(S.params.geo, S.W, S.H), k = ar * f.h / f.w;
        let w = rt - l, hh = b - t;
        if (h === 'n' || h === 's') w = hh * k; else hh = w / k;
        if (h.includes('n')) t = b - hh; else b = t + hh;
        if (h.includes('w')) l = rt - w; else rt = l + w;
        if (l < 0 || t < 0 || rt > 1 || b > 1) return;
      }
      c.x = l; c.y = t; c.w = rt - l; c.h = b - t;
    }
    S.params.geo.crop = c;
    layoutCrop();
  });
  const end = () => { if (start) { start = null; commit(); invalidateEnh(); paintTabMarks(); } };
  box.addEventListener('pointerup', end);
  box.addEventListener('pointercancel', end);
}
let lastCompact = innerWidth <= 900;
window.addEventListener('resize', () => { const now = innerWidth <= 900; if (now !== lastCompact && S.step === 'editar') { lastCompact = now; paintPanel(); } });
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && document.documentElement.classList.contains('immersive')) { toggleImmersive(); return; }
  if (e.target.matches && e.target.matches('input[type=text],input[type=search],input[type=password],select')) return;
  if (S.step !== 'editar' || document.querySelector('.overlay,dialog[open]')) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(e.shiftKey ? 1 : -1); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') { e.preventDefault(); undo(1); return; }
  if (e.target.matches && e.target.matches('input[type=range]')) return;
  if (e.key === 'ArrowRight') { e.preventDefault(); stepLook(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); stepLook(-1); } else if (e.key === '\\') toggleSplit();
  else if (e.key === 'f' || e.key === 'F') toggleImmersive();
  else if (e.key === '+' || e.key === '=') zoomBy(1.3);
  else if (e.key === '-') zoomBy(1 / 1.3);
  else if (e.key === '0') { S.zoom = 1; S.panX = S.panY = 0; requestRender(false); }
});

/* ---------- Render final ---------- */
function paramsKey() { return JSON.stringify([S.params, S.enh.src ? S.enh.id : 0, S.enh.mode]); }
async function renderFinal(params, opt = {}) {
  const lut = params.presetId && S.presets.get(params.presetId) && !S.presets.get(params.presetId).params ? await ensureLut(params.presetId) : null;
  const geo = params.geo;
  const hasEnh = !!S.enh.src && !opt.noEnh;
  const source = hasEnh ? S.enh.src : S.bmp;
  const srcW = source.width, srcH = source.height;
  const geoXf = Core.geoMatrix(geo, S.W, S.H);
  const size = hasEnh ? { w: srcW, h: srcH } : Core.geoOutputSize(geo, S.W, S.H);
  const srcXf = hasEnh ? Core.IDENTITY_XF : geoXf;
  const maxTile = opt.maxTile || Math.min(R.maxTex, 2048);
  const rotated = !hasEnh && (geo.angle !== 0);
  const tileSide = rotated ? Math.floor(maxTile / 1.5) : maxTile;
  const out = document.createElement('canvas');
  out.width = size.w; out.height = size.h;
  const ctx = out.getContext('2d', { willReadFrequently: true });
  const tiles = Core.planTiles(size.w, size.h, tileSide, 0);
  const oneToOne = !rotated && Math.abs(srcW * Math.hypot(srcXf[0], srcXf[3]) - size.w) < 1e-6 && Math.abs(srcH * Math.hypot(srcXf[1], srcXf[4]) - size.h) < 1e-6;
  const wholeFits = srcW <= R.maxTex && srcH <= R.maxTex && !opt.maxTile;
  let wholeTex = null;
  if (wholeFits) wholeTex = R.uploadImage(source);
  try {
    for (const t of tiles) {
      if (opt.signal && opt.signal.cancelled) throw Object.assign(new Error('Cancelado'), { cancelled: true });
      const tile = [t.x / size.w, t.y / size.h, t.w / size.w, t.h / size.h];
      let tex = wholeTex, sub = [0, 0, 1, 1], tempTex = null;
      if (!wholeFits) {
        const cs = [[tile[0], tile[1]], [tile[0] + tile[2], tile[1]], [tile[0], tile[1] + tile[3]], [tile[0] + tile[2], tile[1] + tile[3]]].map(([u, v]) => Core.applyXf(srcXf, u, v));
        const xs = cs.map((c) => c[0] * srcW), ys = cs.map((c) => c[1] * srcH), pad = 8;
        const sx = Math.max(0, Math.floor(Math.min(...xs)) - pad), sy = Math.max(0, Math.floor(Math.min(...ys)) - pad);
        const ex = Math.min(srcW, Math.ceil(Math.max(...xs)) + pad), ey = Math.min(srcH, Math.ceil(Math.max(...ys)) + pad);
        const piece = await createImageBitmap(source, sx, sy, ex - sx, ey - sy, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
        tempTex = R.uploadImage(piece);
        piece.close();
        tex = tempTex;
        sub = [sx / srcW, sy / srcH, (ex - sx) / srcW, (ey - sy) / srcH];
      }
      const ok = R.render({
        src: { tex, sub, nearest: oneToOne, w: srcW, h: srcH }, lowSrc: { tex: S.previewTex }, lowXf: geoXf, srcXf, maskXf: geoXf, params, lut, intensity: params.presetId ? params.intensity : 0,
        outW: size.w, outH: size.h, tile, pxW: t.w, pxH: t.h, tetra: true, atmos: S.atmos,
      });
      if (!ok) throw new Error('La tarjeta gráfica se reinició durante la exportación. Inténtalo de nuevo.');
      const px = R.read();
      ctx.putImageData(new ImageData(px, t.w, t.h), t.x, t.y);
      if (tempTex) R.gl.deleteTexture(tempTex);
      if (opt.onTile) opt.onTile();
      if (tiles.length > 1) await nextFrame();
    }
  } finally {
    if (wholeTex) R.gl.deleteTexture(wholeTex);
  }
  R.canvas.width = 4; R.canvas.height = 4;
  return out;
}
/* Nitidez de salida: se aplica al final para que el resultado quede limpio y sin halos */
async function finishSharp(canvas) {
  const amount = S.enh && S.enh.cas;
  if (!amount) return canvas;
  const x = canvas.getContext('2d', { willReadFrequently: true });
  const data = x.getImageData(0, 0, canvas.width, canvas.height);
  const out = await sharpenWorker(data.data, canvas.width, canvas.height, amount);
  x.putImageData(new ImageData(out, canvas.width, canvas.height), 0, 0);
  return canvas;
}
async function ensureFinal() {
  syncEnhGeo();
  const key = paramsKey();
  if (S.finalC && S.finalKey === key) return S.finalC;
  S.finalC = await finishSharp(await renderFinal(S.params));
  S.finalKey = key;
  return S.finalC;
}
async function neutralCrop() {
  if (Core.geoIsIdentity(S.params.geo)) {
    const c = document.createElement('canvas');
    c.width = S.W; c.height = S.H;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.drawImage(S.bmp, 0, 0);
    return c;
  }
  const p = Core.defaultParams();
  p.geo = S.params.geo;
  return renderFinal(p, { noEnh: true });
}

/* ---------- Mejorar ---------- */
const QUALITY_OPTS = [
  ['original', 'Original', 'Tu foto tal como la subiste, con tus ajustes.'],
  ['detail', 'Máxima nitidez', 'Mismo tamaño, con más definición y menos ruido.'],
  ['1080p', '1080p', 'Lado largo de 1920 px. Ideal para redes.'],
  ['4k', '4K', 'Lado largo de 3840 px. La mayor calidad.'],
];
function planText(plan, w, h) {
  if (plan.kind === 'none') return 'Se conserva la resolución que subiste.';
  if (plan.kind === 'resize') return `Tu foto mide ${w}×${h} px y sobra resolución. La llevo a ${plan.w}×${plan.h} con reescalado de alta calidad y nitidez limpia.`;
  if (plan.kind === 'fusion') return `Combino tu foto de ${w}×${h} px con reconstrucción de detalle. Se quita el ruido y se conserva la textura real.`;
  return `Tu foto mide ${w}×${h} px. Reconstruyo el detalle hasta ${plan.w}×${plan.h} con la IA incluida en la app.`;
}
function screenEnhance(host) {
  syncEnhGeo();
  const crop = Core.geoOutputSize(S.params.geo, S.W, S.H);
  const ui = S.enhUI = S.enhUI && S.enhUI.mode ? S.enhUI : { mode: S.enh.mode || 'original' };
  const opts = el('div', { class: 'opts', role: 'radiogroup', 'aria-label': 'Calidad final' });
  const paintOpts = () => {
    opts.innerHTML = '';
    QUALITY_OPTS.forEach(([id, label, desc]) => {
      const t = Core.targetDims(crop.w, crop.h, id);
      opts.append(el('button', { class: 'opt' + (ui.mode === id ? ' on' : ''), role: 'radio', 'aria-checked': String(ui.mode === id), onclick: () => { ui.mode = id; paintOpts(); paintEngine(); } }, el('strong', {}, label), el('em', {}, `${t.w}×${t.h}`), el('small', {}, desc)));
    });
  };
  const engineBox = el('div', { style: 'display:flex;flex-direction:column;gap:10px' });
  const status = el('div', { style: 'display:contents' });
  const paintEngine = () => {
    engineBox.innerHTML = ''; status.innerHTML = '';
    const plan = Core.qualityPlan(crop.w, crop.h, ui.mode);
    engineBox.append(el('p', { class: 'note' }, planText(plan, crop.w, crop.h)));
    engineBox.append(el('button', { class: 'btn primary', id: 'bApply', onclick: () => applyEnhance(ui, status) }, ui.mode === 'original' ? 'Usar esta calidad' : `Mejorar a ${plan.w}×${plan.h}`));
  };
  const canvasL = el('canvas', { id: 'cmpL', role: 'img', 'aria-label': 'Original' });
  const canvasR = el('canvas', { id: 'cmpR', role: 'img', 'aria-label': 'Resultado' });
  const tagL = el('span', {}, 'Original'), tagR = el('span', { id: 'cmpTagR' }, 'Resultado');
  const panes = el('div', { class: 'cmp-panes' }, el('div', { class: 'pane' }, canvasL, tagL), el('div', { class: 'pane' }, canvasR, tagR));
  const zoomVal = el('span', { class: 'zoomval', id: 'cmpZoom' }, '100 %');
  const cz = { zoom: 1, x: 0.5, y: 0.5 };
  const drawCmp = () => {
    const left = S.enh.left || S.previewC, right = S.finalC;
    if (!right) return;
    zoomVal.textContent = `${Math.round(cz.zoom * 100)} %`;
    const paint = (c, img, sourceW, sourceH) => {
      const b = c.parentElement.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1), cw = Math.max(1, Math.round(b.width * dpr)), ch = Math.max(1, Math.round(b.height * dpr));
      if (c.width !== cw) { c.width = cw; c.height = ch; }
      const x = c.getContext('2d');
      x.clearRect(0, 0, cw, ch);
      const fit = Math.min(cw / right.width, ch / right.height) * cz.zoom;
      const dw = right.width * fit, dh = right.height * fit, ox = cw / 2 - cz.x * dw, oy = ch / 2 - cz.y * dh;
      x.imageSmoothingEnabled = fit < 2;
      x.imageSmoothingQuality = 'high';
      x.drawImage(img, 0, 0, sourceW, sourceH, ox, oy, dw, dh);
    };
    paint(canvasL, left, left.width, left.height);
    paint(canvasR, right, right.width, right.height);
  };
  S.drawCmp = drawCmp;
  panes.addEventListener('wheel', (e) => { e.preventDefault(); cz.zoom = Core.clamp(cz.zoom * Math.exp(-e.deltaY * 0.0016), 1, 16); if (cz.zoom === 1) { cz.x = cz.y = 0.5; } drawCmp(); }, { passive: false });
  const pts = new Map();
  let st = null;
  panes.addEventListener('pointerdown', (e) => {
    panes.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; st = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: cz.zoom }; } else st = { x: e.clientX, y: e.clientY, cx: cz.x, cy: cz.y };
  });
  panes.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId) || !st) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && st.d) { const [a, b] = [...pts.values()]; cz.zoom = Core.clamp(st.z * Math.hypot(a[0] - b[0], a[1] - b[1]) / st.d, 1, 16); drawCmp(); return; }
    if (st.x !== undefined && S.finalC) {
      const pb = canvasR.getBoundingClientRect(), fit = Math.min(pb.width / S.finalC.width, pb.height / S.finalC.height) * cz.zoom;
      cz.x = Core.clamp(st.cx - (e.clientX - st.x) / (S.finalC.width * fit)); cz.y = Core.clamp(st.cy - (e.clientY - st.y) / (S.finalC.height * fit));
      drawCmp();
    }
  });
  const endP = (e) => { pts.delete(e.pointerId); st = null; };
  panes.addEventListener('pointerup', endP);
  panes.addEventListener('pointercancel', endP);
  const toolbar = el('div', { class: 'tools' }, el('button', { class: 'icon', 'aria-label': 'Alejar', html: I.minus, onclick: () => { cz.zoom = Core.clamp(cz.zoom / 1.4, 1, 16); drawCmp(); } }), zoomVal, el('button', { class: 'icon', 'aria-label': 'Acercar', html: I.plus, onclick: () => { cz.zoom = Core.clamp(cz.zoom * 1.4, 1, 16); drawCmp(); } }),
    el('button', { class: 'icon', 'aria-label': 'Ajustar', html: I.fit, onclick: () => { cz.zoom = 1; cz.x = cz.y = 0.5; drawCmp(); } }),
    el('span', { class: 'sep' }), el('span', { class: 'hint', id: 'cmpLabel' }, ''));
  const cont = el('button', { class: 'btn primary', id: 'bToDownload', onclick: () => go('descargar') }, 'Continuar a Guardar →');
  host.append(el('div', { class: 'enh' },
    el('div', { class: 'enh-side' }, el('h2', {}, 'Elige la calidad final'), el('p', { class: 'note' }, 'Gratis, sin internet y sin subir tu foto.'), opts, engineBox, status, el('div', { class: 'spacer' }), cont),
    el('div', { class: 'cmpview' }, toolbar, panes)));
  paintOpts(); paintEngine();
  new ResizeObserver(() => drawCmp()).observe(panes);
  (async () => {
    try {
      if (!S.enh.left) S.enh.left = await neutralCrop();
      await ensureFinal();
      setCmpLabel();
      drawCmp();
    } catch (e) { toast(e.message, 'err'); }
  })();
}
function setCmpLabel() {
  const l = $('#cmpLabel'), t = $('#cmpTagR');
  if (t && S.finalC) t.textContent = `Resultado · ${S.finalC.width}×${S.finalC.height} · ${S.enh.label}`;
  if (l) l.textContent = 'Arrastra y haz zoom: ambos lados se mueven juntos.';
}
function getRGBA(canvas) { return canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height).data; }
async function canvasToBitmap(rgba, w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  c.getContext('2d').putImageData(new ImageData(rgba, w, h), 0, 0);
  return createImageBitmap(c, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
}
async function rebuildDetail(left, plan, signal, prog) {
  const w = left.width, h = left.height;
  const base = await lanczosWorker(getRGBA(left), w, h, plan.w, plan.h);
  let input = getRGBA(left), iw = w, ih = h;
  const shrink = async (k) => {
    const nw = Math.max(16, Math.round(iw * k)), nh = Math.max(16, Math.round(ih * k));
    input = await lanczosWorker(input, iw, ih, nw, nh); iw = nw; ih = nh;
  };
  if (plan.input < 1) await shrink(plan.input);
  const attempt = async (engine) => {
    if (engine.scale < 1) await shrink(engine.scale);
    const name = engine.ep === 'webgpu' ? 'GPU' : 'procesador';
    return aiUpscale({ rgba: input, w: iw, h: ih, tw: plan.w, th: plan.h, tile: engine.tile, signal, onProgress: (f, eta) => prog(f, `Reconstruyendo detalle con ${name}. Falta ${Core.fmtTime(eta)}`) });
  };
  let engine = await chooseEngine(input, iw, ih, (t) => prog(0.01, t));
  let ai;
  try { ai = await attempt(engine); } catch (e) {
    if (e.cancelled || e.memory || signal.cancelled || engine.key === 'fast') throw e;
    aiPool.stop();
    prog(0, 'La GPU se quedó corta. Sigo con el motor rápido…');
    let ep;
    try { ep = await startModel('fast', false); } catch { aiPool.stop(); ep = await startModel('fast', true); }
    engine = { key: 'fast', ep, tile: ep === 'webgpu' ? 256 : 128, scale: 1 };
    ai = await attempt(engine);
  }
  const rgba = await fuseWorker(ai, base, plan.mix);
  return { rgba, label: `${MODELS[engine.key].label}, en tu teléfono` };
}
async function applyEnhance(ui, status) {
  if (S.enhBusy) return;
  const bar = el('span', {}), lbl = el('p', { class: 'note', 'aria-live': 'polite' }, 'Preparando…');
  const signal = { cancelled: false };
  const cancelBtn = el('button', { class: 'btn small', id: 'bCancel', onclick: () => { signal.cancelled = true; aiPool.stop(); classicPool.stop(); } }, 'Cancelar');
  status.innerHTML = '';
  status.append(el('div', { class: 'panelbox' }, el('strong', {}, 'Mejorando tu foto'), el('div', { class: 'bar-p', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100 }, bar), lbl, cancelBtn));
  const prog = (f, txt) => { bar.style.width = `${Math.round(f * 100)}%`; bar.parentElement.setAttribute('aria-valuenow', Math.round(f * 100)); if (txt) lbl.textContent = txt; };
  S.enhBusy = true;
  try {
    const left = await neutralCrop();
    const w = left.width, h = left.height, plan = Core.qualityPlan(w, h, ui.mode);
    S.enh.left = left;
    let result = null, label = 'Sin cambios', cas = 0;
    if (plan.kind === 'resize') {
      prog(0.3, `Reescalando a ${plan.w}×${plan.h}…`);
      result = await canvasToBitmap(await lanczosWorker(getRGBA(left), w, h, plan.w, plan.h), plan.w, plan.h);
      label = 'Reescalado de alta calidad';
      cas = plan.cas;
    } else if (plan.kind !== 'none') {
      try {
        const r = await rebuildDetail(left, plan, signal, prog);
        result = await canvasToBitmap(r.rgba, plan.w, plan.h);
        label = r.label;
        cas = plan.cas;
      } catch (e) {
        if (e.cancelled || signal.cancelled || e.memory) throw e;
        prog(0.5, 'Usando el reescalado de alta calidad…');
        result = await canvasToBitmap(await lanczosWorker(getRGBA(left), w, h, plan.w, plan.h), plan.w, plan.h);
        label = 'Reescalado de alta calidad, sin IA';
        cas = 0.55;
        toast('El motor de IA no pudo iniciar en este dispositivo. Usé el reescalado de alta calidad.');
      }
    }
    if (S.enh.src) S.enh.src.close();
    S.enh = { mode: ui.mode, engine: 'local', src: result, w: plan.w, h: plan.h, label, left, cas, id: Date.now(), geoKey: JSON.stringify(S.params.geo) };
    S.finalC = null;
    prog(1, 'Aplicando tu look y tus ajustes…');
    await nextFrame();
    await ensureFinal();
    setCmpLabel();
    if (S.drawCmp) S.drawCmp();
    status.innerHTML = '';
    status.append(el('div', { class: 'panelbox' }, el('strong', {}, 'Listo'), el('p', { class: 'note' }, `${S.finalC.width}×${S.finalC.height} px · ${label}`)));
    haptic();
  } catch (e) {
    status.innerHTML = '';
    if (e.cancelled || signal.cancelled) { toast('Mejora cancelada. Tu edición sigue intacta.'); return; }
    status.append(el('div', { class: 'panelbox' }, el('strong', {}, 'No se pudo completar'), el('p', { class: 'note' }, e.message),
      ...(e.memory ? [el('button', { class: 'btn small', onclick: () => { S.enhUI.mode = '1080p'; renderScreen($('#main')); } }, 'Probar con 1080p')] : [])));
  } finally { S.enhBusy = false; }
}

/* ---------- Descargar ---------- */
const FORMATS = [['image/jpeg', 'JPEG', 'jpg'], ['image/png', 'PNG', 'png'], ['image/webp', 'WebP', 'webp'], ['image/avif', 'AVIF', 'avif']];
const canEncode = (type) => new Promise((res) => { const c = document.createElement('canvas'); c.width = c.height = 2; c.toBlob((b) => res(!!b && b.type === type), type); });
function encode(canvas, type, q) { return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('El navegador no pudo codificar la imagen. Prueba con otro formato o una salida menor.'))), type, q)); }
async function withExif(blob, w, h) {
  if (blob.type !== 'image/jpeg' || !S.keepExif || !S.exif.app1) return blob;
  const payload = Core.prepareExif(S.exif.app1, { stripGps: S.stripGps, w, h });
  return new Blob([Core.insertApp1(new Uint8Array(await blob.arrayBuffer()), payload)], { type: 'image/jpeg' });
}
async function screenDownload(host) {
  const support = await Promise.all(FORMATS.map(([t]) => canEncode(t)));
  if (S.step !== 'descargar') return;
  const fmt = el('select', { id: 'fmt' }, FORMATS.map(([t, l], i) => (support[i] ? el('option', { value: t, selected: S.format === t }, l) : null)));
  const qLabel = el('output', { for: 'qual' }, `${S.quality} %`);
  const qual = el('input', { type: 'range', id: 'qual', min: 40, max: 100, step: 1, value: S.quality });
  const qRow = el('div', { class: 'ctl' }, el('label', { for: 'qual' }, 'Calidad'), qLabel, qual);
  const keep = el('input', { type: 'checkbox', id: 'keepExif', checked: S.keepExif });
  const strip = el('input', { type: 'checkbox', id: 'stripGps', checked: S.stripGps });
  const exifBox = el('div', { style: 'display:flex;flex-direction:column;gap:8px' },
    el('label', { class: 'check' }, keep, 'Conservar los datos EXIF de la cámara'), el('label', { class: 'check' }, strip, 'Eliminar la ubicación GPS'),
    el('p', { class: 'note' }, S.exif.app1 ? (S.exif.gps ? 'Esta foto incluye ubicación GPS.' : 'Esta foto no incluye ubicación GPS.') : 'Esta foto no trae datos EXIF.'));
  const sizeEl = el('div', { class: 'big', id: 'estSize', 'aria-live': 'polite' }, '…');
  const nameI = el('input', { type: 'text', id: 'fname', 'aria-label': 'Nombre del archivo' });
  const dims = el('p', { class: 'note', id: 'estDims' });
  const dl = el('button', { class: 'btn primary', id: 'bDownload', disabled: true }, 'Descargar');
  const share = el('button', { class: 'btn', id: 'bShare', hidden: true }, 'Compartir');
  const zipBtn = el('button', { class: 'btn', id: 'bZip' }, 'Exportar favoritos en ZIP');
  const zipInfo = el('p', { class: 'note', id: 'zipInfo' });
  const preview = el('canvas', { id: 'dlPreview', role: 'img', 'aria-label': 'Resultado final', style: 'width:100%;height:100%;object-fit:contain' });
  host.append(el('div', { class: 'enh' },
    el('div', { class: 'enh-side' }, el('h2', {}, 'Descarga tu foto'),
      el('div', {}, el('div', { class: 'hint' }, 'Peso real del archivo'), sizeEl, dims),
      el('div', { class: 'field' }, el('label', { for: 'fmt' }, 'Formato'), fmt), qRow,
      el('div', { class: 'field' }, el('label', { for: 'fname' }, 'Nombre'), nameI), exifBox,
      el('div', { class: 'row' }, dl, share), el('div', { class: 'sub' }, 'Varios looks'), zipInfo, zipBtn, el('div', { id: 'zipBar' })),
    el('div', { style: 'background:var(--stage);min-height:0;display:grid;place-items:center;padding:12px;overflow:hidden;min-width:0' }, preview)));
  const ext = () => FORMATS.find(([t]) => t === S.format)[2];
  const pName = () => { const p = S.presets.get(S.params.presetId); return p ? p.name : null; };
  const zipList = () => [...new Set([...S.favs].filter((id) => S.presets.has(id)))];
  zipInfo.textContent = zipList().length ? `Exporta ${zipList().length} favorito${zipList().length > 1 ? 's' : ''} con tus ajustes y esta calidad, en JPEG.` : 'Marca looks con la estrella para exportarlos juntos.';
  zipBtn.disabled = !zipList().length;
  let current = null, token = 0, userName = false;
  const setName = () => { if (!userName) nameI.value = Core.exportName(S.name, pName(), S.enh.mode, ext()); };
  nameI.addEventListener('input', () => { userName = true; });
  const estimate = async () => {
    const my = ++token;
    dl.disabled = true; sizeEl.textContent = 'Calculando…';
    try {
      const c = await ensureFinal();
      if (my !== token) return;
      qRow.hidden = S.format === 'image/png';
      exifBox.hidden = S.format !== 'image/jpeg';
      let b = await encode(c, S.format, S.quality / 100);
      if (my !== token) return;
      b = await withExif(b, c.width, c.height);
      current = b;
      sizeEl.textContent = Core.fmtBytes(b.size);
      dims.textContent = `${c.width}×${c.height} px · ${S.enh.label}`;
      setName();
      dl.disabled = false;
      const pv = preview.getContext('2d');
      const f = fitInto(c.width, c.height, 1600, 1600);
      if (preview.width !== f.w || preview.height !== f.h) { preview.width = f.w; preview.height = f.h; }
      pv.imageSmoothingQuality = 'high';
      pv.drawImage(c, 0, 0, f.w, f.h);
      if (Native.on) share.hidden = false;
      else if (navigator.canShare) {
        try { share.hidden = !navigator.canShare({ files: [new File([b], nameI.value, { type: b.type })] }); } catch { share.hidden = true; }
      }
    } catch (e) { if (my === token) { sizeEl.textContent = '—'; toast(e.message, 'err'); } }
  };
  fmt.addEventListener('change', () => { S.format = fmt.value; userName = false; estimate(); });
  qual.addEventListener('input', () => { S.quality = Number(qual.value); qLabel.textContent = `${S.quality} %`; clearTimeout(S.qT); S.qT = setTimeout(estimate, 220); });
  keep.addEventListener('change', () => { S.keepExif = keep.checked; estimate(); });
  strip.addEventListener('change', () => { S.stripGps = strip.checked; estimate(); });
  const save = async (blob, name) => {
    if (Native.on) { await Native.save(blob, name); return; }
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: name, style: 'display:none' });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };
  dl.addEventListener('click', async () => {
    if (!current) return;
    try {
      await save(current, nameI.value || 'foto.' + ext());
      toast(Native.on ? `Guardada en tu galería, álbum LUMEN PRO: ${nameI.value}` : `Guardado: ${nameI.value}`);
      haptic();
    } catch (e) { toast(`No se pudo guardar la foto. ${e.message}`, 'err'); }
  });
  share.addEventListener('click', async () => { try { if (Native.on) { await Native.share(current, nameI.value); return; } await navigator.share({ files: [new File([current], nameI.value, { type: current.type })], title: 'Foto editada con LUMEN PRO' }); } catch (e) { if (e.name !== 'AbortError') toast('No se pudo compartir. Descarga el archivo y compártelo desde tu galería.', 'err'); } });
  zipBtn.addEventListener('click', async () => {
    const ids = zipList();
    const barBox = $('#zipBar');
    const bar = el('span', {}), holder = el('div', { class: 'bar-p', role: 'progressbar' }, bar);
    barBox.innerHTML = '';
    barBox.append(holder);
    zipBtn.disabled = true;
    try {
      const files = [];
      for (let i = 0; i < ids.length; i++) {
        const q = Core.clone(S.params);
        q.presetId = ids[i];
        const p = S.presets.get(ids[i]);
        q.intensity = S.intensityById[ids[i]] !== undefined ? S.intensityById[ids[i]] : 100;
        q.recipe = p.fin || null;
        const c = await finishSharp(await renderFinal(q));
        let b = await encode(c, 'image/jpeg', S.quality / 100);
        b = await withExif(b, c.width, c.height);
        files.push({ name: Core.exportName(S.name, p.name, S.enh.mode, 'jpg'), bytes: new Uint8Array(await b.arrayBuffer()) });
        bar.style.width = `${Math.round(((i + 1) / ids.length) * 100)}%`;
        await nextFrame();
      }
      const zip = Core.makeZip(files);
      S.lastZip = zip;
      await save(zip, `${Core.slugify(S.name)}_presets.zip`);
      toast(`${Native.on ? 'ZIP guardado en Descargas' : 'ZIP listo'}: ${ids.length} fotos, ${Core.fmtBytes(zip.size)}`);
    } catch (e) { toast(e.message, 'err'); } finally { zipBtn.disabled = false; holder.remove(); }
  });
  estimate();
}

/* ---------- Créditos ---------- */
function openCredits() {
  const d = el('dialog', { id: 'credits' },
    el('div', { class: 'dlg' },
      el('h2', {}, 'Créditos y licencias'),
      el('h3', {}, 'Looks'),
      el('p', {}, 'Cada look usa una tabla de color real, reducida a 49³ puntos, más un acabado de tono y color hecho para LUMEN PRO. Los looks de Móviles son interpretaciones del estilo de cada marca: no son perfiles oficiales de Apple, Xiaomi, Leica ni Google, ni tienen relación con esas empresas. Tampoco copian los filtros de Instagram o VSCO.'),
      el('div', { class: 'dlg-table', tabindex: '0' }, el('table', {},
        el('thead', {}, el('tr', {}, ['Look', 'Tabla de origen', 'Autor', 'Licencia'].map((h) => el('th', { scope: 'col' }, h)))),
        el('tbody', {}, LUTS.map((p) => el('tr', {}, [p.name, p.file.split('/').pop().replace('.png', ''), p.author, p.license].map((v) => el('td', {}, v))))))),
      el('p', {}, 'Las tablas de Stuart Sowerby no declaran licencia. Para publicar esta app, primero pídele permiso o quita esos looks.'),
      el('h3', {}, 'Motores incluidos'),
      el('ul', {},
        el('li', {}, 'Real-ESRGAN, de Xintao Wang y colaboradores: BSD-3-Clause.'),
        el('li', {}, 'ONNX Runtime Web, de Microsoft: MIT. MediaPipe Tasks Vision, de Google: Apache-2.0. heic2any: MIT.')),
      el('h3', {}, 'Privacidad'),
      el('p', {}, 'Todo se procesa en este dispositivo. La app no sube tus fotos, no pide cuentas y no cobra por nada.'),
      el('h3', {}, 'Atajos'),
      el('p', { html: '<span class="kbd">←</span> <span class="kbd">→</span> cambiar de look · <span class="kbd">F</span> pantalla completa · <span class="kbd">\\\\</span> antes y después · <span class="kbd">Ctrl+Z</span> deshacer · mantén pulsada la foto para ver el original' }),
      el('div', { class: 'row' }, el('button', { class: 'btn primary', onclick: () => d.close() }, 'Cerrar'))));
  document.body.append(d);
  d.addEventListener('close', () => d.remove());
  d.showModal();
}

/* ---------- Android ---------- */
function bytesToB64(u8) { let t = ''; for (let i = 0; i < u8.length; i += 32768) t += String.fromCharCode.apply(null, u8.subarray(i, i + 32768)); return btoa(t); }
const Native = {
  on: !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()),
  /* El puente pasa texto: la imagen viaja en trozos para no agotar la memoria */
  async send(blob, name) {
    const P = window.Capacitor.Plugins.LumenNativo, step = 768 * 1024;
    await P.begin({ name, mime: blob.type || 'application/octet-stream' });
    for (let i = 0; i < blob.size; i += step) {
      await P.chunk({ data: bytesToB64(new Uint8Array(await blob.slice(i, i + step).arrayBuffer())) });
    }
  },
  async save(blob, name) { await this.send(blob, name); return window.Capacitor.Plugins.LumenNativo.save(); },
  async share(blob, name) { await this.send(blob, name); return window.Capacitor.Plugins.LumenNativo.share(); },
  bindBack() {
    const App = window.Capacitor.Plugins.App;
    if (!App) return;
    App.addListener('backButton', () => {
      const dlg = document.querySelector('dialog[open]');
      if (dlg) { dlg.close(); return; }
      if (document.querySelector('.overlay') || document.documentElement.classList.contains('immersive')) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        return;
      }
      if (S.step === 'editar') { if (S.mode !== 'looks') setMode('looks'); else go('subir'); } else if (S.step !== 'subir') go('editar');
      else App.exitApp();
    });
  },
};

/* ---------- Arranque ---------- */
function setTheme(t) { document.documentElement.dataset.theme = t; try { localStorage.setItem('lumen.theme', t); } catch { /* opcional */ } if (S.step === 'editar') requestRender(false); }
(function boot() {
  let theme = 'dark';
  try { theme = localStorage.getItem('lumen.theme') || 'dark'; } catch { /* opcional */ }
  document.documentElement.dataset.theme = theme;
  $('#bTheme').innerHTML = I.sun;
  $('#bInfo').innerHTML = I.info;
  $('#bTheme').addEventListener('click', () => setTheme(document.documentElement.dataset.theme === 'light' ? 'dark' : 'light'));
  $('#bInfo').addEventListener('click', openCredits);
  $('#brandBtn').addEventListener('click', () => { if (S.step !== 'subir') go('subir'); });
  $('#bUndo').innerHTML = I.undo; $('#bRedo').innerHTML = I.redo;
  $('#bUndo').addEventListener('click', () => undo(-1)); $('#bRedo').addEventListener('click', () => undo(1));
  if (Native.on) { Native.bindBack(); const bar = window.Capacitor.Plugins.StatusBar; if (bar) { bar.setBackgroundColor({ color: '#08080A' }).catch(() => {}); bar.setStyle({ style: 'DARK' }).catch(() => {}); } }
  paintSteps();
  renderScreen($('#main'));
  IDB.get('customs').then((list) => {
    if (!Array.isArray(list)) return;
    list.forEach((p) => { S.customs.push(p); S.presets.set(p.id, p); });
  });
})();
window.__lumen = { rebuildDetail, Native, S, R, Core, ensureLut, renderFinal, paramsFor, go, loadFile, importPreset, aiPool, IDB, chooseEngine };
