/* LUMEN PRO · cámara: presets en vivo y guardado en segundo plano, sin detener las tomas */
const CAM = {
  on: false, r: null, q: null, stream: null, track: null, ic: null, video: null, tex: null, caps: {}, photoCaps: null,
  facing: 'environment', preset: 'portada', ratio: '3:4', timer: 0, grid: false, pro: false, flash: false, ev: 0, zoom: 1, soft: 0,
  devices: [], deviceI: -1, stats: null, scene: null, statsAt: 0, pending: 0, saved: 0, queue: [], pumping: false, lastBlob: null, lastName: '', order: [], busy: false, shooting: false, raf: 0, token: 0,
};
const CAM_RATIOS = { '3:4': 0.75, '4:5': 0.8, '1:1': 1, '9:16': 0.5625 };
const camNote = (text) => { try { const P = window.Capacitor && window.Capacitor.Plugins.LumenNativo; if (P && P.note) P.note({ text: `Cámara: ${text}` }).catch(() => {}); } catch { /* opcional */ } };

async function lutCube(id) {
  const p = S.presets.get(id);
  if (!p) return null;
  if (p.cube) return p.cube;
  if (p.cubeCache) return p.cubeCache;
  const png = p.png || (p.ref && S.presets.get(p.ref).png);
  if (!png) return null;
  const { rgba, w, h } = await decodePng(new Blob([b64ToBytes(png)], { type: 'image/png' }));
  p.cubeCache = Core.haldToCube(rgba, w, h);
  return p.cubeCache;
}
async function lutFor(rnd, id) {
  if (!id) return null;
  if (rnd.hasLut(id)) return rnd.bindLut(id);
  const cube = await lutCube(id);
  return cube ? rnd.bindLut(id, () => cube) : null;
}
function camParams(id, stats, scene, soft) {
  const q = Core.defaultParams(), p = id ? S.presets.get(id) : null;
  q.presetId = id || null;
  q.intensity = 100;
  if (p && p.fin) q.recipe = p.smart && stats ? Core.smartRecipe(p.fin, stats, scene) : p.fin;
  if (soft) q.light.exposure = soft;
  return q;
}
function camOrder() {
  const all = [...S.presets.values()].filter((p) => p.fin);
  const dark = (p) => (p.dl || 0) < -5;
  return [...all.filter((p) => p.smart), ...all.filter((p) => !p.smart && !p.premium && !dark(p)), ...all.filter((p) => p.premium && !dark(p)), ...all.filter(dark)].map((p) => p.id);
}

