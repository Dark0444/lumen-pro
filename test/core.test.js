const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const Core = require('../src/core.js');

function identityHald(level) {
  const side = level ** 3, n = level * level, d = new Uint8Array(side * side * 4);
  for (let b = 0, i = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++, i++) {
    d[i * 4] = Math.round((r / (n - 1)) * 255); d[i * 4 + 1] = Math.round((g / (n - 1)) * 255); d[i * 4 + 2] = Math.round((b / (n - 1)) * 255); d[i * 4 + 3] = 255;
  }
  return { d, side };
}

test('parser .cube: tamaño, orden, dominio, comentarios y errores', () => {
  const lines = ['# comentario', 'TITLE "Prueba"', 'LUT_3D_SIZE 2', 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 2 2 2'];
  for (let b = 0; b < 2; b++) for (let g = 0; g < 2; g++) for (let r = 0; r < 2; r++) lines.push(`${r * 2} ${g * 2} ${b * 2}`);
  const c = Core.parseCube(lines.join('\n'));
  assert.equal(c.size, 2); assert.equal(c.title, 'Prueba');
  assert.deepEqual([...c.data.slice(4, 7)], [1, 0, 0]);
  assert.deepEqual([...c.data.slice(8, 11)], [0, 1, 0]);
  assert.deepEqual([...c.data.slice(16, 19)], [0, 0, 1]);
  assert.throws(() => Core.parseCube('LUT_3D_SIZE 2\n0 0 0'), /debería tener 8/);
  assert.throws(() => Core.parseCube('LUT_1D_SIZE 16\n0 0 0'), /1D/);
  assert.throws(() => Core.parseCube('0 0 0'), /LUT_3D_SIZE/);
});

test('parser HaldCLUT: nivel, tamaño del cubo y rechazo de imágenes no válidas', () => {
  const { d, side } = identityHald(4);
  const c = Core.haldToCube(d, side, side);
  assert.equal(c.size, 16); assert.equal(c.level, 4);
  assert.throws(() => Core.haldToCube(new Uint8Array(4 * 100 * 100), 100, 100), /no es un HaldCLUT/);
  assert.throws(() => Core.haldToCube(new Uint8Array(4 * 64 * 32), 64, 32), /no es un HaldCLUT/);
});

test('interpolación tetraédrica: LUT identidad devuelve la entrada', () => {
  const { d, side } = identityHald(3);
  const c = Core.haldToCube(d, side, side);
  for (const col of [[0.13, 0.6, 0.91], [1, 0, 0.5], [0.5, 0.5, 0.5], [0.77, 0.22, 0.31]]) {
    const o = Core.lutTetra(c, ...col);
    col.forEach((v, i) => assert.ok(Math.abs(o[i] - v) < 0.004, `${col} -> ${o}`));
  }
});

test('dimensiones: 1080p y 4K conservan proporción y lado largo exacto', () => {
  assert.deepEqual([Core.targetDims(4000, 3000, '4k').w, Core.targetDims(4000, 3000, '4k').h], [3840, 2880]);
  assert.deepEqual([Core.targetDims(3000, 4000, '4k').w, Core.targetDims(3000, 4000, '4k').h], [2880, 3840]);
  assert.deepEqual([Core.targetDims(4000, 3000, '1080p').w, Core.targetDims(4000, 3000, '1080p').h], [1920, 1440]);
  assert.deepEqual([Core.targetDims(600, 400, '1080p').w, Core.targetDims(600, 400, '1080p').h], [1920, 1280]);
  assert.equal(Core.targetDims(600, 400, '4k').upscale, true);
  assert.equal(Core.targetDims(6000, 4000, '1080p').downscale, true);
  assert.deepEqual([Core.targetDims(1234, 777, 'original').w, Core.targetDims(1234, 777, 'detail').h], [1234, 777]);
  for (const [w, h] of [[5472, 3648], [1080, 1920], [4032, 3024], [801, 799], [1000, 1000], [7000, 1000]]) {
    for (const m of ['1080p', '4k']) {
      const t = Core.targetDims(w, h, m);
      assert.equal(Math.max(t.w, t.h), m === '4k' ? 3840 : 1920);
      assert.ok(Math.abs(t.w / t.h - w / h) / (w / h) < 0.002, `${w}x${h} ${m} deforma`);
    }
  }
});

test('geometría: identidad, recorte, giro de 90° y volteo', () => {
  const near = (a, b) => a.forEach((v, i) => assert.ok(Math.abs(v - b[i]) < 1e-9, `${a} != ${b}`));
  const g = Core.defaultParams().geo;
  near(Core.geoMatrix(g, 400, 200), [1, 0, 0, 0, 1, 0]);
  const c = { ...g, crop: { x: 0.25, y: 0.5, w: 0.5, h: 0.5 } };
  near(Core.applyXf(Core.geoMatrix(c, 400, 200), 0, 0), [0.25, 0.5]);
  near(Core.applyXf(Core.geoMatrix(c, 400, 200), 1, 1), [0.75, 1]);
  assert.deepEqual(Core.geoOutputSize(c, 400, 200), { w: 200, h: 100 });
  const r = { ...g, rot90: 1 };
  assert.deepEqual(Core.geoOutputSize(r, 400, 200), { w: 200, h: 400 });
  near(Core.applyXf(Core.geoMatrix(r, 400, 200), 0, 0), [0, 1]);
  near(Core.applyXf(Core.geoMatrix(r, 400, 200), 1, 0), [0, 0]);
  near(Core.applyXf(Core.geoMatrix({ ...g, flipH: true }, 400, 200), 0, 0), [1, 0]);
  const m = Core.geoMatrix({ ...g, angle: 12 }, 400, 300);
  for (const [u, v] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
    const s = Core.applyXf(m, u, v);
    assert.ok(s[0] >= -1e-6 && s[0] <= 1 + 1e-6 && s[1] >= -1e-6 && s[1] <= 1 + 1e-6, 'el enderezado no debe dejar bordes vacíos');
  }
});

test('mosaicos: cubren todo, respetan el solapamiento y unen sin costuras', () => {
  const W = 503, H = 311, tile = 128, ov = 32;
  const tiles = Core.planTiles(W, H, tile, ov);
  const cover = new Uint8Array(W * H);
  for (const t of tiles) {
    assert.ok(t.x + t.w <= W && t.y + t.h <= H);
    for (let y = t.y; y < t.y + t.h; y++) for (let x = t.x; x < t.x + t.w; x++) cover[y * W + x] = 1;
  }
  assert.ok(cover.every((v) => v === 1), 'faltan píxeles');
  const xs = [...new Set(tiles.map((t) => t.x))].sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) assert.ok(xs[i - 1] + tile - xs[i] >= ov, 'solapamiento insuficiente');
  for (const scale of [1, 1.5, 2, 3.3, 4]) {
    const dW = Math.round(W * scale), dH = Math.round(H * scale);
    const acc = new Float32Array(dW * dH * 3), wgt = new Float32Array(dW * dH);
    for (const t of tiles) {
      const reg = Core.destRegion(t, W, H, scale, ov);
      const rgb = new Uint8Array(reg.dw * reg.dh * 3);
      for (let j = 0; j < reg.dh; j++) for (let i = 0; i < reg.dw; i++) {
        const X = reg.dx + i, Y = reg.dy + j, k = (j * reg.dw + i) * 3;
        rgb[k] = (X * 255) / dW; rgb[k + 1] = (Y * 255) / dH; rgb[k + 2] = 90;
      }
      Core.blendTile(acc, wgt, dW, dH, reg, rgb);
    }
    assert.ok(wgt.every((v) => v > 0), `huecos en escala ${scale}`);
    const out = Core.resolveAccum(acc, wgt, dW, dH);
    let worst = 0;
    for (let y = 0; y < dH; y++) for (let x = 0; x < dW; x++) {
      const k = (y * dW + x) * 4;
      worst = Math.max(worst, Math.abs(out[k] - (x * 255) / dW), Math.abs(out[k + 1] - (y * 255) / dH), Math.abs(out[k + 2] - 90));
    }
    assert.ok(worst <= 1.51, `costura de ${worst} niveles en escala ${scale}`);
  }
});

