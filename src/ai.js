/* LUMEN PRO · IA en el dispositivo: Real-ESRGAN con ONNX Runtime Web, MediaPipe y Lanczos en un worker */
const AI_MODELS = {
  fast: { id: 'realesr-general-x4v3', label: 'IA rápida', mb: 5, url: 'https://huggingface.co/relax123666/clearpic-models/resolve/main/realesr-general-x4v3.onnx', note: 'Modelo realesr-general-x4v3' },
  max: { id: 'RealESRGAN_x4plus', label: 'IA máxima calidad', mb: 67, url: 'https://huggingface.co/relax123666/clearpic-models/resolve/main/RealESRGAN_x4plus.onnx', note: 'Modelo RealESRGAN_x4plus' },
};
const ORT_VERSION = '1.23.2';
const ORT_BASES = [`https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/`, `https://unpkg.com/onnxruntime-web@${ORT_VERSION}/dist/`];
const MP_VERSION = '0.10.14';
const MP_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MP_VERSION}`;
const MP_FACE = 'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
const MP_SEG = 'https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_multiclass_256x256/float32/latest/selfie_multiclass_256x256.tflite';

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
      } else if (m.type === 'ai-init') {
        let lastError = null;
        if (!ort) {
          for (const base of m.bases) {
            try { importScripts(base + 'ort.webgpu.min.js'); self.ort.env.wasm.wasmPaths = base; ort = self.ort; break; } catch (e) { lastError = e; }
          }
          if (!ort) throw new Error('No se pudo descargar ONNX Runtime. Comprueba tu conexión a internet. ' + (lastError ? lastError.message : ''));
          ort.env.wasm.numThreads = self.crossOriginIsolated ? Math.min(4, self.navigator.hardwareConcurrency || 1) : 1;
          ort.env.wasm.proxy = false;
        }
        const bytes = new Uint8Array(m.model);
        const providers = self.navigator.gpu ? ['webgpu', 'wasm'] : ['wasm'];
        for (const p of providers) {
          try { session = await ort.InferenceSession.create(bytes, { executionProviders: [p], graphOptimizationLevel: 'all' }); ep = p; break; } catch (e) { lastError = e; session = null; }
        }
        if (!session) throw new Error('El modelo no pudo iniciarse en este dispositivo. ' + (lastError ? lastError.message : ''));
        reply(m.id, { ep, input: session.inputNames[0], output: session.outputNames[0] });
      } else if (m.type === 'ai-tile') {
        const { w, h, rgb, region, ratio, ox, oy } = m;
        const t = new Float32Array(3 * w * h);
        for (let i = 0, n = w * h; i < n; i++) { t[i] = rgb[i * 3] / 255; t[n + i] = rgb[i * 3 + 1] / 255; t[2 * n + i] = rgb[i * 3 + 2] / 255; }
        const feeds = { [session.inputNames[0]]: new ort.Tensor('float32', t, [1, 3, h, w]) };
        const res = await session.run(feeds);
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
  const r = await classicPool.call({ type: 'resize', rgba: copy, w, h, dw, dh }, [copy.buffer]);
  return r.rgba;
};

async function downloadModel(key, onProgress) {
  const m = AI_MODELS[key];
  const cached = await IDB.get('model:' + m.id);
  if (cached) return { buffer: cached, fromCache: true };
  let res;
  try { res = await fetch(m.url, { mode: 'cors' }); } catch { throw new Error(`No se pudo descargar ${m.id}. Revisa tu conexión o carga el archivo .onnx desde tu equipo.`); }
  if (!res.ok) throw new Error(`Hugging Face respondió ${res.status} al pedir ${m.id}. Carga el archivo .onnx desde tu equipo.`);
  const total = Number(res.headers.get('content-length')) || m.mb * 1048576;
  const reader = res.body.getReader(), chunks = [];
  let got = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value); got += value.length;
    onProgress(Math.min(1, got / total), got);
  }
  const buffer = new Uint8Array(got);
  let p = 0;
  for (const c of chunks) { buffer.set(c, p); p += c.length; }
  await IDB.set('model:' + m.id, buffer.buffer);
  return { buffer: buffer.buffer, fromCache: false };
}

/* Corre el modelo por mosaicos con solapamiento de 32 px. Devuelve RGBA en las dimensiones pedidas. */
async function aiUpscale({ rgba, w, h, tw, th, tile, onProgress, signal }) {
  const OVERLAP = 32, s = tw / w;
  const s2 = Math.min(s, 4);
  const aw = Math.round(w * s2), ah = Math.round(h * s2);
  let acc, wgt;
  try { acc = new Float32Array(aw * ah * 3); wgt = new Float32Array(aw * ah); } catch {
    const err = new Error(`No hay memoria para trabajar a ${aw}×${ah} px. Elige una salida menor, como 1080p.`);
    err.memory = true;
    throw err;
  }
  const tiles = Core.planTiles(w, h, tile, OVERLAP), t0 = performance.now();
  for (let i = 0; i < tiles.length; i++) {
    if (signal.cancelled) throw Object.assign(new Error('Proceso cancelado.'), { cancelled: true });
    const t = tiles[i], reg = Core.destRegion(t, w, h, s2, OVERLAP);
    const rgb = new Uint8Array(t.w * t.h * 3);
    for (let y = 0; y < t.h; y++) for (let x = 0; x < t.w; x++) {
      const a = ((y + t.y) * w + x + t.x) * 4, b = (y * t.w + x) * 3;
      rgb[b] = rgba[a]; rgb[b + 1] = rgba[a + 1]; rgb[b + 2] = rgba[a + 2];
    }
    const r = await aiPool.call({ type: 'ai-tile', w: t.w, h: t.h, rgb, region: reg, ratio: 1 / s2, ox: t.x, oy: t.y }, [rgb.buffer]);
    Core.blendTile(acc, wgt, aw, ah, reg, r.rgb, 3);
    const elapsed = (performance.now() - t0) / 1000;
    onProgress((i + 1) / tiles.length, elapsed / (i + 1) * (tiles.length - i - 1), i + 1, tiles.length);
  }
  const hasAlpha = (() => { for (let i = 3; i < rgba.length; i += 4) if (rgba[i] !== 255) return true; return false; })();
  const alpha = hasAlpha ? Core.lanczosResize(rgba, w, h, aw, ah, 4) : null;
  const out = Core.resolveAccum(acc, wgt, aw, ah, alpha);
  if (aw === tw && ah === th) return out;
  return lanczosWorker(out, aw, ah, tw, th);
}

/* MediaPipe bajo demanda. Nada de esto sube la foto: solo descarga motor y modelo. */
const Vision = {
  async fileset() {
    if (!this.mod) {
      this.mod = await import(`${MP_BASE}/vision_bundle.mjs`);
      this.files = await this.mod.FilesetResolver.forVisionTasks(`${MP_BASE}/wasm`);
    }
    return this.files;
  },
  async countFaces(canvas) {
    const files = await this.fileset();
    if (!this.face) this.face = await this.mod.FaceDetector.createFromOptions(files, { baseOptions: { modelAssetPath: MP_FACE, delegate: 'CPU' }, runningMode: 'IMAGE', minDetectionConfidence: 0.55 });
    const r = this.face.detect(canvas);
    return r.detections.length;
  },
  async segment(canvas) {
    const files = await this.fileset();
    if (!this.seg) this.seg = await this.mod.ImageSegmenter.createFromOptions(files, { baseOptions: { modelAssetPath: MP_SEG, delegate: 'CPU' }, runningMode: 'IMAGE', outputCategoryMask: false, outputConfidenceMasks: true });
    const r = this.seg.segment(canvas);
    const get = (i) => r.confidenceMasks[i].getAsFloat32Array();
    const w = r.confidenceMasks[0].width, h = r.confidenceMasks[0].height;
    const bg = get(0).slice(), body = get(2).slice(), face = get(3).slice();
    r.confidenceMasks.forEach((m) => m.close());
    return { w, h, bg, skin: body.map((v, i) => Math.min(1, v + face[i])) };
  },
};

function loadScript(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error('No se pudo descargar ' + src)); document.head.append(s); });
}