/* ---------- Pantalla ---------- */
function screenCamera(host) {
  CAM.on = true;
  CAM.order = camOrder();
  const video = el('video', { id: 'camVideo', playsinline: '', muted: '', autoplay: '', style: 'position:absolute;width:2px;height:2px;opacity:0;pointer-events:none' });
  video.muted = true; video.setAttribute('playsinline', '');
  CAM.video = video;
  if (!CAM.r) CAM.r = new Renderer();
  /* Se muestra en un lienzo 2D, igual que el editor: es el camino ya probado en Android */
  const cv = el('canvas', { id: 'camCanvas', role: 'img', 'aria-label': 'Vista en vivo de la cámara' });
  CAM.view2d = cv;
  const view = el('div', { class: 'cam-view', id: 'camView' }, video, cv,
    el('div', { class: 'cam-frame', id: 'camFrame' }, el('div', { class: 'cam-grid', id: 'camGrid', hidden: !CAM.grid })),
    el('div', { class: 'cam-focus', id: 'camFocus', hidden: true }),
    el('div', { class: 'dial-hud', id: 'camHud', hidden: true, 'aria-live': 'polite' }),
    el('div', { class: 'cam-count', id: 'camCount', hidden: true }),
    el('div', { class: 'cam-msg', id: 'camMsg', hidden: true }));
  const flashBtn = el('button', { class: 'cam-tool', id: 'camFlash', html: I.flash, 'aria-label': 'Flash', onclick: toggleFlash });
  const top = el('div', { class: 'cam-top' },
    el('button', { class: 'cam-tool', id: 'camClose', html: I.back, 'aria-label': 'Salir de la cámara', onclick: closeCamera }), flashBtn,
    el('button', { class: 'cam-tool txt', id: 'camTimer', 'aria-label': 'Temporizador', onclick: () => { CAM.timer = CAM.timer === 0 ? 3 : CAM.timer === 3 ? 10 : 0; paintCamTools(); } }),
    el('button', { class: 'cam-tool txt', id: 'camRatio', 'aria-label': 'Formato', onclick: () => { const k = Object.keys(CAM_RATIOS); CAM.ratio = k[(k.indexOf(CAM.ratio) + 1) % k.length]; paintCamTools(); layoutCam(); } }),
    el('button', { class: 'cam-tool', id: 'camGridBtn', html: I.grid, 'aria-label': 'Cuadrícula', onclick: () => { CAM.grid = !CAM.grid; $('#camGrid').hidden = !CAM.grid; paintCamTools(); } }),
    el('button', { class: 'cam-tool txt', id: 'camPro', 'aria-label': 'Modo Pro al guardar', onclick: () => { CAM.pro = !CAM.pro; paintCamTools(); camHud(CAM.pro ? 'Modo Pro activado' : 'Modo Pro desactivado', CAM.pro ? 'Se aplica al guardar la foto' : ''); } }, 'Pro'));
  const zooms = el('div', { class: 'cam-zooms', id: 'camZooms' });
  const strip = el('div', { class: 'cam-strip', id: 'camStrip', role: 'group', 'aria-label': 'Presets' });
  const last = el('button', { class: 'cam-last', id: 'camLast', 'aria-label': 'Abrir la última foto', onclick: openLastShot }, el('canvas', { id: 'camLastC', width: 112, height: 112 }), el('span', { id: 'camPending', hidden: true }));
  const shutter = el('button', { class: 'cam-shutter', id: 'camShutter', 'aria-label': 'Tomar foto' }, el('span', {}));
  bindShutter(shutter);
  const flip = el('button', { class: 'cam-tool big', id: 'camFlip', html: I.flip, 'aria-label': 'Cambiar de cámara', onclick: flipCamera });
  host.append(el('div', { class: 'camera' }, view, top, el('div', { class: 'cam-bottom' }, zooms, strip, el('div', { class: 'cam-row' }, last, shutter, flip))));
  CAM.pill = null;
  paintCamStrip();
  paintCamTools();
  bindCamGestures(view);
  CAM.ro = new ResizeObserver(layoutCam);
  CAM.ro.observe(view);
  document.addEventListener('visibilitychange', camVisibility);
  startStream();
}
function closeCamera() {
  if (CAM.pending) toast(`Sigo guardando ${CAM.pending === 1 ? 'una foto' : `${CAM.pending} fotos`} en tu galería.`);
  go(S.bmp ? 'editar' : 'subir');
}
function stopCamera() {
  if (!CAM.on) return;
  CAM.on = false;
  CAM.token++;
  cancelAnimationFrame(CAM.raf);
  clearInterval(CAM.thumbT);
  if (CAM.fence && CAM.r) { CAM.r.gl.deleteSync(CAM.fence); CAM.fence = null; }
  CAM.view2d = null;
  if (CAM.ro) CAM.ro.disconnect();
  if (CAM.io) CAM.io.disconnect();
  document.removeEventListener('visibilitychange', camVisibility);
  stopStream();
}
function stopStream() {
  if (CAM.stream) CAM.stream.getTracks().forEach((t) => t.stop());
  CAM.stream = null; CAM.track = null; CAM.ic = null; CAM.caps = {}; CAM.photoCaps = null;
}
function camVisibility() {
  if (!CAM.on) return;
  if (document.hidden) { stopStream(); cancelAnimationFrame(CAM.raf); } else startStream();
}
async function startStream() {
  const my = ++CAM.token, msg = $('#camMsg');
  stopStream();
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { camFail('Este dispositivo no permite usar la cámara aquí.'); return; }
  /* La vista en vivo no necesita más: la foto se toma aparte con toda la resolución */
  const video = { width: { ideal: 1280 }, height: { ideal: 960 } };
  if (CAM.deviceI >= 0 && CAM.devices[CAM.deviceI] && CAM.facing === 'environment') video.deviceId = { exact: CAM.devices[CAM.deviceI].deviceId };
  else video.facingMode = CAM.facing;
  let stream;
  try { stream = await navigator.mediaDevices.getUserMedia({ video, audio: false }); } catch (e) {
    if (my !== CAM.token) return;
    camNote(`error ${e.name}: ${e.message}`);
    camFail(e.name === 'NotAllowedError' ? 'LUMEN PRO no tiene permiso para usar la cámara. Actívalo en Ajustes de Android, en Aplicaciones, LUMEN PRO, Permisos.' : 'No se pudo abrir la cámara. Ciérrala en otras apps e inténtalo de nuevo.');
    return;
  }
  if (my !== CAM.token || !CAM.on) { stream.getTracks().forEach((t) => t.stop()); return; }
  CAM.stream = stream;
  CAM.track = stream.getVideoTracks()[0];
  msg.hidden = true;
  CAM.video.srcObject = stream;
  await CAM.video.play().catch(() => {});
  CAM.caps = (CAM.track.getCapabilities && CAM.track.getCapabilities()) || {};
  CAM.ic = window.ImageCapture ? new ImageCapture(CAM.track) : null;
  CAM.photoCaps = CAM.ic ? await CAM.ic.getPhotoCapabilities().catch(() => null) : null;
  if (!CAM.devices.length) {
    const list = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    CAM.devices = list.filter((d) => d.kind === 'videoinput' && !/front/i.test(d.label));
  }
  const pc = CAM.photoCaps;
  camNote(`abierta ${CAM.facing} ${CAM.video.videoWidth}x${CAM.video.videoHeight}, zoom ${CAM.caps.zoom ? `${CAM.caps.zoom.min}-${CAM.caps.zoom.max}` : 'no'}, foto ${pc && pc.imageWidth ? pc.imageWidth.max : 'video'}, lentes ${CAM.devices.length}`);
  CAM.zoom = 1;
  paintZooms();
  paintCamTools();
  layoutCam();
  camLoop(my);
  startThumbs();
}
function camFail(text) { const m = $('#camMsg'); if (m) { m.hidden = false; m.textContent = text; } }