test('Lanczos: dimensiones, color plano y mosaicos en fase con la imagen completa', () => {
  const sw = 240, sh = 160, src = new Uint8ClampedArray(sw * sh * 3);
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const k = (y * sw + x) * 3; src[k] = x; src[k + 1] = y; src[k + 2] = (x + y) / 2; }
  const up = Core.lanczosResize(src, sw, sh, 480, 320, 3);
  assert.equal(up.length, 480 * 320 * 3);
  const flat = Core.lanczosResize(new Uint8ClampedArray(30 * 20 * 4).fill(77), 30, 20, 91, 13);
  assert.ok(flat.every((v) => v === 77));
  const dw = 60, dh = 40, dx0 = 100, dy0 = 80;
  const crop = new Uint8ClampedArray((dw + 40) * (dh + 40) * 3);
  const ox = 40, oy = 30, cw = dw + 40, ch = dh + 40;
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) for (let c = 0; c < 3; c++) crop[(y * cw + x) * 3 + c] = src[((y + oy) * sw + x + ox) * 3 + c];
  const part = Core.lanczosRegion(crop, cw, ch, 3, { dw, dh, dx0, dy0, rx: 0.5, ry: 0.5, ox, oy });
  let worst = 0;
  for (let y = 10; y < dh - 10; y++) for (let x = 10; x < dw - 10; x++) for (let c = 0; c < 3; c++) {
    worst = Math.max(worst, Math.abs(part[(y * dw + x) * 3 + c] - up[((y + dy0) * 480 + x + dx0) * 3 + c]));
  }
  assert.ok(worst <= 1, `fase desviada ${worst}`);
});

