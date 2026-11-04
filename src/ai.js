/* LUMEN PRO · motor local: todo corre en el dispositivo, sin cuentas, pagos ni descargas */
const VENDOR = new URL('vendor/', location.href).href;
const MODELS = {
  fast: { file: 'realesr-general-x4v3.onnx', label: 'Real-ESRGAN rápido' },
  max: { file: 'RealESRGAN_x4plus.onnx', label: 'Real-ESRGAN máxima calidad' },
};

const IDB = {
  open() {
    if (this.p) return this.p;
    this.p = new Promise((res, rej) => {
      let r;
      try { r = indexedDB.open('lumen-pro', 1); } catch (e) { rej(e); return; }
      r.onupgradeneeded = () => r.result.createObjectStore('kv');
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return this.p;
  },
  async get(k) {
    try {
      const db = await this.open();
      return await new Promise((res) => { const q = db.transaction('kv').objectStore('kv').get(k); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); });
    } catch { return undefined; }
  },
  async set(k, v) {
    try {
      const db = await this.open();
      return await new Promise((res) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = () => res(true); t.onerror = t.onabort = () => res(false); });
    } catch { return false; }
  },
  async del(k) {
    try { const db = await this.open(); db.transaction('kv', 'readwrite').objectStore('kv').delete(k); } catch { /* sin almacenamiento */ }
  },
};

/* Código del worker. Reutiliza el núcleo puro del propio archivo. */
function workerBody() {
  let session = null, ort = null, ep = null;
  const reply = (id, data, transfer) => self.postMessage({ id, ...data }, transfer || []);
  self.onmessage = async (ev) => {
    const m = ev.data;
    try {
      if (m.type === 'resize') {
        const out = Core.lanczosResize(m.rgba, m.w, m.h, m.dw, m.dh, 4);
        reply(m.id, { rgba: out }, [out.buffer]);
      } else if (m.type === 'sharpen') {
        const out = m.edge ? Core.edgeSharpen(m.rgba, m.w, m.h, m.edge) : Core.casSharpen(m.rgba, m.w, m.h, m.amount);
        reply(m.id, { rgba: out }, [out.buffer]);
      } else if (m.type === 'matte') {
        const out = Core.proMatte(m.rgba, m.w, m.h, m.seg, m.seg2, m.box);
        reply(m.id, out, out.data ? [out.data.buffer] : []);
      } else if (m.type === 'fuse') {
        const out = Core.fuseImages(m.ai, m.base, m.mix);
        reply(m.id, { rgba: out }, [out.buffer]);
      } else if (m.type === 'ai-init') {
        if (!ort) {
          importScripts(m.base + 'ort/ort.webgpu.min.js');
          ort = self.ort;
          ort.env.wasm.wasmPaths = m.base + 'ort/';
          ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, self.navigator.hardwareConcurrency || 1) : 1;
          ort.env.wasm.proxy = false;
        }
        if (session) { try { await session.release(); } catch { /* ya liberada */ } session = null; }
        const res = await fetch(m.base + 'models/' + m.file);
        if (!res.ok) throw new Error('No se encontró el modelo ' + m.file);
        const bytes = new Uint8Array(await res.arrayBuffer());
        let adapter = null;
        if (!m.cpuOnly && self.navigator.gpu) { try { adapter = await self.navigator.gpu.requestAdapter(); } catch { adapter = null; } }
        if (m.gpuOnly && !adapter) throw new Error('Este dispositivo no tiene GPU disponible para el navegador.');
        const providers = adapter ? (m.gpuOnly ? ['webgpu'] : ['webgpu', 'wasm']) : ['wasm'];
        let lastError = null;
        for (const p of providers) {
          try { session = await ort.InferenceSession.create(bytes, { executionProviders: [p], graphOptimizationLevel: 'all' }); ep = p; break; } catch (e) { lastError = e; session = null; }
        }
        if (!session) throw new Error('El motor no pudo iniciarse en este dispositivo. ' + (lastError ? lastError.message : ''));
        reply(m.id, { ep });
      } else if (m.type === 'ai-tile') {
        const { w, h, rgb, region, ratio, ox, oy } = m;
        const t = new Float32Array(3 * w * h);
        for (let i = 0, n = w * h; i < n; i++) { t[i] = rgb[i * 3] / 255; t[n + i] = rgb[i * 3 + 1] / 255; t[2 * n + i] = rgb[i * 3 + 2] / 255; }
        const res = await session.run({ [session.inputNames[0]]: new ort.Tensor('float32', t, [1, 3, h, w]) });
        const out = res[session.outputNames[0]];
        const oh = out.dims[2], ow = out.dims[3], d = await (out.getData ? out.getData() : out.data);
        const up = new Uint8ClampedArray(ow * oh * 3);
        for (let i = 0, n = ow * oh; i < n; i++) { up[i * 3] = d[i] * 255; up[i * 3 + 1] = d[n + i] * 255; up[i * 3 + 2] = d[2 * n + i] * 255; }
        if (out.dispose) out.dispose();
        const factor = ow / w;
        const opt = { dw: region.dw, dh: region.dh, dx0: region.dx, dy0: region.dy, rx: ratio * factor, ry: ratio * factor, ox: ox * factor, oy: oy * factor };
        const final = factor * ratio === 1 && !ox && !oy && region.dw === ow && region.dh === oh ? up : Core.lanczosRegion(up, ow, oh, 3, opt);
        reply(m.id, { rgb: final, factor }, [final.buffer]);
      }
    } catch (e) {
      reply(m.id, { error: e && e.message ? e.message : String(e) });
    }
  };
}