/* ---------- Vista en vivo ---------- */
function camSize() {
  const view = $('#camView'), v = CAM.video;
  if (!view || !v || !v.videoWidth) return null;
  const b = view.getBoundingClientRect(), a = v.videoWidth / v.videoHeight;
  let dw = b.width, dh = dw / a;
  if (dh > b.height) { dh = b.height; dw = dh * a; }
  return { dw, dh, x: (b.width - dw) / 2, y: (b.height - dh) / 2, a };
}
function layoutCam() {
  const s = camSize();
  if (!s) return;
  const cv = CAM.view2d;
  if (!cv) return;
  cv.style.cssText = `position:absolute;left:${s.x}px;top:${s.y}px;width:${s.dw}px;height:${s.dh}px;transform:${CAM.facing === 'user' ? 'scaleX(-1)' : 'none'}`;
  const f = $('#camFrame');
  const r = s.a < 1 ? CAM_RATIOS[CAM.ratio] : 1 / CAM_RATIOS[CAM.ratio];
  let fw = s.dw, fh = fw / r;
  if (fh > s.dh) { fh = s.dh; fw = fh * r; }
  f.style.cssText = `left:${s.x + (s.dw - fw) / 2}px;top:${s.y + (s.dh - fh) / 2}px;width:${fw}px;height:${fh}px`;
}
function camLoop(my) {
  const step = async () => {
    if (my !== CAM.token || !CAM.on) return;
    CAM.raf = requestAnimationFrame(step);
    camRenderFrame();
  };
  CAM.raf = requestAnimationFrame(step);
}
function camRenderFrame() {
  const v = CAM.video, r = CAM.r;
  if (!v || v.readyState < 2 || !v.videoWidth || v.currentTime === CAM.lastT) return false;
  /* Si la GPU no terminó el cuadro anterior, salta este: nunca se acumula trabajo ni se traba la pantalla */
  const gl = r.gl;
  if (camGpuBusy()) return false;
  const s = camSize();
  if (!s) return false;
  if (!r.hasLut(CAM.preset) && CAM.preset) { if (!CAM.lutLoading) { CAM.lutLoading = true; lutFor(r, CAM.preset).finally(() => { CAM.lutLoading = false; }); } }
  CAM.lastT = v.currentTime;
  CAM.tex = r.uploadFrame(v, CAM.tex);
  const dpr = Math.min(2, devicePixelRatio || 1), k = Math.min(1, (s.dw * dpr) / v.videoWidth), W = Math.max(2, Math.round(v.videoWidth * k)), H = Math.max(2, Math.round(v.videoHeight * k));
  const now = performance.now();
  if (now - CAM.statsAt > 1200) { CAM.statsAt = now; camStats(); }
  const lut = CAM.preset && r.hasLut(CAM.preset) ? r.bindLut(CAM.preset) : null;
  const params = camParams(CAM.preset, CAM.stats, CAM.scene, CAM.soft);
  r.render({ src: { tex: CAM.tex, w: v.videoWidth, h: v.videoHeight }, lowSrc: { tex: CAM.tex }, params, lut, intensity: CAM.preset ? 100 : 0, outW: W, outH: H, pxW: W, pxH: H, dither: false, maskXf: Core.IDENTITY_XF });
  const out = CAM.view2d;
  if (out.width !== W || out.height !== H) { out.width = W; out.height = H; }
  out.getContext('2d', { alpha: false }).drawImage(r.canvas, 0, 0);
  CAM.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  CAM.drawn = (CAM.drawn || 0) + 1;
  return true;
}
function camGpuBusy() {
  if (!CAM.fence) return false;
  const gl = CAM.r.gl;
  if (gl.clientWaitSync(CAM.fence, 0, 0) === gl.TIMEOUT_EXPIRED) return true;
  gl.deleteSync(CAM.fence);
  CAM.fence = null;
  return false;
}
function camStats() {
  const v = CAM.video;
  const c = CAM.sample || (CAM.sample = document.createElement('canvas')), a = v.videoWidth / v.videoHeight;
  c.width = a >= 1 ? 96 : Math.round(96 * a); c.height = a >= 1 ? Math.round(96 / a) : 96;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(v, 0, 0, c.width, c.height);
  CAM.stats = Core.analyzePixels(x.getImageData(0, 0, c.width, c.height).data, c.width, c.height);
  CAM.scene = Core.classifyScene(CAM.stats);
}