test('curvas: identidad exacta, monotonía y puntos respetados', () => {
  const id = Core.curveToTable([[0, 0], [1, 1]]);
  assert.ok(Math.abs(id[128] - 128 / 255) < 1e-6);
  const c = Core.curveToTable([[0, 0], [0.25, 0.15], [0.75, 0.85], [1, 1]]);
  for (let i = 1; i < 256; i++) assert.ok(c[i] >= c[i - 1] - 1e-6);
  assert.ok(Math.abs(c[Math.round(0.25 * 255)] - 0.15) < 0.01);
});

test('identidad de parámetros: solo sin preset activo y sin ajustes', () => {
  const p = Core.defaultParams();
  assert.ok(Core.colorIsIdentity(p));
  p.presetId = 'x'; p.intensity = 0;
  assert.ok(Core.colorIsIdentity(p));
  p.intensity = 1;
  assert.ok(!Core.colorIsIdentity(p));
  p.intensity = 0; p.light.exposure = 0.1;
  assert.ok(!Core.colorIsIdentity(p));
});

test('XMP: asigna lo compatible y lista lo que no se pudo aplicar', () => {
  const xmp = `<x:xmpmeta><rdf:Description crs:Exposure2012="+0.50" crs:Contrast2012="12" crs:Vibrance="20" crs:HueAdjustmentBlue="-15"
    crs:SaturationAdjustmentRed="8" crs:ParametricShadows="10" crs:Clarity2012="9" crs:PostCropVignetteAmount="-20" crs:Version="15" crs:Name="Mi preset">
    <crs:ToneCurvePV2012><rdf:Seq><rdf:li>0, 10</rdf:li><rdf:li>255, 245</rdf:li></rdf:Seq></crs:ToneCurvePV2012></rdf:Description></x:xmpmeta>`;
  const r = Core.parseXmp(xmp);
  assert.equal(r.params.light.exposure, 0.5);
  assert.equal(r.params.color.hsl.h[5], -15);
  assert.equal(r.params.color.hsl.s[0], 8);
  assert.equal(r.params.fx.vignette, -20);
  assert.ok(Math.abs(r.params.curves.rgb[0][1] - 10 / 255) < 1e-9);
  assert.ok(r.ignored.includes('ParametricShadows'));
  assert.ok(!r.ignored.includes('Version'));
  assert.equal(r.name, 'Mi preset');
  assert.throws(() => Core.parseXmp('<xml></xml>'), /Lightroom/);
});