class Pool {
  constructor() { this.w = null; this.pending = new Map(); this.seq = 0; }
  worker() {
    if (this.w) return this.w;
    const core = document.getElementById('core-src').textContent;
    const url = URL.createObjectURL(new Blob([core, `\n(${workerBody.toString()})();`], { type: 'text/javascript' }));
    this.w = new Worker(url);
    URL.revokeObjectURL(url);
    this.w.onmessage = (ev) => {
      const p = this.pending.get(ev.data.id);
      if (!p) return;
      this.pending.delete(ev.data.id);
      if (ev.data.error) p.rej(new Error(ev.data.error)); else p.res(ev.data);
    };
    this.w.onerror = (ev) => {
      const err = new Error(ev.message || 'El proceso de la imagen se detuvo.');
      for (const p of this.pending.values()) p.rej(err);
      this.pending.clear();
      this.w = null;
    };
    return this.w;
  }
  call(msg, transfer) {
    const id = ++this.seq, w = this.worker();
    return new Promise((res, rej) => { this.pending.set(id, { res, rej }); w.postMessage({ ...msg, id }, transfer || []); });
  }
  stop() {
    if (this.w) this.w.terminate();
    const err = Object.assign(new Error('Proceso cancelado.'), { cancelled: true });
    for (const p of this.pending.values()) p.rej(err);
    this.pending.clear();
    this.w = null;
  }
}
const classicPool = new Pool();
const aiPool = new Pool();
const lanczosWorker = async (rgba, w, h, dw, dh) => {
  const copy = new Uint8ClampedArray(rgba);
  return (await classicPool.call({ type: 'resize', rgba: copy, w, h, dw, dh }, [copy.buffer])).rgba;
};
const sharpenWorker = async (rgba, w, h, amount, edge) => {
  const copy = new Uint8ClampedArray(rgba);
  return (await classicPool.call({ type: 'sharpen', rgba: copy, w, h, amount, edge }, [copy.buffer])).rgba;
};
const matteWorker = async (rgba, w, h, seg, seg2, box) => classicPool.call({ type: 'matte', rgba, w, h, seg, seg2, box }, [rgba.buffer]);
const fuseWorker = async (ai, base, mix) => {
  const a = new Uint8ClampedArray(ai), b = new Uint8ClampedArray(base);
  return (await classicPool.call({ type: 'fuse', ai: a, base: b, mix }, [a.buffer, b.buffer])).rgba;
};