/* ---------- Herramientas ---------- */
function paintCamTools() {
  const t = $('#camTimer'); if (!t) return;
  t.textContent = CAM.timer ? `${CAM.timer} s` : 'Tiempo';
  t.classList.toggle('on', !!CAM.timer);
  $('#camRatio').textContent = CAM.ratio;
  $('#camGridBtn').classList.toggle('on', CAM.grid);
  $('#camPro').classList.toggle('on', CAM.pro);
  const fl = $('#camFlash'), front = CAM.facing === 'user';
  fl.hidden = !front && !CAM.caps.torch;
  fl.classList.toggle('on', CAM.flash);
}
async function toggleFlash() {
  CAM.flash = !CAM.flash;
  paintCamTools();
  if (CAM.facing === 'environment' && CAM.track && CAM.caps.torch) await CAM.track.applyConstraints({ advanced: [{ torch: CAM.flash }] }).catch(() => {});
  camHud(CAM.flash ? 'Flash encendido' : 'Flash apagado', CAM.facing === 'user' && CAM.flash ? 'La pantalla ilumina tu cara' : '');
}
function flipCamera() {
  CAM.facing = CAM.facing === 'user' ? 'environment' : 'user';
  CAM.flash = false; CAM.deviceI = -1; CAM.ev = 0; CAM.soft = 0; CAM.lastT = -1;
  startStream();
  haptic();
}
function paintZooms() {
  const box = $('#camZooms'); if (!box) return;
  box.innerHTML = '';
  const z = CAM.caps.zoom;
  const stops = z ? [0.6, 1, 2, 3, 5, 10].filter((v) => v >= z.min - 0.01 && v <= z.max + 0.01) : [];
  stops.forEach((v) => box.append(el('button', { class: 'cam-z' + (Math.abs(CAM.zoom - v) < 0.05 ? ' on' : ''), 'aria-label': `Zoom ${v}x`, onclick: () => { setCamZoom(v); paintZooms(); } }, `${v}x`)));
  if (!stops.length && CAM.devices.length > 1 && CAM.facing === 'environment') box.append(el('button', { class: 'cam-z on', onclick: () => { CAM.deviceI = (CAM.deviceI + 1) % CAM.devices.length; CAM.lastT = -1; startStream(); } }, 'Cambiar lente'));
}
function setCamZoom(v) {
  const z = CAM.caps.zoom;
  if (!z || !CAM.track) return;
  CAM.zoom = Core.clamp(v, z.min, z.max);
  CAM.track.applyConstraints({ advanced: [{ zoom: CAM.zoom }] }).catch(() => {});
}
function setCamEv(v) {
  const c = CAM.caps.exposureCompensation;
  CAM.ev = Core.clamp(v, -2, 2);
  if (c && CAM.track) { CAM.soft = 0; CAM.track.applyConstraints({ advanced: [{ exposureMode: 'continuous', exposureCompensation: Core.clamp(CAM.ev, c.min, c.max) }] }).catch(() => {}); } else CAM.soft = CAM.ev;
}
function camFocusAt(u, v, cx, cy) {
  const f = $('#camFocus');
  f.style.left = `${cx}px`; f.style.top = `${cy}px`;
  f.hidden = false;
  clearTimeout(CAM.focusT);
  CAM.focusT = setTimeout(() => { f.hidden = true; }, 900);
  const c = CAM.caps, adv = {};
  if (CAM.facing === 'user') u = 1 - u;
  if (c.focusMode && c.focusMode.includes('single-shot')) adv.focusMode = 'single-shot';
  else if (c.focusMode && c.focusMode.includes('continuous')) adv.focusMode = 'continuous';
  adv.pointsOfInterest = [{ x: u, y: v }];
  if (CAM.track) CAM.track.applyConstraints({ advanced: [adv] }).catch(() => {});
}
function camHud(main, hint) {
  const h = $('#camHud'); if (!h) return;
  clearTimeout(CAM.hudT);
  h.innerHTML = '';
  h.append(el('strong', {}, main));
  if (hint) h.append(el('span', {}, hint));
  h.hidden = false;
  CAM.hudT = setTimeout(() => { h.hidden = true; }, 1300);
}
function selectCamPreset(id, silent) {
  CAM.preset = id;
  lutFor(CAM.r, id);
  document.querySelectorAll('.cam-thumb').forEach((b) => { const on = (b.dataset.id || null) === id; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); if (on) b.scrollIntoView({ block: 'nearest', inline: 'center', behavior: reduced() ? 'auto' : 'smooth' }); });
  if (!silent) camHud(id ? S.presets.get(id).name : 'Sin look');
  CAM.lastT = -1;
}
function stepCamPreset(dir) {
  const list = [null, ...CAM.order], i = list.indexOf(CAM.preset);
  selectCamPreset(list[(i + dir + list.length) % list.length]);
  haptic();
}
function paintCamStrip() {
  const strip = $('#camStrip');
  const make = (id, name) => {
    const c = el('canvas', { width: 112, height: 112 });
    const b = el('button', { class: 'cam-thumb' + (id === CAM.preset ? ' on' : ''), 'data-id': id || '', 'aria-pressed': String(id === CAM.preset), onclick: () => selectCamPreset(id) }, c, el('span', {}, name));
    return b;
  };
  strip.append(make(null, 'Sin look'));
  CAM.order.forEach((id) => strip.append(make(id, S.presets.get(id).name)));
  CAM.visible = new Set();
  CAM.io = new IntersectionObserver((ents) => { ents.forEach((e) => { if (e.isIntersecting) CAM.visible.add(e.target); else CAM.visible.delete(e.target); }); }, { root: strip, rootMargin: '40px' });
  strip.querySelectorAll('.cam-thumb').forEach((b) => CAM.io.observe(b));
  requestAnimationFrame(() => { const on = strip.querySelector('.cam-thumb.on'); if (on) on.scrollIntoView({ block: 'nearest', inline: 'center' }); });
}
/* Miniaturas: se actualizan poco a poco con lo que ve la cámara, sin frenar la vista en vivo */
function startThumbs() {
  clearInterval(CAM.thumbT);
  CAM.thumbI = 0;
  const frame = document.createElement('canvas'), x = frame.getContext('2d');
  frame.width = frame.height = 128;
  let tex = null, at = 0, tick = 0, fps = 30, fpsAt = performance.now(), fpsDrawn = CAM.drawn || 0;
  CAM.thumbT = setInterval(async () => {
    const v = CAM.video;
    if (!CAM.on || document.hidden || !v || v.readyState < 2 || !CAM.visible || !CAM.visible.size || CAM.thumbBusy || CAM.pending) return;
    /* En equipos lentos las miniaturas van más despacio para no quitarle cuadros a la vista en vivo */
    tick++;
    const t = performance.now();
    if (t - fpsAt > 2000) { fps = ((CAM.drawn || 0) - fpsDrawn) / ((t - fpsAt) / 1000); fpsDrawn = CAM.drawn || 0; fpsAt = t; }
    if (fps < 12 && tick % 4) return;
    CAM.thumbBusy = true;
    try {
      const now = performance.now();
      if (now - at > 2500) {
        const m = Math.min(v.videoWidth, v.videoHeight);
        x.drawImage(v, (v.videoWidth - m) / 2, (v.videoHeight - m) / 2, m, m, 0, 0, 128, 128);
        tex = R.uploadImage(frame, tex); at = now;
      }
      const list = [...CAM.visible], b = list[CAM.thumbI++ % list.length], id = b.dataset.id || null;
      const lut = id ? await lutFor(R, id) : null;
      if (!CAM.on) return;
      R.render({ src: { tex, w: 128, h: 128 }, lowSrc: { tex }, params: camParams(id, CAM.stats, CAM.scene, 0), lut, intensity: id ? 100 : 0, outW: 112, outH: 112, pxW: 112, pxH: 112, dither: false, maskXf: Core.IDENTITY_XF });
      b.querySelector('canvas').getContext('2d').drawImage(R.canvas, 0, 0, 112, 112);
    } catch { /* reintenta en la siguiente vuelta */ } finally { CAM.thumbBusy = false; }
  }, 320);
}
function bindCamGestures(view) {
  const pts = new Map();
  let start = null, pinch = null, lastTap = 0;
  view.addEventListener('pointerdown', (e) => {
    view.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2) { const [a, b] = [...pts.values()]; pinch = { d: Math.hypot(a[0] - b[0], a[1] - b[1]), z: CAM.zoom }; start = null; return; }
    start = { x: e.clientX, y: e.clientY, ev: CAM.ev, axis: null };
  });
  view.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, [e.clientX, e.clientY]);
    if (pts.size === 2 && pinch) {
      const [a, b] = [...pts.values()], z = pinch.z * (Math.hypot(a[0] - b[0], a[1] - b[1]) / pinch.d);
      setCamZoom(z);
      if (CAM.caps.zoom) camHud(`${CAM.zoom.toFixed(1)}x`);
      return;
    }
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (!start.axis && Math.hypot(dx, dy) > 14) start.axis = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
    if (start.axis === 'y') {
      setCamEv(start.ev - dy / 110);
      camHud(`Luz ${CAM.ev > 0 ? '+' : ''}${CAM.ev.toFixed(1)}`);
    }
  });
  const end = (e) => {
    const s = start, had = pts.has(e.pointerId);
    pts.delete(e.pointerId);
    if (pts.size < 2) { if (pinch) { pinch = null; paintZooms(); } }
    if (!s || !had || e.type !== 'pointerup') { if (!pts.size) start = null; return; }
    start = null;
    const dx = e.clientX - s.x;
    if (s.axis === 'x' && Math.abs(dx) > 40) { stepCamPreset(dx < 0 ? 1 : -1); return; }
    if (!s.axis) {
      const now = Date.now();
      if (now - lastTap < 280) { lastTap = 0; flipCamera(); return; }
      lastTap = now;
      const c = camSize(), b = view.getBoundingClientRect();
      if (c) camFocusAt(Core.clamp((e.clientX - b.left - c.x) / c.dw, 0, 1), Core.clamp((e.clientY - b.top - c.y) / c.dh, 0, 1), e.clientX - b.left, e.clientY - b.top);
    }
  };
  view.addEventListener('pointerup', end);
  view.addEventListener('pointercancel', end);
}