function tiffApp1({ gps = true } = {}) {
  /* TIFF little endian: IFD0 con Make, Orientation=6, ExifPtr, GPSPtr; Exif con ISO y dimensiones; GPS con latitud */
  const b = new Uint8Array(400), dv = new DataView(b.buffer);
  b.set([0x45, 0x78, 0x69, 0x66, 0, 0], 0);
  const T = 6, set16 = (o, v) => dv.setUint16(T + o, v, true), set32 = (o, v) => dv.setUint32(T + o, v, true);
  b.set([0x49, 0x49], T); set16(2, 42); set32(4, 8);
  const entries = [[0x010f, 2, 4, 0x00414243], [0x0112, 3, 1, 6], [0x8769, 4, 1, 120]];
  if (gps) entries.push([0x8825, 4, 1, 200]);
  set16(8, entries.length);
  entries.forEach(([t, ty, c, v], i) => { const e = 10 + i * 12; set16(e, t); set16(e + 2, ty); set32(e + 4, c); set32(e + 8, v); });
  set32(10 + entries.length * 12, 300);
  set16(120, 3);
  [[0x8827, 3, 1, 3200], [0xa002, 4, 1, 4000], [0xa003, 4, 1, 3000]].forEach(([t, ty, c, v], i) => { const e = 122 + i * 12; set16(e, t); set16(e + 2, ty); set32(e + 4, c); set32(e + 8, v); });
  set16(200, 1);
  set16(202, 2); set16(204, 5); set32(206, 3); set32(210, 240);
  for (let i = 0; i < 24; i++) b[T + 240 + i] = 0xaa;
  return b;
}
function jpegWith(app1) {
  const head = [0xff, 0xd8, 0xff, 0xe1, (app1.length + 2) >> 8, (app1.length + 2) & 255];
  return new Uint8Array([...head, ...app1, 0xff, 0xda, 0, 2, 1, 2, 0xff, 0xd9]);
}

test('EXIF: lee datos, normaliza orientación y borra GPS de verdad', () => {
  const app1 = tiffApp1();
  const e = Core.readExif(jpegWith(app1));
  assert.equal(e.make, 'CBA');
  assert.equal(e.orientation, 6); assert.equal(e.iso, 3200); assert.equal(e.gps, true);
  const out = Core.prepareExif(e.app1, { stripGps: true, w: 3840, h: 2880 });
  const again = Core.readExif(jpegWith(out));
  assert.equal(again.orientation, 1); assert.equal(again.gps, undefined); assert.equal(again.iso, 3200);
  assert.ok(!out.includes(0xaa), 'quedaron coordenadas en el archivo');
  const dv = new DataView(out.buffer, out.byteOffset + 6);
  assert.equal(dv.getUint32(122 + 12 + 8, true), 3840);
  assert.equal(dv.getUint32(122 + 24 + 8, true), 2880);
  const keep = Core.prepareExif(e.app1, { stripGps: false, w: 10, h: 10 });
  assert.equal(Core.readExif(jpegWith(keep)).gps, true);
  const j = Core.insertApp1(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 1, 2, 0xff, 0xda]), out);
  assert.equal(j[8], 0xff); assert.equal(j[9], 0xe1);
  assert.equal(Core.readExif(j).iso, 3200);
});

test('ZIP: CRC conocido y estructura válida', async () => {
  assert.equal(Core.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const blob = Core.makeZip([{ name: 'a.jpg', bytes: new Uint8Array([1, 2, 3]) }, { name: 'ñ.jpg', bytes: new Uint8Array([4]) }]);
  const b = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(b.buffer);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  assert.equal(dv.getUint16(b.length - 22 + 10, true), 2);
});

test('análisis: temperatura, escena y recomendaciones verificables', () => {
  const luts = JSON.parse(fs.readFileSync(path.join(__dirname, '../build/luts.json'))).map(({ png, ...r }) => r);
  const W = 64, H = 48, img = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const k = (y * W + x) * 4, sky = y < H * 0.55;
    img[k] = sky ? 110 : 60; img[k + 1] = sky ? 165 : 140; img[k + 2] = sky ? 235 : 50; img[k + 3] = 255;
  }
  const s = Core.analyzePixels(img, W, H);
  assert.ok(s.skyTop > 0.8 && s.green > 0.3);
  const scene = Core.classifyScene(s);
  assert.equal(scene.id, 'paisaje');
  const rank = Core.rankPresets(s, scene, luts);
  assert.equal(rank.length, luts.length);
  assert.equal(rank.filter((x) => x.recommended).length, 8);
  assert.ok(rank.slice(0, 8).every((x) => x.recommended));
  assert.ok(rank.slice(0, 8).filter((x) => ['cine', 'calidos', 'limpios', 'moody'].includes(x.cat)).length >= 3);
  assert.ok(rank.every((x) => x.suggested >= 60 && x.suggested <= 100 && x.reason.length > 3));
  s.faces = 2;
  assert.equal(Core.classifyScene(s).id, 'retrato');
  const dark = new Uint8ClampedArray(W * H * 4).fill(14);
  for (let i = 3; i < dark.length; i += 4) dark[i] = 255;
  assert.equal(Core.classifyScene(Core.analyzePixels(dark, W, H)).id, 'noche');
  const warm = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) warm.set([200, 150, 90, 255], i * 4);
  const warmStats = Core.analyzePixels(warm, W, H);
  assert.ok(warmStats.cct < 5000, `CCT ${warmStats.cct}`);
  assert.equal(warmStats.cast, 'cálida');
});