/* Elige modelo y tamaño según lo que aguante el dispositivo */
const BUDGET_SECONDS = 90, TILE_OVERLAP = 32;
function tileRgb(rgba, w, t) {
  const rgb = new Uint8Array(t.w * t.h * 3);
  for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
    const a = ((y + t.y) * w + x + t.x) * 4, b = (y * t.w + x) * 3;
    rgb[b] = rgba[a]; rgb[b + 1] = rgba[a + 1]; rgb[b + 2] = rgba[a + 2];
  }
  return rgb;
}
async function startModel(key, cpuOnly, gpuOnly) {
  return (await aiPool.call({ type: 'ai-init', base: VENDOR, file: MODELS[key].file, cpuOnly, gpuOnly })).ep;
}
async function benchmark(rgba, w, h, tile) {
  const t = { x: Math.max(0, (w - tile) >> 1), y: Math.max(0, (h - tile) >> 1), w: Math.min(tile, w), h: Math.min(tile, h) };
  const rgb = tileRgb(rgba, w, t), t0 = performance.now();
  await aiPool.call({ type: 'ai-tile', w: t.w, h: t.h, rgb, region: { dx: 0, dy: 0, dw: 4, dh: 4 }, ratio: 1, ox: t.x, oy: t.y }, [rgb.buffer]);
  return ((performance.now() - t0) / 1000) / (t.w * t.h);
}
async function chooseEngine(rgba, w, h, onStatus) {
  const totalPx = (tile) => { const n = Core.planTiles(w, h, tile, TILE_OVERLAP); return n.reduce((a, t) => a + t.w * t.h, 0); };
  if (self.navigator.gpu) {
    try {
      onStatus('Probando la máxima calidad en tu teléfono…');
      const ep = await startModel('max', false, true);
      const perPx = await benchmark(rgba, w, h, 128);
      if (perPx * totalPx(256) <= BUDGET_SECONDS * 0.7) return { key: 'max', ep, tile: 256, perPx, scale: 1 };
    } catch { aiPool.stop(); }
  }
  onStatus('Preparando el motor rápido…');
  let ep;
  try { ep = await startModel('fast', false); } catch { aiPool.stop(); ep = await startModel('fast', true); }
  const tile = ep === 'webgpu' ? 256 : 128;
  const perPx = await benchmark(rgba, w, h, Math.min(tile, 128));
  const est = perPx * totalPx(tile);
  return { key: 'fast', ep, tile, perPx, scale: est > BUDGET_SECONDS ? Math.max(0.35, Math.sqrt(BUDGET_SECONDS / est)) : 1 };
}
/* Reconstruye por mosaicos con solapamiento de 32 px. Devuelve RGBA en las dimensiones pedidas. */
async function aiUpscale({ rgba, w, h, tw, th, tile, onProgress, signal }) {
  const s = tw / w, s2 = Math.min(s, 4);
  const aw = Math.round(w * s2), ah = Math.round(h * s2);
  let acc, wgt;
  try { acc = new Float32Array(aw * ah * 3); wgt = new Float32Array(aw * ah); } catch {
    throw Object.assign(new Error(`No hay memoria para trabajar a ${aw}×${ah} px. Elige una salida menor, como 1080p.`), { memory: true });
  }
  const tiles = Core.planTiles(w, h, tile, TILE_OVERLAP), t0 = performance.now();
  for (let i = 0; i < tiles.length; i++) {
    if (signal.cancelled) throw Object.assign(new Error('Proceso cancelado.'), { cancelled: true });
    const t = tiles[i], reg = Core.destRegion(t, w, h, s2, TILE_OVERLAP);
    const rgb = tileRgb(rgba, w, t);
    const r = await aiPool.call({ type: 'ai-tile', w: t.w, h: t.h, rgb, region: reg, ratio: 1 / s2, ox: t.x, oy: t.y }, [rgb.buffer]);
    Core.blendTile(acc, wgt, aw, ah, reg, r.rgb, 3);
    const elapsed = (performance.now() - t0) / 1000;
    onProgress((i + 1) / tiles.length, elapsed / (i + 1) * (tiles.length - i - 1));
  }
  const out = Core.resolveAccum(acc, wgt, aw, ah, null);
  if (aw === tw && ah === th) return out;
  return lanczosWorker(out, aw, ah, tw, th);
}

/* MediaPipe local para rostros y personas */
const Vision = {
  async fileset() {
    if (!this.mod) {
      this.mod = await import(VENDOR + 'mediapipe/vision_bundle.mjs');
      this.files = await this.mod.FilesetResolver.forVisionTasks(VENDOR + 'mediapipe/wasm');
    }
    return this.files;
  },
  async countFaces(canvas) {
    const files = await this.fileset();
    if (!this.face) this.face = await this.mod.FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: VENDOR + 'models/blaze_face_short_range.tflite', delegate: 'CPU' }, runningMode: 'IMAGE', minDetectionConfidence: 0.55 });
    return this.face.detect(canvas).detections.length;
  },
  async segment(canvas) {
    const files = await this.fileset();
    if (!this.seg) this.seg = await this.mod.ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: VENDOR + 'models/selfie_multiclass_256x256.tflite', delegate: 'CPU' }, runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true });
    const r = this.seg.segment(canvas);
    const get = (i) => r.confidenceMasks[i].getAsFloat32Array();
    const w = r.confidenceMasks[0].width, h = r.confidenceMasks[0].height;
    const bg = get(0).slice(), body = get(2).slice(), face = get(3).slice();
    r.confidenceMasks.forEach((m) => m.close());
    return { w, h, bg, face, skin: body.map((v, i) => Math.min(1, v + face[i])) };
  },
};

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo cargar ' + src)); document.head.append(s); });
}