/* ---------- Tomar la foto ---------- */
function bindShutter(btn) {
  let holdT = null, burst = false;
  btn.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    btn.classList.add('down');
    burst = false;
    holdT = setTimeout(() => { burst = true; runBurst(btn); }, 420);
  });
  const up = (e) => {
    btn.classList.remove('down');
    clearTimeout(holdT);
    if (e.type === 'pointerup' && !burst) shoot();
    burst = false;
  };
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('pointerleave', up);
  btn.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); shoot(); } });
}
async function runBurst(btn) {
  while (btn.classList.contains('down') && CAM.on) {
    if (CAM.pending < 10) await grabShot();
    await wait(120);
  }
}
async function shoot() {
  if (!CAM.video || !CAM.stream) return;
  if (CAM.pending >= 10) { camHud('Espera un momento', 'Estoy guardando tus fotos'); return; }
  if (CAM.timer) {
    if (CAM.counting) { CAM.counting = false; $('#camCount').hidden = true; return; }
    CAM.counting = true;
    const c = $('#camCount');
    c.hidden = false;
    for (let i = CAM.timer; i > 0 && CAM.counting && CAM.on; i--) { c.textContent = String(i); await wait(1000); }
    c.hidden = true;
    if (!CAM.counting || !CAM.on) return;
    CAM.counting = false;
  }
  grabShot();
}
async function grabShot() {
  if (!CAM.stream || !CAM.video) return;
  const facing = CAM.facing, job = { preset: CAM.preset, ratio: CAM.ratio, pro: CAM.pro, mirror: facing === 'user', soft: CAM.soft, t: Date.now() };
  CAM.pending++;
  paintPending();
  haptic();
  /* La miniatura sale de lo que estás viendo: aparece al instante */
  camRenderFrame();
  if (CAM.view2d && CAM.view2d.width > 4) {
    const lc = $('#camLastC'), cv = CAM.view2d, m = Math.min(cv.width, cv.height);
    lc.getContext('2d').drawImage(cv, (cv.width - m) / 2, (cv.height - m) / 2, m, m, 0, 0, 112, 112);
    $('#camLast').classList.add('has');
  }
  const view = $('#camView');
  const screenFlash = facing === 'user' && CAM.flash;
  if (screenFlash) { view.classList.add('white'); await wait(280); } else if (!reduced()) { view.classList.remove('shot'); void view.offsetWidth; view.classList.add('shot'); }
  try {
    job.source = await captureFrame();
  } catch (e) {
    CAM.pending--; paintPending();
    camNote(`error al capturar: ${e.message}`);
    toast('No se pudo tomar la foto. Inténtalo de nuevo.', 'err');
    return;
  } finally { view.classList.remove('white'); }
  CAM.queue.push(job);
  pumpShots();
}
async function captureFrame() {
  const pc = CAM.photoCaps;
  if (CAM.ic) {
    try {
      const opts = {};
      if (pc && pc.imageWidth && pc.imageHeight) {
        /* Cerca de 12 MP: alcanza para 4K con detalle real y se guarda rápido */
        const w = Math.min(pc.imageWidth.max, Math.max(pc.imageWidth.min || 0, 4080));
        opts.imageWidth = w;
      }
      if (CAM.flash && CAM.facing === 'environment' && !CAM.caps.torch && pc && pc.fillLightMode && pc.fillLightMode.includes('flash')) opts.fillLightMode = 'flash';
      const blob = await CAM.ic.takePhoto(opts);
      if (blob && blob.size) return blob;
    } catch (e) { camNote(`takePhoto falló: ${e.name} ${e.message}`); }
  }
  const v = CAM.video, c = document.createElement('canvas');
  c.width = v.videoWidth; c.height = v.videoHeight;
  c.getContext('2d').drawImage(v, 0, 0);
  return c;
}
function paintPending() {
  const p = $('#camPending');
  if (!p) return;
  p.hidden = !CAM.pending;
  p.textContent = String(CAM.pending);
}
async function pumpShots() {
  if (CAM.pumping) return;
  CAM.pumping = true;
  try {
    while (CAM.queue.length) {
      const job = CAM.queue.shift();
      const t0 = performance.now();
      try {
        await processShot(job);
        CAM.saved++;
        camNote(`guardada ${CAM.lastName}, ${CAM.lastInfo}, ${Math.round(performance.now() - t0)} ms, ${CAM.drawn || 0} cuadros en vivo`);
      } catch (e) {
        camNote(`error al guardar: ${e.message}`);
        toast(`No se pudo guardar una foto. ${e.message}`, 'err');
      }
      CAM.pending--;
      paintPending();
      await nextFrame();
    }
  } finally { CAM.pumping = false; }
  if (CAM.q && !CAM.on) { const ext = CAM.q.gl.getExtension('WEBGL_lose_context'); if (ext) ext.loseContext(); CAM.q = null; }
}
/* Procesa en su propio contexto gráfico para que la vista en vivo no se detenga */
async function processShot(job) {
  const rnd = CAM.q || (CAM.q = new Renderer());
  const opts = { premultiplyAlpha: 'none', imageOrientation: 'from-image' };
  let bmp;
  if (job.source instanceof Blob) { try { bmp = await createImageBitmap(job.source, opts); } catch { bmp = await createImageBitmap(job.source, { premultiplyAlpha: 'none' }); } } else bmp = await createImageBitmap(job.source);
  job.source = null;
  await nextFrame();
  const W = bmp.width, H = bmp.height, preview = scaleCanvas(bmp, W, H, 1600);
  const sampleC = scaleCanvas(preview, preview.width, preview.height, 256), sx = sampleC.getContext('2d', { willReadFrequently: true });
  const stats = Core.analyzePixels(sx.getImageData(0, 0, sampleC.width, sampleC.height).data, sampleC.width, sampleC.height), scene = Core.classifyScene(stats);
  const params = camParams(job.preset, stats, scene, job.soft);
  await nextFrame();
  const lowTex = rnd.uploadImage(preview);
  const geo = Core.defaultParams().geo;
  const portrait = W < H, r = portrait ? CAM_RATIOS[job.ratio] : 1 / CAM_RATIOS[job.ratio], a = W / H;
  if (a > r) { const w = r / a; geo.crop = { x: (1 - w) / 2, y: 0, w, h: 1 }; } else if (a < r) { const h = a / r; geo.crop = { x: 0, y: (1 - h) / 2, w: 1, h }; }
  geo.flipH = job.mirror;
  try {
    if (job.pro) {
      const seg = await Vision.segment(preview), box = Core.segmentBox(seg);
      let seg2 = null;
      if (box) {
        const c = document.createElement('canvas'), cw = Math.max(1, Math.round(box.w * preview.width)), ch = Math.max(1, Math.round(box.h * preview.height));
        c.width = cw; c.height = ch;
        c.getContext('2d').drawImage(preview, box.x * preview.width, box.y * preview.height, cw, ch, 0, 0, cw, ch);
        seg2 = await Vision.segment(c);
      }
      const mc = scaleCanvas(preview, preview.width, preview.height, 1024), md = mc.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, mc.width, mc.height).data;
      const m = await matteWorker(new Uint8ClampedArray(md), mc.width, mc.height, seg, seg2, box);
      if (m.person) { rnd.setMatte(m); params.pro = { ...params.pro, amount: 100 }; } else rnd.setMatte(null);
    } else rnd.setMatte(null);
    const lut = job.preset ? await lutFor(rnd, job.preset) : null;
    const geoXf = Core.geoMatrix(geo, W, H), size = Core.geoOutputSize(geo, W, H);
    const full = await renderTiles(rnd, { source: bmp, srcXf: geoXf, size, lowTex, lowXf: geoXf, maskXf: geoXf, params, lut, intensity: job.preset ? 100 : 0, atmos: [0.9, 0.9, 0.9], rotated: false });
    await nextFrame();
    const t = Core.qualityPlan(size.w, size.h, 'whatsappHd');
    const rgba = full.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, size.w, size.h).data;
    const fit = t.kind === 'resize' && t.w < size.w;
    const w = fit ? t.w : size.w, h = fit ? t.h : size.h;
    const sized = fit ? await lanczosWorker(rgba, size.w, size.h, w, h) : rgba;
    const sharp = await sharpenWorker(sized, w, h, 0, 1.6);
    const out = document.createElement('canvas');
    out.width = w; out.height = h;
    out.getContext('2d').putImageData(new ImageData(sharp, w, h), 0, 0);
    await nextFrame();
    const blob = await encode(out, 'image/jpeg', 0.96);
    const p = job.preset ? S.presets.get(job.preset) : null, d = new Date(job.t), pad = (v) => String(v).padStart(2, '0');
    const name = `LUMEN_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}_${d.getMilliseconds()}_${p ? Core.presetSlug(p.name) : 'sin-look'}.jpg`;
    if (Native.on) await Native.save(blob, name);
    else { const url = URL.createObjectURL(blob), link = el('a', { href: url, download: name, style: 'display:none' }); document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000); }
    CAM.lastBlob = blob; CAM.lastName = name; CAM.lastInfo = `${w}x${h} de ${W}x${H}, ${Math.round(blob.size / 1024)} KB`;
  } finally {
    bmp.close();
    rnd.gl.deleteTexture(lowTex);
  }
}
function openLastShot() {
  if (!CAM.lastBlob) return;
  const f = new File([CAM.lastBlob], CAM.lastName, { type: 'image/jpeg' });
  stopCamera();
  loadFile(f);
}