test('catálogo: looks originales y nuevos con LUT real', () => {
  const luts = JSON.parse(fs.readFileSync(path.join(__dirname, '../build/luts.json')));
  const count = {};
  for (const l of luts) {
    count[l.cat] = (count[l.cat] || 0) + 1;
    assert.equal(l.srcLevel >= 8, true);
    assert.ok((l.png && l.png.length > 1000) || luts.some((o) => o.id === l.ref && o.png));
    assert.ok(l.license && l.author && l.fin && typeof l.fin.lut === 'number');
  }
  assert.equal(luts.length, 84);
  assert.equal(count.moviles, 9);
  for (const id of ['clean', 'golden-hour', 'teal-orange', 'trix', 'iphone-17-pro-max', 'xiaomi-17-ultra-authentic', 'google-pixel']) assert.ok(luts.some((l) => l.id === id), id);
});

test('nombre de archivo automático', () => {
  assert.equal(Core.exportName('Foto Playa.JPG', 'Kodak Portra 400', '4k', 'jpg'), 'foto-playa_portra400_4k.jpg');
  assert.equal(Core.exportName('', null, 'original', 'png'), 'foto_sin-preset_original.png');
});

function flat(r, g, b, W = 64, H = 48) { const a = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H; i++) a.set([r, g, b, 255], i * 4); return { a, W, H }; }
function gradient(lo, hi, W = 96, H = 64, tint = [1, 1, 1]) { const a = new Uint8ClampedArray(W * H * 4); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = lo + (hi - lo) * ((x + y) / (W + H - 2)); a.set([v * tint[0], v * tint[1], v * tint[2], 255], (y * W + x) * 4); } return { a, W, H }; }
const autoOf = (im) => { const s = Core.analyzePixels(im.a, im.W, im.H); return { s, a: Core.autoAdjust(s, Core.classifyScene(s)) }; };

test('autoajuste: detecta foto oscura y sube la luz', () => {
  const { a } = autoOf(gradient(4, 70));
  assert.equal(a.label, 'oscura');
  assert.ok(a.exposure > 0.3, `EV ${a.exposure}`);
  assert.ok(a.shadows > 0);
  assert.match(a.notes.join(' '), /oscura/i);
});
test('autoajuste: detecta foto clara y baja la luz', () => {
  const { a } = autoOf(gradient(150, 255));
  assert.equal(a.label, 'clara');
  assert.ok(a.exposure < 0, `EV ${a.exposure}`);
  assert.ok(a.highlights < 0);
});
test('autoajuste: quita la dominante de color', () => {
  const { a } = autoOf(gradient(40, 220, 96, 64, [1, 0.86, 0.68]));
  assert.ok(a.wb[2] > a.wb[0], `balance ${a.wb}`);
});
test('autoajuste: foto equilibrada recibe cambios pequeños', () => {
  const { a } = autoOf(gradient(10, 245));
  assert.ok(Math.abs(a.exposure) < 0.4, `EV ${a.exposure}`);
});
test('efectivo: suma manual, auto y acabado sin tocar lo manual', () => {
  const p = Core.defaultParams();
  p.light.exposure = 0.2; p.auto.amount = 50; p.auto.exposure = 1; p.presetId = 'x'; p.intensity = 100;
  p.recipe = { lut: 0.6, light: { contrast: 10 }, fade: 0.05, grade: { highs: { h: 40, s: 10 } } };
  const q = Core.effectiveParams(p);
  assert.ok(Math.abs(q.light.exposure - 0.7) < 1e-9);
  assert.equal(q.light.contrast, 10);
  assert.ok(Math.abs(q._lutMix - 0.6) < 1e-9);
  assert.equal(q._fade, 0.05);
  assert.equal(p.light.exposure, 0.2);
  const half = Core.effectiveParams(p, 50);
  assert.equal(half.light.contrast, 5);
  assert.ok(Math.abs(half._lutMix - 0.3) < 1e-9);
  p.auto.amount = 0; p.intensity = 0;
  assert.ok(!Core.colorIsIdentity({ ...p }) === true);
  const clean = Core.defaultParams();
  clean.presetId = 'x'; clean.recipe = p.recipe; clean.intensity = 0;
  assert.ok(Core.colorIsIdentity(clean));
  clean.auto.amount = 1;
  assert.ok(!Core.colorIsIdentity(clean));
});
test('diagnóstico: foto oscura, opaca, saturada y normal reciben sugerencias', () => {
  const dg = (im) => { const s = Core.analyzePixels(im.a, im.W, im.H); return Core.diagnose(s, Core.classifyScene(s)); };
  const dark = dg(gradient(2, 40));
  assert.ok(dark.ids.has('dark') && dark.fixes.length >= 2 && dark.fixes.some((f) => f.fix.light && f.fix.light.exposure > 0), dark.summary);
  const flat = dg(gradient(110, 150));
  assert.ok(flat.ids.has('flat') && flat.fixes.some((f) => f.id === 'dar-vida'), flat.summary);
  const sat = (() => { const W = 64, H = 48, a = new Uint8ClampedArray(W * H * 4); for (let i = 0; i < W * H; i++) a.set(i % 2 ? [250, 20, 30, 255] : [20, 40, 250, 255], i * 4); return dg({ a, W, H }); })();
  assert.ok(sat.ids.has('oversat') && sat.fixes.some((f) => f.fix.color && f.fix.color.saturation < 0), sat.summary);
  assert.ok(dg(gradient(10, 245)).fixes.length >= 1);
});
test('sugerencia: se suma y cuenta como ajuste', () => {
  const p = Core.defaultParams();
  assert.ok(Core.colorIsIdentity(p));
  p.fix = { light: { exposure: 0.3 }, color: { saturation: -10 } };
  assert.ok(!Core.colorIsIdentity(p));
  const q = Core.effectiveParams(p);
  assert.ok(Math.abs(q.light.exposure - 0.3) < 1e-9);
  assert.equal(q.color.saturation, -10);
  assert.equal(p.light.exposure, 0);
});
test('recomendaciones: una foto oscura recibe looks que la aclaran', () => {
  const luts = JSON.parse(fs.readFileSync(path.join(__dirname, '../build/luts.json'))).map(({ png, ...r }) => r);
  const s = Core.analyzePixels(gradient(2, 40).a, 96, 64), scene = Core.classifyScene(s);
  const rank = Core.rankPresets(s, scene, luts);
  assert.equal(rank.filter((x) => x.recommended).length, 8);
  const byId = new Map(luts.map((l) => [l.id, l]));
  assert.ok(rank.slice(0, 8).filter((r) => (byId.get(r.id).fits || []).includes('dark')).length >= 3);
  assert.ok(rank.slice(0, 8).some((r) => /oscura/.test(r.reason)));
});
test('calidad: elige reconstruir, combinar o reducir según el tamaño', () => {
  assert.equal(Core.qualityPlan(550, 980, '4k').kind, 'rebuild');
  assert.equal(Core.qualityPlan(4000, 3000, '4k').kind, 'fusion');
  assert.equal(Core.qualityPlan(4000, 3000, '1080p').kind, 'resize');
  assert.equal(Core.qualityPlan(1000, 800, '1080p').kind, 'rebuild');
  assert.equal(Core.qualityPlan(4000, 3000, 'original').kind, 'none');
  const d = Core.qualityPlan(4000, 3000, 'detail');
  assert.deepEqual([d.w, d.h, d.kind], [4000, 3000, 'fusion']);
  assert.ok(d.input < 1);
});
test('nitidez CAS: conserva zonas planas, afila bordes sin salirse de rango', () => {
  const W = 40, H = 20, a = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = x < 20 ? 90 : 170; a.set([v, v, v, 255], (y * W + x) * 4); }
  const o = Core.casSharpen(a, W, H, 0.5);
  assert.equal(o[(10 * W + 5) * 4], 90);
  assert.equal(o[(10 * W + 35) * 4], 170);
  assert.ok(o[(10 * W + 19) * 4] < 90, 'el borde oscuro debe bajar');
  assert.ok(o[(10 * W + 20) * 4] > 170, 'el borde claro debe subir');
  assert.ok(o[(10 * W + 19) * 4] > 60 && o[(10 * W + 20) * 4] < 205, 'sin halos fuertes');
  const f = Core.fuseImages(new Uint8ClampedArray([200, 200, 200, 255]), new Uint8ClampedArray([100, 100, 100, 128]), 0.5);
  assert.deepEqual([...f], [150, 150, 150, 128]);
});
