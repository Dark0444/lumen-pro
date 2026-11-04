/* LUMEN PRO · núcleo puro: sin DOM ni WebGL, probado con node:test */
const Core = (() => {
  const srgb2lin = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ---------- Parámetros ---------- */
  const emptyCurve = () => [[0, 0], [1, 1]];
  const defaultParams = () => ({
    presetId: null, intensity: 100, recipe: null, fixId: null, fix: null,
    auto: { amount: 0, exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0, vibrance: 0, clarity: 0, dehaze: 0, wb: [1, 1, 1] },
    light: { exposure: 0, contrast: 0, highlights: 0, shadows: 0, whites: 0, blacks: 0 },
    color: { temp: 0, tint: 0, vibrance: 0, saturation: 0, hsl: { h: Array(8).fill(0), s: Array(8).fill(0), l: Array(8).fill(0) } },
    curves: { rgb: emptyCurve(), r: emptyCurve(), g: emptyCurve(), b: emptyCurve() },
    grade: { shadows: { h: 210, s: 0 }, mids: { h: 40, s: 0 }, highs: { h: 45, s: 0 } },
    detail: { sharpen: 0, clarity: 0, texture: 0, denoise: 0, dehaze: 0 },
    fx: { vignette: 0, grain: 0, halation: 0 },
    geo: { crop: { x: 0, y: 0, w: 1, h: 1 }, aspect: null, rot90: 0, angle: 0, flipH: false, flipV: false },
    masks: {
      person: { exposure: 0, contrast: 0, saturation: 0, temp: 0 },
      sky: { exposure: 0, contrast: 0, saturation: 0, temp: 0 },
      background: { exposure: 0, contrast: 0, saturation: 0, temp: 0 },
      skinProtect: 0,
    },
    pro: { amount: 0, blur: 60, subject: 60, skin: 45, face: 55 },
  });
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function sectionIsDefault(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  /* Al 0 % de intensidad y sin ajustes, la app debe devolver el original exacto. */
  function colorIsIdentity(p) {
    const d = defaultParams();
    const lutOff = !p.presetId || p.intensity === 0;
    const autoOff = !p.auto || !p.auto.amount;
    return lutOff && autoOff && !p.fix && !(p.pro && p.pro.amount) && sectionIsDefault(p.light, d.light) && sectionIsDefault(p.color, d.color) && sectionIsDefault(p.curves, d.curves)
      && sectionIsDefault(p.grade, d.grade) && sectionIsDefault(p.detail, d.detail) && sectionIsDefault(p.fx, d.fx)
      && sectionIsDefault(p.masks, d.masks) && !p.xmpOverlay;
  }
  function geoIsIdentity(g) {
    return g.rot90 % 4 === 0 && g.angle === 0 && !g.flipH && !g.flipV && g.crop.x === 0 && g.crop.y === 0 && g.crop.w === 1 && g.crop.h === 1;
  }

  /* Suma ajuste manual + autoajuste + acabado del look. Lo que el usuario mueve siempre se conserva aparte. */
  function effectiveParams(p, intensity) {
    const a = p.auto && p.auto.amount ? p.auto.amount / 100 : 0;
    const k = p.presetId ? (intensity === undefined ? p.intensity : intensity) / 100 : 0;
    const r = p.recipe && k ? p.recipe : null;
    const lutScale = p.presetId ? (p.recipe && p.recipe.lut !== undefined ? p.recipe.lut : 1) : 0;
    const fx = p.fix || null;
    if (!a && !r && !fx) return { ...p, _wb: [1, 1, 1], _fade: 0, _lutMix: k * lutScale };
    const q = { ...p, light: { ...p.light }, color: { ...p.color }, detail: { ...p.detail }, fx: { ...p.fx }, grade: { shadows: { ...p.grade.shadows }, mids: { ...p.grade.mids }, highs: { ...p.grade.highs } } };
    if (a) {
      for (const key of ['exposure', 'contrast', 'highlights', 'shadows', 'whites', 'blacks']) q.light[key] += (p.auto[key] || 0) * a;
      q.color.vibrance += (p.auto.vibrance || 0) * a;
      q.detail.clarity += (p.auto.clarity || 0) * a;
      q.detail.dehaze += (p.auto.dehaze || 0) * a;
    }
    if (r) {
      for (const key of Object.keys(r.light || {})) q.light[key] += r.light[key] * k;
      for (const key of Object.keys(r.color || {})) q.color[key] += r.color[key] * k;
      for (const key of Object.keys(r.detail || {})) q.detail[key] += r.detail[key] * k;
      for (const key of Object.keys(r.fx || {})) q.fx[key] += r.fx[key] * k;
      for (const key of ['shadows', 'mids', 'highs']) if (r.grade && r.grade[key] && !p.grade[key].s) q.grade[key] = { h: r.grade[key].h, s: r.grade[key].s * k };
    }
    if (fx) {
      for (const sec of ['light', 'color', 'detail', 'fx']) for (const key of Object.keys(fx[sec] || {})) q[sec][key] = (q[sec][key] || 0) + fx[sec][key];
      if (fx.masksSkin) q.masks = { ...p.masks, skinProtect: Math.max(p.masks.skinProtect, fx.masksSkin) };
    }
    const wb = p.auto && p.auto.wb ? p.auto.wb.map((g) => 1 + (g - 1) * a) : [1, 1, 1];
    return { ...q, _wb: wb, _fade: r && r.fade ? r.fade * k : 0, _lutMix: k * lutScale };
  }
  /* Lee la foto y decide cómo corregirla antes de aplicar cualquier look. */
  function autoAdjust(s, scene) {
    const toLin = srgb2lin;
    const notes = [];
    const night = scene && scene.id === 'noche', portrait = scene && scene.id === 'retrato';
    const highKey = s.p50 > 0.68 && s.std < 0.16 && s.p1 < 0.3;
    const target = night ? 0.36 : portrait ? 0.5 : 0.46;
    let ev = Math.log2(toLin(target) / Math.max(toLin(s.p50), 0.002));
    ev *= ev > 0 ? 0.78 : s.p50 < 0.72 && s.clipHi < 0.05 ? 0.35 : 0.72;
    ev = clamp(ev, -1.2, night ? 1.2 : 1.9);
    if (Math.abs(ev) < 0.1 || (highKey && ev < 0)) ev = 0;
    const label = s.mean < 0.3 || s.p50 < 0.22 ? 'oscura' : s.mean > 0.62 || s.clipHi > 0.06 ? 'clara' : s.std < 0.15 ? 'plana' : 'equilibrada';
    let shadows = 0, highlights = 0, whites = 0, blacks = 0, contrast = 0, dehaze = 0, clarity = 0;
    if (s.p10 < 0.14) shadows = clamp((0.16 - s.p10) * 200, 0, 42);
    if (s.p99 > 0.965 || s.clipHi > 0.01) highlights = -clamp(14 + s.clipHi * 500, 0, 55);
    if (ev > 0.2) highlights -= Math.min(22, ev * 14);
    if (s.p99 < 0.9) whites = clamp((0.96 - s.p99) * 150, 0, 38);
    if (s.p1 > 0.05) blacks = -clamp((s.p1 - 0.015) * 190, 0, 36);
    if (s.std < 0.17) contrast = clamp((0.2 - s.std) * 220, 0, 24);
    else if (s.std > 0.31) contrast = -8;
    if (s.p1 > 0.11 && s.std < 0.16) dehaze = 22;
    if (!portrait && !night) clarity = 8;
    /* Balance de blancos en luz lineal, usando píxeles casi neutros */
    let wb = [1, 1, 1];
    const n = s.neutralShare > 0.05 && s.neutralRGB ? s.neutralRGB : s.meanLin;
    if (n && s.cast !== 'neutra') {
      const warmScene = (scene && scene.id === 'comida') || (s.skyTop > 0.2 && s.cct < 4500);
      const strength = (s.neutralShare > 0.05 ? 0.62 : 0.28) * (warmScene ? 0.4 : 1);
      const g = n[1] || 1e-3;
      wb = [g / Math.max(n[0], 1e-3), 1, g / Math.max(n[2], 1e-3)].map((v) => clamp(1 + (v - 1) * strength, 0.78, 1.28));
      const y = 0.2126 * wb[0] + 0.7152 * wb[1] + 0.0722 * wb[2];
      wb = wb.map((v) => v / y);
    }
    const vibrance = s.chroma < 0.16 ? 18 : s.chroma > 0.36 ? 0 : 8;
    const fmt = (v) => `${v > 0 ? '+' : ''}${v.toFixed(2)} EV`;
    if (label === 'oscura') notes.push(`Foto oscura: subí la luz ${fmt(ev)}`);
    else if (label === 'clara') notes.push(ev < 0 ? `Foto muy clara: bajé la luz ${fmt(ev)}` : 'Foto clara: conservé la luz');
    else if (ev) notes.push(`Corregí la luz ${fmt(ev)}`);
    else notes.push('La luz ya estaba bien');
    if (shadows > 8) notes.push(`Abrí las sombras ${Math.round(shadows)}`);
    if (highlights < -8) notes.push(`Recuperé altas luces ${Math.round(highlights)}`);
    if (Math.abs(wb[0] - wb[2]) > 0.03) notes.push(wb[2] > wb[0] ? `Quité dominante cálida (${s.cct.toLocaleString('es-GT')} K aparentes)` : `Quité dominante fría (${s.cct.toLocaleString('es-GT')} K aparentes)`);
    if (contrast > 6) notes.push(`Foto plana: subí contraste ${Math.round(contrast)}`);
    if (dehaze) notes.push('Quité neblina');
    if (vibrance > 10) notes.push(`Foto apagada: subí color ${vibrance}`);
    const r = (v) => Math.round(v * 100) / 100;
    return { amount: 100, exposure: r(ev), contrast: r(contrast), highlights: r(highlights), shadows: r(shadows), whites: r(whites), blacks: r(blacks), vibrance, clarity, dehaze, wb: wb.map((v) => Math.round(v * 1000) / 1000), label, notes };
  }

  /* Look que se adapta a cada foto: lee su luz y su color y nunca la oscurece */
  function smartRecipe(fin, s, scene) {
    const r = JSON.parse(JSON.stringify(fin));
    const light = (r.light = r.light || {}), color = (r.color = r.color || {}), detail = (r.detail = r.detail || {});
    const add = (o, k, v) => { o[k] = Math.round(((o[k] || 0) + v) * 100) / 100; };
    const night = scene && scene.id === 'noche', portrait = scene && scene.id === 'retrato', land = scene && scene.id === 'paisaje';
    const target = night ? Math.min(r.target || 0.46, 0.46) : r.target || 0.54;
    const room = s.clipHi > 0.04 ? 0.35 : 1;
    const ev = clamp(Math.log2(srgb2lin(target) / Math.max(srgb2lin(s.p50), 0.004)) * 0.72 * room, 0, night ? 1 : 1.5);
    add(light, 'exposure', Math.round(ev * 100) / 100);
    if (s.p10 < 0.14) add(light, 'shadows', clamp((0.16 - s.p10) * 170, 0, 30));
    if (s.p99 > 0.965 || s.clipHi > 0.01) add(light, 'highlights', -clamp(8 + s.clipHi * 320, 0, 34));
    if (s.std < 0.17) add(light, 'contrast', clamp((0.2 - s.std) * 170, 0, 18));
    else if (s.std > 0.3) light.contrast = Math.round((light.contrast || 0) * 0.5);
    if (s.p1 > 0.06) add(light, 'blacks', -clamp((s.p1 - 0.02) * 150, 0, 24));
    if (s.chroma < 0.16) add(color, 'vibrance', 12);
    else if (s.chroma > 0.34) color.vibrance = Math.round((color.vibrance || 0) * 0.3);
    if (s.cast === 'cálida' && s.cct < 4300) add(color, 'temp', -8);
    else if (s.cast === 'fría' && s.cct > 7500) add(color, 'temp', 8);
    if (portrait) { detail.clarity = Math.min(detail.clarity || 0, 5); add(color, 'vibrance', -2); }
    if (land) { add(detail, 'clarity', 4); if (s.p1 > 0.05) add(detail, 'dehaze', 6); }
    if (night) add(detail, 'denoise', 8);
    delete r.target; delete r.scenes;
    return r;
  }

  /* ---------- Diagnóstico y sugerencias ---------- */
  function diagnose(s, scene) {
    const issues = [];
    const add = (id, title, fixes) => issues.push({ id, title, fixes });
    const portrait = (scene && scene.id === 'retrato') || s.faces > 0;
    const range = s.p99 - s.p1;
    if (s.mean < 0.14 || s.p50 < 0.09) {
      add('dark', 'Foto muy oscura', [
        { id: 'rescate-fuerte', name: 'Rescate de luz', fix: { light: { exposure: 0.55, shadows: 45, blacks: 10, whites: 12 }, color: { vibrance: 8 }, detail: { denoise: 22 } } },
        { id: 'noche-limpia', name: 'Noche limpia', fix: { light: { exposure: 0.2, shadows: 26, contrast: 8 }, color: { vibrance: 6 }, detail: { denoise: 30 } } },
      ]);
    } else if (s.mean < 0.3 || s.p50 < 0.22) {
      add('dark', 'Foto oscura', [
        { id: 'rescatar-luz', name: 'Rescatar luz', fix: { light: { exposure: 0.3, shadows: 32, whites: 10 }, color: { vibrance: 6 }, detail: { denoise: 8 } } },
        { id: 'sombras-abiertas', name: 'Abrir sombras', fix: { light: { shadows: 42, highlights: -10, contrast: 4 } } },
      ]);
    }
    if (s.clipHi > 0.06) {
      add('bright', 'Altas luces quemadas', [
        { id: 'recuperar-luces', name: 'Recuperar luces', fix: { light: { exposure: -0.22, highlights: -42, whites: -16, contrast: 8 } } },
      ]);
    }
    if (s.std < 0.15 || range < 0.62) {
      add('flat', 'Foto opaca', [
        { id: 'dar-vida', name: 'Dar vida', fix: { light: { contrast: 18, blacks: -12, whites: 10 }, color: { vibrance: 18 }, detail: { clarity: 14 } } },
        { id: 'quitar-opacidad', name: 'Quitar opacidad', fix: { light: { contrast: 8, blacks: -8 }, detail: { dehaze: 32, clarity: 8 } } },
      ]);
    }
    if (s.chroma > 0.36 || s.satClip > 0.12) {
      add('oversat', 'Mucha saturación', [
        { id: 'color-natural', name: 'Color natural', fix: { color: { saturation: -20, vibrance: -6 }, light: { contrast: 4 } } },
        { id: 'color-elegante', name: 'Color elegante', fix: { color: { saturation: -32 }, light: { contrast: 10, highlights: -8 } } },
      ]);
    } else if (s.chroma < 0.13) {
      add('dull', 'Color apagado', [
        { id: 'color-vivo', name: 'Color vivo', fix: { color: { vibrance: 30, saturation: 6 }, light: { contrast: 6 } } },
      ]);
    }
    if (s.p10 < 0.08 && s.p90 > 0.8 && s.std > 0.27) {
      add('backlit', 'Contraluz', [
        { id: 'equilibrar-contraluz', name: 'Equilibrar contraluz', fix: { light: { shadows: 52, highlights: -38, contrast: -4 }, detail: { clarity: 6 } } },
      ]);
    }
    if (s.cast === 'cálida' && s.cct < 4300) add('warm', 'Luz muy cálida', [{ id: 'enfriar', name: 'Luz neutra', fix: { color: { temp: -14 } } }]);
    if (s.cast === 'fría' && s.cct > 7500) add('cool', 'Luz muy fría', [{ id: 'calentar', name: 'Luz cálida', fix: { color: { temp: 14 } } }]);
    if (portrait) issues.push({ id: 'portrait', title: 'Retrato', fixes: [{ id: 'retrato-pro', name: 'Retrato pro', fix: { light: { highlights: -10, shadows: 12 }, color: { vibrance: 6, temp: 3 }, detail: { texture: -10, clarity: 4 }, masksSkin: 40 } }] });
    if (!issues.length) issues.push({ id: 'ok', title: 'Buena foto', fixes: [
      { id: 'pulido-pro', name: 'Pulido pro', fix: { light: { contrast: 8, shadows: 8, highlights: -8 }, color: { vibrance: 12 }, detail: { clarity: 8 } } },
      { id: 'mas-impacto', name: 'Más impacto', fix: { light: { contrast: 14, blacks: -8 }, color: { vibrance: 20 }, detail: { clarity: 12 }, fx: { vignette: -10 } } },
    ] });
    /* Primero la mejor sugerencia de cada problema; luego las alternativas */
    const fixes = [];
    for (let round = 0; round < 2; round++) for (const i of issues) if (i.fixes[round] && fixes.length < 5) fixes.push({ ...i.fixes[round], issue: i.title });
    const real = issues.filter((i) => !['ok', 'portrait'].includes(i.id));
    const summary = real.length ? real.slice(0, 2).map((i) => i.title).join(' y ') : issues[0].title;
    return { issues, fixes, summary, ids: new Set(issues.map((i) => i.id)) };
  }

  /* Contraste adaptativo (CAS): afila bordes sin halos y casi sin subir el ruido. */
  function casSharpen(src, w, h, amount) {
    const out = new Uint8ClampedArray(src.length);
    const peak = -1 / (8 - 3 * clamp(amount)), row = w * 4;
    for (let y = 0; y < h; y++) {
      const up = y > 0 ? -row : 0, dn = y < h - 1 ? row : 0;
      for (let x = 0, k = y * row; x < w; x++, k += 4) {
        const lf = x > 0 ? -4 : 0, rt = x < w - 1 ? 4 : 0;
        const g = src[k + 1], gn = src[k + up + 1], gs = src[k + dn + 1], gw = src[k + lf + 1], ge = src[k + rt + 1];
        let mn = g, mx = g;
        if (gn < mn) mn = gn; else if (gn > mx) mx = gn;
        if (gs < mn) mn = gs; else if (gs > mx) mx = gs;
        if (gw < mn) mn = gw; else if (gw > mx) mx = gw;
        if (ge < mn) mn = ge; else if (ge > mx) mx = ge;
        const room = mn < 255 - mx ? mn : 255 - mx;
        if (mx === 0 || room <= 0) { out[k] = src[k]; out[k + 1] = g; out[k + 2] = src[k + 2]; out[k + 3] = src[k + 3]; continue; }
        const wgt = Math.sqrt(room / mx) * peak, div = 1 / (1 + 4 * wgt);
        out[k] = (src[k] + wgt * (src[k + up] + src[k + dn] + src[k + lf] + src[k + rt])) * div;
        out[k + 1] = (g + wgt * (gn + gs + gw + ge)) * div;
        out[k + 2] = (src[k + 2] + wgt * (src[k + up + 2] + src[k + dn + 2] + src[k + lf + 2] + src[k + rt + 2])) * div;
        out[k + 3] = src[k + 3];
      }
    }
    return out;
  }
  /* Nitidez para redes: refuerza los bordes y deja quietas las zonas lisas, que son las que la compresión pixela. */
  function edgeSharpen(src, w, h, amount) {
    const n = w * h, Y = new Float32Array(n), T = new Float32Array(n), B = new Float32Array(n);
    for (let i = 0, k = 0; i < n; i++, k += 4) Y[i] = 0.2126 * src[k] + 0.7152 * src[k + 1] + 0.0722 * src[k + 2];
    for (let y = 0; y < h; y++) {
      const r = y * w;
      for (let x = 0; x < w; x++) T[r + x] = (Y[r + (x > 0 ? x - 1 : 0)] + 2 * Y[r + x] + Y[r + (x < w - 1 ? x + 1 : x)]) * 0.25;
    }
    for (let y = 0; y < h; y++) {
      const r = y * w, u = y > 0 ? r - w : r, d = y < h - 1 ? r + w : r;
      for (let x = 0; x < w; x++) B[r + x] = (T[u + x] + 2 * T[r + x] + T[d + x]) * 0.25;
    }
    const out = new Uint8ClampedArray(src.length);
    for (let y = 0; y < h; y++) {
      const r = y * w, u = y > 0 ? r - w : r, d = y < h - 1 ? r + w : r;
      for (let x = 0; x < w; x++) {
        const i = r + x, k = i * 4, lf = x > 0 ? i - 1 : i, rt = x < w - 1 ? i + 1 : i;
        const gx = Math.abs(B[rt] - B[lf]), gy = Math.abs(B[d + x] - B[u + x]);
        let t = ((gx > gy ? gx : gy) - 4) / 14;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        let add = (Y[i] - B[i]) * amount * t * t * (3 - 2 * t);
        add = add > 28 ? 28 : add < -28 ? -28 : add;
        out[k] = src[k] + add; out[k + 1] = src[k + 1] + add; out[k + 2] = src[k + 2] + add; out[k + 3] = src[k + 3];
      }
    }
    return out;
  }
  /* ---------- Modo Pro: recorte fino de la persona ---------- */
  function boxMean(src, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const o = y * w;
      let s = 0, n = 0;
      for (let x = 0; x <= Math.min(r, w - 1); x++) { s += src[o + x]; n++; }
      for (let x = 0; x < w; x++) {
        tmp[o + x] = s / n;
        if (x + r + 1 < w) { s += src[o + x + r + 1]; n++; }
        if (x - r >= 0) { s -= src[o + x - r]; n--; }
      }
    }
    const sum = new Float64Array(w);
    let n = 0;
    for (let y = 0; y <= Math.min(r, h - 1); y++) { const o = y * w; for (let x = 0; x < w; x++) sum[x] += tmp[o + x]; n++; }
    for (let y = 0; y < h; y++) {
      const o = y * w;
      for (let x = 0; x < w; x++) out[o + x] = sum[x] / n;
      if (y + r + 1 < h) { const a = (y + r + 1) * w; for (let x = 0; x < w; x++) sum[x] += tmp[a + x]; n++; }
      if (y - r >= 0) { const a = (y - r) * w; for (let x = 0; x < w; x++) sum[x] -= tmp[a + x]; n--; }
    }
    return out;
  }
  /* Filtro guiado: pega el borde de la máscara a los bordes reales de la foto */
  function guidedFilter(I, p, w, h, r, eps) {
    const n = w * h, II = new Float32Array(n), Ip = new Float32Array(n);
    for (let i = 0; i < n; i++) { II[i] = I[i] * I[i]; Ip[i] = I[i] * p[i]; }
    const mI = boxMean(I, w, h, r), mP = boxMean(p, w, h, r), mII = boxMean(II, w, h, r), mIp = boxMean(Ip, w, h, r);
    const a = new Float32Array(n), b = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      a[i] = (mIp[i] - mI[i] * mP[i]) / (mII[i] - mI[i] * mI[i] + eps);
      b[i] = mP[i] - a[i] * mI[i];
    }
    const mA = boxMean(a, w, h, r), mB = boxMean(b, w, h, r), q = new Float32Array(n);
    for (let i = 0; i < n; i++) q[i] = mA[i] * I[i] + mB[i];
    return q;
  }
  function resampleBilinear(src, sw, sh, w, h) {
    const out = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const fy = h > 1 ? (y / (h - 1)) * (sh - 1) : 0, y0 = Math.floor(fy), y1 = Math.min(sh - 1, y0 + 1), ty = fy - y0;
      for (let x = 0; x < w; x++) {
        const fx = w > 1 ? (x / (w - 1)) * (sw - 1) : 0, x0 = Math.floor(fx), x1 = Math.min(sw - 1, x0 + 1), tx = fx - x0;
        const a = src[y0 * sw + x0] * (1 - tx) + src[y0 * sw + x1] * tx, b = src[y1 * sw + x0] * (1 - tx) + src[y1 * sw + x1] * tx;
        out[y * w + x] = a * (1 - ty) + b * ty;
      }
    }
    return out;
  }
  /* Deja al sujeto principal y descarta personas pequeñas del fondo */
  function keepMainSubject(p, w, h) {
    const n = w * h, labels = new Int32Array(n), stack = new Int32Array(n), comps = [];
    for (let i = 0; i < n; i++) {
      if (labels[i] || p[i] <= 0.5) continue;
      const id = comps.length + 1;
      let sp = 0, area = 0, x0 = w, y0 = h, x1 = 0, y1 = 0;
      stack[sp++] = i; labels[i] = id;
      while (sp) {
        const k = stack[--sp], x = k % w, y = (k - x) / w;
        area++;
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        if (x > 0 && !labels[k - 1] && p[k - 1] > 0.5) { labels[k - 1] = id; stack[sp++] = k - 1; }
        if (x < w - 1 && !labels[k + 1] && p[k + 1] > 0.5) { labels[k + 1] = id; stack[sp++] = k + 1; }
        if (y > 0 && !labels[k - w] && p[k - w] > 0.5) { labels[k - w] = id; stack[sp++] = k - w; }
        if (y < h - 1 && !labels[k + w] && p[k + w] > 0.5) { labels[k + w] = id; stack[sp++] = k + w; }
      }
      comps.push({ id, area, x0, y0, x1, y1 });
    }
    if (!comps.length) return { p, kept: 0, removed: 0 };
    const big = Math.max(...comps.map((q) => q.area)), keep = comps.filter((q) => q.area >= big * 0.25), drop = comps.filter((q) => q.area < big * 0.25);
    const ids = new Set(keep.map((q) => q.id)), pad = Math.round(Math.max(w, h) * 0.012);
    const out = p.slice();
    for (const d of drop) {
      /* Solo se borra lo que está pegado a esa persona; nada de lo que rodea al sujeto principal */
      const near = new Uint8Array(n);
      for (let y = Math.max(0, d.y0); y <= d.y1; y++) for (let x = Math.max(0, d.x0); x <= d.x1; x++) {
        if (labels[y * w + x] !== d.id) continue;
        for (let dy = -pad; dy <= pad; dy++) for (let dx = -pad; dx <= pad; dx++) {
          const yy = y + dy, xx = x + dx;
          if (yy >= 0 && yy < h && xx >= 0 && xx < w) near[yy * w + xx] = 1;
        }
      }
      for (let y = Math.max(0, d.y0 - pad); y <= Math.min(h - 1, d.y1 + pad); y++) for (let x = Math.max(0, d.x0 - pad); x <= Math.min(w - 1, d.x1 + pad); x++) {
        const k = y * w + x;
        if (near[k] && !ids.has(labels[k])) out[k] = Math.min(out[k], labels[k] ? 0 : p[k] * 0.3);
      }
    }
    return { p: out, kept: keep.length, removed: drop.length };
  }
  /* Encuadre cuadrado alrededor de la persona para una segunda lectura con más detalle */
  function segmentBox(seg) {
    const person = new Float32Array(seg.w * seg.h);
    for (let i = 0; i < person.length; i++) person[i] = 1 - seg.bg[i];
    const main = keepMainSubject(person, seg.w, seg.h);
    if (!main.kept) return null;
    let x0 = seg.w, y0 = seg.h, x1 = -1, y1 = -1;
    for (let y = 0; y < seg.h; y++) for (let x = 0; x < seg.w; x++) if (main.p[y * seg.w + x] > 0.5) {
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (x1 < 0) return null;
    const side = Math.min(Math.max(seg.w, seg.h), Math.max(x1 - x0, y1 - y0) * 1.26 + 8);
    const sx = Math.min(side, seg.w), sy = Math.min(side, seg.h);
    const bx = clamp((x0 + x1 - sx) / 2, 0, seg.w - sx), by = clamp((y0 + y1 - sy) / 2, 0, seg.h - sy);
    if ((sx * sy) / (seg.w * seg.h) > 0.85) return null;
    return { x: bx / seg.w, y: by / seg.h, w: sx / seg.w, h: sy / seg.h };
  }
  function mergeSegments(a, b, box, w, h) {
    const out = resampleBilinear(a, b.aw, b.ah, w, h), fine = b.field;
    for (let y = 0; y < h; y++) {
      const v = ((y + 0.5) / h - box.y) / box.h;
      if (v < 0 || v >= 1) continue;
      for (let x = 0; x < w; x++) {
        const u = ((x + 0.5) / w - box.x) / box.w;
        if (u < 0 || u >= 1) continue;
        const fx = u * (b.w - 1), fy = v * (b.h - 1), x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(b.w - 1, x0 + 1), y1 = Math.min(b.h - 1, y0 + 1), tx = fx - x0, ty = fy - y0;
        const val = (fine[y0 * b.w + x0] * (1 - tx) + fine[y0 * b.w + x1] * tx) * (1 - ty) + (fine[y1 * b.w + x0] * (1 - tx) + fine[y1 * b.w + x1] * tx) * ty;
        const edge = Math.min(u, 1 - u, v, 1 - v), k = box.x + box.w >= 1 && box.x <= 0 && box.y <= 0 && box.y + box.h >= 1 ? 1 : Math.min(1, edge / 0.04);
        out[y * w + x] += (val - out[y * w + x]) * k;
      }
    }
    return out;
  }
  function proMatte(rgba, w, h, seg, seg2, box) {
    const n = w * h, long = Math.max(w, h), I = new Float32Array(n);
    for (let i = 0, k = 0; i < n; i++, k += 4) I[i] = (0.2126 * rgba[k] + 0.7152 * rgba[k + 1] + 0.0722 * rgba[k + 2]) / 255;
    const field = (name) => (seg2 && box ? mergeSegments(seg[name], { aw: seg.w, ah: seg.h, w: seg2.w, h: seg2.h, field: seg2[name] }, box, w, h) : resampleBilinear(seg[name], seg.w, seg.h, w, h));
    const bgF = field('bg'), person = new Float32Array(n);
    for (let i = 0; i < n; i++) person[i] = 1 - bgF[i];
    const main = keepMainSubject(person, w, h);
    if (!main.kept) return { person: false };
    const r = Math.max(3, Math.round(long / 128));
    const q = guidedFilter(I, main.p, w, h, r, 0.0009);
    const skin = field('skin'), face = field('face');
    const data = new Uint8Array(n * 4);
    let top = h, bottom = -1, sumS = 0, nS = 0, sumF = 0, nF = 0, area = 0;
    const need = Math.max(2, Math.round(w * 0.002));
    for (let y = 0; y < h; y++) {
      let row = 0;
      for (let x = 0; x < w; x++) {
        const i = y * w + x, k = i * 4;
        let t = (q[i] - 0.42) / 0.44;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
        const m = t * t * (3 - 2 * t), sk = Math.min(1, skin[i]) * m, fa = Math.min(1, face[i]) * m;
        data[k] = m * 255; data[k + 1] = sk * 255; data[k + 2] = fa * 255; data[k + 3] = 255;
        if (m > 0.5) { row++; area++; }
        if (m > 0.8) { sumS += I[i]; nS++; }
        if (fa > 0.6) { sumF += I[i]; nF++; } else if (!nF && sk > 0.6) { sumF += I[i] * 0.2; nF += 0.2; }
      }
      if (row >= need) { if (y < top) top = y; bottom = y; }
    }
    if (bottom < 0 || area < n * 0.004) return { person: false };
    const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    const subjectY = nS ? sumS / nS : 0.5, faceY = nF ? sumF / nF : subjectY;
    const subjEv = clamp(Math.log2(lin(0.5) / Math.max(lin(subjectY), 0.002)) * 0.6, -0.25, 0.7);
    const faceEv = clamp(Math.log2(lin(0.6) / Math.max(lin(faceY), 0.002)) * 0.5, 0, 0.6);
    const feetSeen = (bottom + 1) / h < 0.985;
    return { person: true, data, w, h, feet: feetSeen ? (bottom + 1) / h : -1, personH: (bottom + 1 - top) / h, subjEv, faceEv, share: area / n, others: main.removed };
  }
  /* Une la reconstrucción con el detalle real para que no se vea pintada. */
  function fuseImages(ai, base, mix) {
    const out = new Uint8ClampedArray(ai.length);
    for (let i = 0; i < ai.length; i += 4) {
      out[i] = ai[i] * mix + base[i] * (1 - mix);
      out[i + 1] = ai[i + 1] * mix + base[i + 1] * (1 - mix);
      out[i + 2] = ai[i + 2] * mix + base[i + 2] * (1 - mix);
      out[i + 3] = base[i + 3];
    }
    return out;
  }
  /* Decide cómo llegar a la salida sin pedirle nada a la persona. */
  function qualityPlan(w, h, mode) {
    const t = targetDims(w, h, mode), long = Math.max(w, h);
    if (mode === 'original') return { ...t, kind: 'none', input: 1, mix: 0, cas: 0 };
    if (mode === 'detail') return { ...t, kind: 'fusion', input: long > 2400 ? 2400 / long : 1, mix: 0.6, cas: 0.5 };
    if (SOCIAL_MODES.has(mode) && long >= t.long) return { ...t, kind: 'resize', input: 1, mix: 0, cas: 0, edge: mode === 'whatsappHd' ? 1.6 : 2.2 };
    if (long >= t.long) return { ...t, kind: 'resize', input: 1, mix: 0, cas: 0.45 };
    return { ...t, kind: 'rebuild', input: 1, mix: 0.82, cas: 0.4 };
  }

  /* ---------- Dimensiones y geometría ---------- */
  const QUALITY = { original: null, detail: null, whatsappHd: 3840, facebook: 2048, instagram: 1080, perfil: 640, '1080p': 1920, '4k': 3840 };
  const SOCIAL_MODES = new Set(['whatsappHd', 'perfil']);
  function targetDims(w, h, mode) {
    const long = QUALITY[mode];
    if (!long) return { w, h, long: Math.max(w, h), upscale: false, downscale: false };
    if (mode === 'instagram') {
      const th = Math.max(1, Math.round(h * long / w));
      return { w: long, h: th, long: Math.max(long, th), upscale: w < long, downscale: w > long };
    }
    const m = Math.max(w, h);
    const s = long / m;
    const tw = w >= h ? long : Math.max(1, Math.round(w * s));
    const th = h > w ? long : Math.max(1, Math.round(h * s));
    return { w: tw, h: th, long, upscale: m < long, downscale: m > long };
  }
  function frameSize(geo, W, H) {
    const odd = ((geo.rot90 % 4) + 4) % 2 === 1;
    return odd ? { w: H, h: W } : { w: W, h: H };
  }
  function geoOutputSize(geo, W, H) {
    const f = frameSize(geo, W, H);
    return { w: Math.max(1, Math.round(geo.crop.w * f.w)), h: Math.max(1, Math.round(geo.crop.h * f.h)) };
  }
  /* Matriz afín [a,b,c,d,e,f]: su = a·u + b·v + c ; sv = d·u + e·v + f.
     Convierte coordenadas de salida (0..1 dentro del recorte) a coordenadas de la foto de origen. */
  function geoMatrix(geo, W, H) {
    const f = frameSize(geo, W, H);
    const rot = ((geo.rot90 % 4) + 4) % 4;
    const ang = (geo.angle || 0) * Math.PI / 180;
    const cos = Math.cos(ang), sin = Math.sin(ang);
    const zoom = ang === 0 ? 1 : Math.abs(cos) + Math.abs(sin) * Math.max(f.w / f.h, f.h / f.w);
    const toSource = (u, v) => {
      let px = (geo.crop.x + u * geo.crop.w) * f.w - f.w / 2;
      let py = (geo.crop.y + v * geo.crop.h) * f.h - f.h / 2;
      const rx = (px * cos + py * sin) / zoom;
      const ry = (-px * sin + py * cos) / zoom;
      let sx, sy;
      if (rot === 0) { sx = rx; sy = ry; }
      else if (rot === 1) { sx = ry; sy = -rx; }
      else if (rot === 2) { sx = -rx; sy = -ry; }
      else { sx = -ry; sy = rx; }
      if (geo.flipH) sx = -sx;
      if (geo.flipV) sy = -sy;
      return [(sx + W / 2) / W, (sy + H / 2) / H];
    };
    const o = toSource(0, 0), ux = toSource(1, 0), vy = toSource(0, 1);
    return [ux[0] - o[0], vy[0] - o[0], o[0], ux[1] - o[1], vy[1] - o[1], o[1]];
  }
  const IDENTITY_XF = [1, 0, 0, 0, 1, 0];
  const applyXf = (m, u, v) => [m[0] * u + m[1] * v + m[2], m[3] * u + m[4] * v + m[5]];

  /* ---------- Curvas ---------- */
  function curveToTable(points, size = 256) {
    const p = points.slice().sort((a, b) => a[0] - b[0]);
    const n = p.length, t = new Float32Array(size);
    if (n === 2 && p[0][0] === 0 && p[0][1] === 0 && p[1][0] === 1 && p[1][1] === 1) {
      for (let i = 0; i < size; i++) t[i] = i / (size - 1);
      return t;
    }
    const dx = [], s = [], m = new Array(n).fill(0);
    for (let i = 0; i < n - 1; i++) {
      dx[i] = Math.max(1e-5, p[i + 1][0] - p[i][0]);
      s[i] = (p[i + 1][1] - p[i][1]) / dx[i];
    }
    m[0] = s[0]; m[n - 1] = s[n - 2];
    for (let i = 1; i < n - 1; i++) m[i] = s[i - 1] * s[i] <= 0 ? 0 : (s[i - 1] + s[i]) / 2;
    for (let i = 0; i < n - 1; i++) {
      if (s[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      const a = m[i] / s[i], b = m[i + 1] / s[i], q = a * a + b * b;
      if (q > 9) { const k = 3 / Math.sqrt(q); m[i] = k * a * s[i]; m[i + 1] = k * b * s[i]; }
    }
    let seg = 0;
    for (let i = 0; i < size; i++) {
      const x = i / (size - 1);
      if (x <= p[0][0]) { t[i] = p[0][1]; continue; }
      if (x >= p[n - 1][0]) { t[i] = p[n - 1][1]; continue; }
      while (seg < n - 2 && x > p[seg + 1][0]) seg++;
      const h = dx[seg], u = (x - p[seg][0]) / h, u2 = u * u, u3 = u2 * u;
      t[i] = clamp((2 * u3 - 3 * u2 + 1) * p[seg][1] + (u3 - 2 * u2 + u) * h * m[seg] + (-2 * u3 + 3 * u2) * p[seg + 1][1] + (u3 - u2) * h * m[seg + 1]);
    }
    return t;
  }

  /* ---------- LUT ---------- */
  function haldToCube(rgba, w, h) {
    const level = Math.round(Math.cbrt(w));
    if (w !== h || level * level * level !== w || level < 2) {
      throw new Error(`La imagen de ${w}×${h} px no es un HaldCLUT válido. Debe ser cuadrada y su lado un cubo perfecto, como 512 o 1728 px.`);
    }
    const size = level * level;
    if (rgba.length < w * h * 4) throw new Error('El HaldCLUT está incompleto.');
    return { size, data: rgba instanceof Uint8Array ? rgba : new Uint8Array(rgba.buffer, rgba.byteOffset, rgba.length), level };
  }
  function parseCube(text) {
    let size = 0, title = '', dmin = [0, 0, 0], dmax = [1, 1, 1], data = null, i = 0;
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line[0] === '#') continue;
      const up = line.toUpperCase();
      if (up.startsWith('TITLE')) { title = (line.match(/"(.*)"/) || [, line.slice(5).trim()])[1]; continue; }
      if (up.startsWith('LUT_1D_SIZE')) throw new Error('Este .cube es una LUT 1D. Importa una LUT 3D.');
      if (up.startsWith('LUT_3D_SIZE')) {
        size = parseInt(line.split(/\s+/)[1], 10);
        if (!(size >= 2 && size <= 129)) throw new Error('El tamaño de la LUT debe estar entre 2 y 129.');
        data = new Float32Array(size * size * size * 4);
        continue;
      }
      if (up.startsWith('DOMAIN_MIN')) { dmin = line.split(/\s+/).slice(1, 4).map(Number); continue; }
      if (up.startsWith('DOMAIN_MAX')) { dmax = line.split(/\s+/).slice(1, 4).map(Number); continue; }
      if (/^[A-Z_]/.test(up)) continue;
      if (!data) throw new Error('El .cube no declara LUT_3D_SIZE antes de los datos.');
      const v = line.split(/\s+/).map(Number);
      if (v.length < 3 || v.some(Number.isNaN)) throw new Error(`Línea no válida en el .cube: "${line}"`);
      if (i >= size ** 3) throw new Error('El .cube tiene más filas de las declaradas.');
      for (let c = 0; c < 3; c++) data[i * 4 + c] = clamp((v[c] - dmin[c]) / Math.max(1e-6, dmax[c] - dmin[c]));
      data[i * 4 + 3] = 1;
      i++;
    }
    if (!size) throw new Error('El archivo no declara LUT_3D_SIZE.');
    if (i !== size ** 3) throw new Error(`El .cube tiene ${i} filas y debería tener ${size ** 3}.`);
    return { size, data, title };
  }
  /* Tetraédrica en JS: misma fórmula que el shader de exportación. */
  function lutTetra(lut, r, g, b) {
    const n = lut.size, d = lut.data, scale = d instanceof Uint8Array ? 1 / 255 : 1;
    const at = (x, y, z, c) => d[(x + y * n + z * n * n) * 4 + c] * scale;
    const pr = clamp(r) * (n - 1), pg = clamp(g) * (n - 1), pb = clamp(b) * (n - 1);
    const x = Math.min(Math.floor(pr), n - 2), y = Math.min(Math.floor(pg), n - 2), z = Math.min(Math.floor(pb), n - 2);
    const fr = pr - x, fg = pg - y, fb = pb - z, out = [0, 0, 0];
    for (let c = 0; c < 3; c++) {
      const c000 = at(x, y, z, c), c111 = at(x + 1, y + 1, z + 1, c);
      let v;
      if (fr >= fg) {
        if (fg >= fb) v = c000 * (1 - fr) + at(x + 1, y, z, c) * (fr - fg) + at(x + 1, y + 1, z, c) * (fg - fb) + c111 * fb;
        else if (fr >= fb) v = c000 * (1 - fr) + at(x + 1, y, z, c) * (fr - fb) + at(x + 1, y, z + 1, c) * (fb - fg) + c111 * fg;
        else v = c000 * (1 - fb) + at(x, y, z + 1, c) * (fb - fr) + at(x + 1, y, z + 1, c) * (fr - fg) + c111 * fg;
      } else if (fb >= fg) v = c000 * (1 - fb) + at(x, y, z + 1, c) * (fb - fg) + at(x, y + 1, z + 1, c) * (fg - fr) + c111 * fr;
      else if (fb >= fr) v = c000 * (1 - fg) + at(x, y + 1, z, c) * (fg - fb) + at(x, y + 1, z + 1, c) * (fb - fr) + c111 * fr;
      else v = c000 * (1 - fg) + at(x, y + 1, z, c) * (fg - fr) + at(x + 1, y + 1, z, c) * (fr - fb) + c111 * fb;
      out[c] = v;
    }
    return out;
  }

  /* ---------- XMP de Lightroom ---------- */
  const HSL_NAMES = ['Red', 'Orange', 'Yellow', 'Green', 'Aqua', 'Blue', 'Purple', 'Magenta'];
  function parseXmp(xml) {
    const attrs = {};
    for (const m of xml.matchAll(/crs:([A-Za-z0-9_]+)\s*=\s*"([^"]*)"/g)) attrs[m[1]] = m[2];
    for (const m of xml.matchAll(/<crs:([A-Za-z0-9_]+)>([^<]+)<\/crs:\1>/g)) attrs[m[1]] = m[2];
    const curves = {};
    for (const m of xml.matchAll(/<crs:(ToneCurvePV2012(?:Red|Green|Blue)?)>([\s\S]*?)<\/crs:\1>/g)) {
      curves[m[1]] = [...m[2].matchAll(/<rdf:li>\s*(\d+)\s*,\s*(\d+)\s*<\/rdf:li>/g)].map((x) => [Number(x[1]) / 255, Number(x[2]) / 255]);
    }
    if (!Object.keys(attrs).length && !Object.keys(curves).length) {
      throw new Error('El archivo no contiene ajustes de Lightroom (crs:). Comprueba que sea un preset .xmp.');
    }
    const p = defaultParams(), applied = [], used = new Set();
    const num = (k) => { const v = parseFloat(attrs[k]); return Number.isFinite(v) ? v : null; };
    const map = (k, set, label) => {
      const v = num(k);
      used.add(k);
      if (v === null) return;
      set(v);
      if (v !== 0) applied.push(label);
    };
    map('Exposure2012', (v) => { p.light.exposure = clamp(v, -5, 5); }, 'Exposición');
    map('Contrast2012', (v) => { p.light.contrast = clamp(v, -100, 100); }, 'Contraste');
    map('Highlights2012', (v) => { p.light.highlights = clamp(v, -100, 100); }, 'Altas luces');
    map('Shadows2012', (v) => { p.light.shadows = clamp(v, -100, 100); }, 'Sombras');
    map('Whites2012', (v) => { p.light.whites = clamp(v, -100, 100); }, 'Blancos');
    map('Blacks2012', (v) => { p.light.blacks = clamp(v, -100, 100); }, 'Negros');
    map('IncrementalTemperature', (v) => { p.color.temp = clamp(v, -100, 100); }, 'Temperatura');
    map('IncrementalTint', (v) => { p.color.tint = clamp(v, -100, 100); }, 'Tinte');
    map('Vibrance', (v) => { p.color.vibrance = clamp(v, -100, 100); }, 'Vibrancia');
    map('Saturation', (v) => { p.color.saturation = clamp(v, -100, 100); }, 'Saturación');
    map('Clarity2012', (v) => { p.detail.clarity = clamp(v, -100, 100); }, 'Claridad');
    map('Texture', (v) => { p.detail.texture = clamp(v, -100, 100); }, 'Textura');
    map('Dehaze', (v) => { p.detail.dehaze = clamp(v, -100, 100); }, 'Neblina');
    map('Sharpness', (v) => { p.detail.sharpen = clamp(v / 1.5, 0, 100); }, 'Nitidez');
    map('LuminanceSmoothing', (v) => { p.detail.denoise = clamp(v, 0, 100); }, 'Reducción de ruido');
    map('PostCropVignetteAmount', (v) => { p.fx.vignette = clamp(v, -100, 100); }, 'Viñeta');
    map('GrainAmount', (v) => { p.fx.grain = clamp(v, 0, 100); }, 'Grano');
    HSL_NAMES.forEach((n, i) => {
      map('HueAdjustment' + n, (v) => { p.color.hsl.h[i] = clamp(v, -100, 100); }, 'HSL ' + n);
      map('SaturationAdjustment' + n, (v) => { p.color.hsl.s[i] = clamp(v, -100, 100); }, 'HSL ' + n);
      map('LuminanceAdjustment' + n, (v) => { p.color.hsl.l[i] = clamp(v, -100, 100); }, 'HSL ' + n);
    });
    const hs = [['SplitToningShadowHue', 'SplitToningShadowSaturation', 'shadows'], ['SplitToningHighlightHue', 'SplitToningHighlightSaturation', 'highs'],
      ['ColorGradeMidtoneHue', 'ColorGradeMidtoneSat', 'mids'], ['ColorGradeShadowHue', 'ColorGradeShadowSat', 'shadows'], ['ColorGradeHighlightHue', 'ColorGradeHighlightSat', 'highs']];
    for (const [hk, sk, target] of hs) {
      used.add(hk); used.add(sk);
      const h = num(hk), s = num(sk);
      if (s) { p.grade[target] = { h: h || 0, s: clamp(s) ? clamp(s, 0, 100) : 0 }; applied.push('Etalonaje'); }
    }
    const curveMap = { ToneCurvePV2012: 'rgb', ToneCurvePV2012Red: 'r', ToneCurvePV2012Green: 'g', ToneCurvePV2012Blue: 'b' };
    for (const k of Object.keys(curves)) {
      if (curves[k].length >= 2) { p.curves[curveMap[k]] = curves[k]; applied.push('Curvas'); }
    }
    const meta = new Set(['Version', 'ProcessVersion', 'PresetType', 'Cluster', 'UUID', 'SupportsAmount', 'SupportsColor', 'SupportsMonochrome', 'SupportsHighDynamicRange', 'SupportsNormalDynamicRange', 'SupportsSceneReferred', 'SupportsOutputReferred', 'RequiresRGBTables', 'CameraModelRestriction', 'Copyright', 'ContactInfo', 'Name', 'ShortName', 'SortName', 'Group', 'Description', 'HasSettings', 'AlreadyApplied', 'WhiteBalance', 'ToneCurveName2012', 'ToneCurveName', 'RawFileName', 'LookTable', 'ConvertToGrayscale', 'CameraProfile', 'CameraProfileDigest', 'OverrideLookVignette', 'AutoLateralCA', 'LensProfileEnable', 'LensManualDistortionAmount', 'PerspectiveUpright', 'PerspectiveVertical', 'PerspectiveHorizontal', 'PerspectiveRotate', 'PerspectiveScale', 'PerspectiveAspect', 'CompatibleVersion']);
    const ignored = Object.keys(attrs).filter((k) => !used.has(k) && !meta.has(k) && !curveMap[k] && attrs[k] !== '0' && attrs[k] !== '+0' && attrs[k] !== '0.00');
    if ((attrs.ConvertToGrayscale || '').toLowerCase() === 'true') ignored.unshift('ConvertToGrayscale');
    if (attrs.LookTable) ignored.unshift('LookTable (perfil interno)');
    return { params: p, applied: [...new Set(applied)], ignored, name: attrs.Name || attrs.ShortName || '' };
  }

  /* ---------- Lanczos 3 (también corre dentro del worker) ---------- */
  function lanczosKernel(x, a) {
    if (x === 0) return 1;
    if (Math.abs(x) >= a) return 0;
    const px = Math.PI * x;
    return a * Math.sin(px) * Math.sin(px / a) / (px * px);
  }
  /* Remuestrea una región. El origen se direcciona en píxeles globales de destino:
     source = (d + 0.5) · ratio − 0.5 − origin. Así los mosaicos quedan en fase entre ellos. */
  function lanczosRegion(src, sw, sh, channels, opt) {
    const { dw, dh, dx0 = 0, dy0 = 0, rx, ry, ox = 0, oy = 0 } = opt;
    const A = 3;
    const table = (dn, d0, ratio, orig, sn) => {
      const scale = Math.max(1, ratio), sup = A * scale, starts = new Int32Array(dn), counts = new Int32Array(dn), weights = [];
      for (let d = 0; d < dn; d++) {
        const c = (d + d0 + 0.5) * ratio - 0.5 - orig;
        const s0 = Math.ceil(c - sup), s1 = Math.floor(c + sup);
        const w = new Float32Array(s1 - s0 + 1);
        let sum = 0;
        for (let s = s0; s <= s1; s++) { const k = lanczosKernel((s - c) / scale, A); w[s - s0] = k; sum += k; }
        for (let i = 0; i < w.length; i++) w[i] /= sum || 1;
        starts[d] = s0; counts[d] = w.length; weights.push(w);
      }
      return { starts, counts, weights };
    };
    const tx = table(dw, dx0, rx, ox, sw), ty = table(dh, dy0, ry, oy, sh);
    const tmp = new Float32Array(dw * sh * channels);
    for (let y = 0; y < sh; y++) {
      const row = y * sw * channels, outRow = y * dw * channels;
      for (let d = 0; d < dw; d++) {
        const s0 = tx.starts[d], w = tx.weights[d], n = tx.counts[d];
        for (let c = 0; c < channels; c++) {
          let v = 0;
          for (let i = 0; i < n; i++) {
            const s = s0 + i, si = s < 0 ? 0 : s >= sw ? sw - 1 : s;
            v += src[row + si * channels + c] * w[i];
          }
          tmp[outRow + d * channels + c] = v;
        }
      }
    }
    const out = new Uint8ClampedArray(dw * dh * channels), col = dw * channels;
    for (let d = 0; d < dh; d++) {
      const s0 = ty.starts[d], w = ty.weights[d], n = ty.counts[d], outRow = d * col;
      for (let x = 0; x < col; x++) {
        let v = 0;
        for (let i = 0; i < n; i++) {
          const s = s0 + i, si = s < 0 ? 0 : s >= sh ? sh - 1 : s;
          v += tmp[si * col + x] * w[i];
        }
        out[outRow + x] = v;
      }
    }
    return out;
  }
  const lanczosResize = (src, sw, sh, dw, dh, channels = 4) => lanczosRegion(src, sw, sh, channels, { dw, dh, rx: sw / dw, ry: sh / dh });

  /* ---------- Mosaicos ---------- */
  function planTiles(W, H, tile, overlap) {
    if (tile <= overlap) throw new Error('El mosaico debe ser mayor que el solapamiento.');
    const axis = (n) => {
      if (n <= tile) return [[0, n]];
      const step = tile - overlap, out = [];
      for (let p = 0; ; p += step) {
        if (p + tile >= n) { out.push([n - tile, tile]); break; }
        out.push([p, tile]);
      }
      return out;
    };
    const xs = axis(W), ys = axis(H), tiles = [];
    for (const [y, th] of ys) for (const [x, tw] of xs) tiles.push({ x, y, w: tw, h: th });
    return tiles;
  }
  /* Rectángulo de destino y fundido para un mosaico de origen. */
  function destRegion(t, sW, sH, scale, overlap) {
    const dW = Math.round(sW * scale), dH = Math.round(sH * scale);
    const dx0 = t.x === 0 ? 0 : Math.ceil(t.x * scale), dy0 = t.y === 0 ? 0 : Math.ceil(t.y * scale);
    const dx1 = t.x + t.w >= sW ? dW : Math.floor((t.x + t.w) * scale), dy1 = t.y + t.h >= sH ? dH : Math.floor((t.y + t.h) * scale);
    const f = Math.max(1, overlap * scale);
    return { dx: dx0, dy: dy0, dw: dx1 - dx0, dh: dy1 - dy0, feather: [t.x === 0 ? 0 : f, t.y === 0 ? 0 : f, t.x + t.w >= sW ? 0 : f, t.y + t.h >= sH ? 0 : f] };
  }
  function blendTile(acc, wgt, W, H, reg, rgb, channels = 3) {
    const [fl, ft, fr, fb] = reg.feather;
    for (let j = 0; j < reg.dh; j++) {
      const wy = Math.min(ft ? (j + 0.5) / ft : 1, fb ? (reg.dh - j - 0.5) / fb : 1, 1);
      const Y = reg.dy + j;
      if (Y < 0 || Y >= H) continue;
      for (let i = 0; i < reg.dw; i++) {
        const wx = Math.min(fl ? (i + 0.5) / fl : 1, fr ? (reg.dw - i - 0.5) / fr : 1, 1);
        const X = reg.dx + i;
        if (X < 0 || X >= W) continue;
        const w = wx * wy, k = (j * reg.dw + i) * channels, o = Y * W + X;
        acc[o * 3] += rgb[k] * w;
        acc[o * 3 + 1] += rgb[k + 1] * w;
        acc[o * 3 + 2] += rgb[k + 2] * w;
        wgt[o] += w;
      }
    }
  }
  function resolveAccum(acc, wgt, W, H, alpha) {
    const out = new Uint8ClampedArray(W * H * 4);
    for (let o = 0; o < W * H; o++) {
      const w = wgt[o] || 1;
      out[o * 4] = acc[o * 3] / w;
      out[o * 4 + 1] = acc[o * 3 + 1] / w;
      out[o * 4 + 2] = acc[o * 3 + 2] / w;
      out[o * 4 + 3] = alpha ? alpha[o * 4 + 3] : 255;
    }
    return out;
  }

  /* ---------- Análisis de la foto ---------- */
  function rgbToHsv(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d > 1e-6) {
      if (mx === r) h = ((g - b) / d + 6) % 6;
      else if (mx === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, mx > 0 ? d / mx : 0, mx];
  }
  const isSkin = (r8, g8, b8) => {
    const y = 0.299 * r8 + 0.587 * g8 + 0.114 * b8;
    const cb = 128 - 0.168736 * r8 - 0.331264 * g8 + 0.5 * b8;
    const cr = 128 + 0.5 * r8 - 0.418688 * g8 - 0.081312 * b8;
    return y > 45 && y < 245 && cb > 80 && cb < 125 && cr > 135 && cr < 170 && r8 > g8 && g8 >= b8 * 0.9;
  };
  function analyzePixels(rgba, w, h, exif = {}) {
    const n = w * h;
    const hist = { l: new Uint32Array(256), r: new Uint32Array(256), g: new Uint32Array(256), b: new Uint32Array(256) };
    let sl = 0, sl2 = 0, sr = 0, sg = 0, sb = 0, ch = 0, lx = 0, ly = 0, lz = 0, nx = 0, ny = 0, nz = 0, nn = 0, nr = 0, ng = 0, nb = 0, alr = 0, alg = 0, alb = 0;
    let satClip = 0, dark = 0, skin = 0, green = 0, warmCenter = 0, center = 0, blueTop = 0, top = 0, skinCenter = 0, mid = 0;
    for (let y = 0, k = 0; y < h; y++) {
      const isTop = y < h * 0.35, cy = Math.abs(y / h - 0.5) < 0.3;
      for (let x = 0; x < w; x++, k += 4) {
        const R = rgba[k], G = rgba[k + 1], B = rgba[k + 2];
        const r = R / 255, g = G / 255, b = B / 255;
        const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        hist.l[Math.round(L * 255)]++; hist.r[R]++; hist.g[G]++; hist.b[B]++;
        sl += L; sl2 += L * L; sr += r; sg += g; sb += b;
        const [hu, sa, va] = rgbToHsv(r, g, b);
        ch += sa * va;
        const lr = srgb2lin(r), lg = srgb2lin(g), lb = srgb2lin(b);
        alr += lr; alg += lg; alb += lb;
        const X = 0.4124 * lr + 0.3576 * lg + 0.1805 * lb, Y = 0.2126 * lr + 0.7152 * lg + 0.0722 * lb, Z = 0.0193 * lr + 0.1192 * lg + 0.9505 * lb;
        lx += X; ly += Y; lz += Z;
        if (sa < 0.3 && va > 0.15 && va < 0.95) { nx += X; ny += Y; nz += Z; nr += lr; ng += lg; nb += lb; nn++; }
        if (L < 0.15) dark++;
        if (sa > 0.85 && va > 0.5) satClip++;
        if (L > 0.2 && L < 0.8) mid++;
        const inCenter = cy && Math.abs(x / w - 0.5) < 0.3;
        const sk = isSkin(R, G, B);
        if (sk) { skin++; if (inCenter) skinCenter++; }
        if (hu > 70 && hu < 170 && sa > 0.18 && va > 0.12) green++;
        if (inCenter) { center++; if ((hu < 60 || hu > 340) && sa > 0.3 && va > 0.25) warmCenter++; }
        if (isTop) { top++; if ((hu > 180 && hu < 250 && sa > 0.08 && va > 0.45) || (sa < 0.1 && va > 0.82)) blueTop++; }
      }
    }
    const mean = sl / n, std = Math.sqrt(Math.max(0, sl2 / n - mean * mean));
    const cum = (arr, q) => { let c = 0; for (let i = 0; i < 256; i++) { c += arr[i]; if (c >= q * n) return i / 255; } return 1; };
    const clipHi = (hist.l[255] + hist.l[254] + hist.l[253]) / n, clipLo = (hist.l[0] + hist.l[1] + hist.l[2]) / n;
    const refX = nn > n * 0.05 ? nx : lx, refY = nn > n * 0.05 ? ny : ly, refZ = nn > n * 0.05 ? nz : lz;
    const sum = refX + refY + refZ || 1, cx = refX / sum, cyy = refY / sum;
    const mcc = (cx - 0.332) / (0.1858 - cyy || 1e-6);
    const cct = clamp(449 * mcc ** 3 + 3525 * mcc ** 2 + 6823.3 * mcc + 5520.33, 1500, 15000);
    /* Dominante en Lab (D65) sobre la media */
    const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
    const mx = refX / (nn > n * 0.05 ? nn : n), my = refY / (nn > n * 0.05 ? nn : n), mz = refZ / (nn > n * 0.05 ? nn : n);
    const fx = f(mx / 0.9505), fy = f(my), fz = f(mz / 1.089);
    const a = 500 * (fx - fy), bb = 200 * (fy - fz);
    let cast = 'neutra';
    if (Math.hypot(a, bb) >= 4) {
      if (Math.abs(bb) >= Math.abs(a)) cast = bb > 0 ? 'cálida' : 'fría';
      else cast = a > 0 ? 'magenta' : 'verde';
    }
    /* Estructura: bordes alineados en horizontal o vertical */
    const gray = new Float32Array(n);
    for (let i = 0; i < n; i++) gray[i] = (rgba[i * 4] * 0.3 + rgba[i * 4 + 1] * 0.59 + rgba[i * 4 + 2] * 0.11) / 255;
    let strong = 0, aligned = 0;
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx = gray[i - w + 1] + 2 * gray[i + 1] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - 1] - gray[i + w - 1];
      const gy = gray[i + w - 1] + 2 * gray[i + w] + gray[i + w + 1] - gray[i - w - 1] - 2 * gray[i - w] - gray[i - w + 1];
      const m = Math.hypot(gx, gy);
      if (m > 0.35) {
        strong++;
        const an = Math.abs(Math.atan2(gy, gx) * 180 / Math.PI) % 90;
        if (an < 8 || an > 82) aligned++;
      }
    }
    return {
      w, h, hist, mean, std, p1: cum(hist.l, 0.01), p10: cum(hist.l, 0.1), p50: cum(hist.l, 0.5), p90: cum(hist.l, 0.9), p99: cum(hist.l, 0.99), neutralRGB: nn ? [nr / nn, ng / nn, nb / nn] : null, neutralShare: nn / n, meanLin: [alr / n, alg / n, alb / n], clipHi, clipLo, meanRGB: [sr / n, sg / n, sb / n],
      chroma: ch / n, satClip: satClip / n, cct: Math.round(cct / 10) * 10, labA: a, labB: bb, cast,
      skin: skin / n, skinCenter: center ? skinCenter / center : 0, green: green / n, warmCenter: center ? warmCenter / center : 0, skyTop: top ? blueTop / top : 0,
      dark: dark / n, mid: mid / n, edges: strong / n, aligned: strong ? aligned / strong : 0, iso: exif.iso || null, faces: null,
    };
  }
  function classifyScene(s) {
    const pct = (v) => Math.round(v * 100);
    const r = [
      { id: 'retrato', label: 'Retrato', score: s.faces > 0 ? 95 : s.faces === 0 ? Math.min(20, s.skin * 40) : (s.skinCenter >= 0.25 && s.skin < 0.5 ? Math.min(62, 30 + s.skinCenter * 60) : s.skin * 45), why: s.faces > 0 ? `${s.faces} rostro${s.faces > 1 ? 's' : ''} detectado${s.faces > 1 ? 's' : ''}` : `piel ${pct(s.skin)} % de la foto, ${pct(s.skinCenter)} % del centro` },
      { id: 'noche', label: 'Noche', score: (s.mean < 0.24 ? 40 : 0) + s.dark * 55 + (s.iso >= 1600 ? 12 : 0), why: `${pct(s.dark)} % de la foto en sombra profunda, luminancia media ${pct(s.mean)} %` },
      { id: 'paisaje', label: 'Paisaje', score: s.skyTop * 60 + s.green * 70, why: `cielo probable ${pct(s.skyTop)} % de la franja superior, vegetación ${pct(s.green)} %` },
      { id: 'comida', label: 'Comida', score: s.warmCenter * 78 - s.skyTop * 25 + (s.aligned < 0.45 ? 8 : 0) - (s.faces > 0 ? 40 : 0), why: `tonos cálidos saturados en ${pct(s.warmCenter)} % del centro` },
      { id: 'arquitectura', label: 'Arquitectura', score: (Math.max(0, s.aligned - 0.32) * 130 + Math.min(s.edges * 180, 18)) * Math.min(1, s.edges / 0.08), why: `${pct(s.aligned)} % de los bordes fuertes son rectos` },
    ].sort((a, b) => b.score - a.score);
    const best = r[0];
    return best.score >= 35
      ? { id: best.id, label: best.label, score: Math.round(Math.min(best.score, 99)), why: best.why, all: r }
      : { id: 'general', label: 'General', score: Math.round(best.score), why: `ninguna regla superó 35 puntos; la más cercana fue ${best.label.toLowerCase()}`, all: r };
  }
  const SCENE_AFFINITY = {
    retrato: { retratos: 34, moviles: 26, limpios: 26, calidos: 22, pelicula: 22, moody: 8, cine: 8, bn: 12, viajes: 2, vintage: 8, noche: -6 },
    paisaje: { viajes: 34, moviles: 24, cine: 22, calidos: 20, limpios: 18, moody: 16, pelicula: 14, bn: 6, vintage: 6, retratos: 0, noche: -10 },
    noche: { noche: 36, moody: 22, cine: 24, moviles: 16, bn: 16, pelicula: 8, calidos: 4, limpios: -8, viajes: -4, retratos: 0, vintage: 0 },
    comida: { calidos: 30, limpios: 24, moviles: 24, pelicula: 18, moody: 6, viajes: 8, retratos: 2, vintage: 6, cine: -6, noche: -14, bn: -26 },
    arquitectura: { viajes: 22, moody: 22, bn: 22, cine: 22, moviles: 20, limpios: 16, pelicula: 10, calidos: 4, vintage: 4, retratos: 0, noche: 0 },
    general: { moviles: 24, limpios: 20, calidos: 20, viajes: 18, pelicula: 18, retratos: 14, moody: 14, cine: 14, bn: 8, vintage: 6, noche: 0 },
  };
  const CAT_LABEL = { foto: 'A tu foto', premium: 'Premium', moviles: 'Móviles', retratos: 'Retrato pro', viajes: 'Paisaje y viaje', noche: 'Noche', limpios: 'Limpios', calidos: 'Cálidos', moody: 'Moody', cine: 'Cine', pelicula: 'Película', vintage: 'Vintage', bn: 'Blanco y negro', custom: 'Mis presets' };
  const ISSUE_TEXT = { dark: 'tu foto está oscura y este look la aclara', bright: 'tu foto está muy clara y este look la controla', flat: 'tu foto está opaca y este look le da fuerza', oversat: 'tu foto está muy saturada y este look calma el color', dull: 'el color está apagado y este look lo levanta', backlit: 'hay contraluz y este look equilibra la escena', warm: 'la luz es muy cálida y este look la compensa', cool: 'la luz es muy fría y este look la calienta' };
  function rankPresets(stats, scene, presets) {
    const diag = diagnose(stats, scene);
    const fmtPct = (v) => `${v > 0 ? '+' : ''}${Math.round(v * 100)} %`;
    const hasSkin = scene.id === 'retrato' || stats.faces > 0 || (stats.faces !== 0 && stats.skinCenter >= 0.25);
    const list = presets.map((p) => {
      const m = p.m;
      const parts = [];
      const add = (pts, txt) => { parts.push({ pts, txt }); };
      const aff = (SCENE_AFFINITY[scene.id] || SCENE_AFFINITY.general)[p.cat] ?? 0;
      if (p.smart) add(34 + ((p.fin && p.fin.scenes && p.fin.scenes.includes(scene.id)) ? 22 : 0), 'se adapta a la luz y al color de esta foto');
      if ((p.dl || 0) < -3) add(Math.max(-45, p.dl * 3.5), 'oscurece la foto');
      add(aff, `encaja con esta foto de ${scene.label.toLowerCase()}`);
      const dC = m.contrast - 1;
      if (stats.std < 0.17 && dC > 0.08) add(Math.min(dC * 70, 18), `la foto tiene poco contraste (σ ${stats.std.toFixed(2)}) y esta LUT lo sube ${fmtPct(dC)}`);
      if (stats.std > 0.27) add(dC < 0.12 ? 12 : -Math.min(dC * 45, 16), dC < 0.12 ? `la foto ya tiene mucho contraste (σ ${stats.std.toFixed(2)}) y esta LUT apenas lo cambia (${fmtPct(dC)})` : 'sube el contraste de una foto ya contrastada');
      if (stats.clipLo > 0.04 && m.black > 0.03) add(9, `levanta los negros cerrados (${Math.round(stats.clipLo * 100)} % de la foto recortada)`);
      if (stats.clipHi > 0.04 && m.white < 0.99) add(8, `suaviza las altas luces (${Math.round(stats.clipHi * 100)} % recortadas)`);
      if (!m.bw) {
        if (stats.cct < 4800 && m.warm < -0.005) add(Math.min(-m.warm * 500, 12), `enfría una foto cálida (${stats.cct} K aparentes)`);
        if (stats.cct > 7000 && m.warm > 0.005) add(Math.min(m.warm * 500, 12), `calienta una foto fría (${stats.cct} K aparentes)`);
        if (Math.abs(m.warm) > 0.16) add(-10, 'desvía mucho los neutros');
        if (stats.chroma < 0.16 && m.sat > 1.02) add(Math.min((m.sat - 1) * 90, 10), `da color a una foto apagada (${fmtPct(m.sat - 1)} de saturación)`);
        if (stats.chroma > 0.34 && m.sat < 0.92) add(Math.min((1 - m.sat) * 45, 10), `contiene una foto muy saturada (${fmtPct(m.sat - 1)} de saturación)`);
        if (hasSkin) add(m.skinHue <= 3 ? 12 : m.skinHue >= 9 ? -Math.min(m.skinHue * 1.4, 26) : 0, m.skinHue <= 3 ? `respeta la piel: la desvía solo ${m.skinHue}°` : `desvía la piel ${m.skinHue}°`);
      }
      if (scene.id === 'noche' && /(800|1600|3200)/.test(p.name)) add(12, 'película de alta sensibilidad para poca luz');
      for (const tag of p.fits || []) if (diag.ids.has(tag) && ISSUE_TEXT[tag]) add(26, ISSUE_TEXT[tag]);
      if (scene.id === 'arquitectura' && m.bw) add(Math.min(dC * 25, 8), `blanco y negro con ${fmtPct(dC)} de contraste para líneas marcadas`);
      const score = parts.reduce((a, x) => a + x.pts, 40);
      let suggested = 100;
      const notes = [];
      if (hasSkin && !m.bw && m.skinHue > 6) { suggested -= Math.min(30, (m.skinHue - 6) * 3); notes.push('protege la piel'); }
      if (stats.std > 0.27 && dC > 0.12) { suggested -= Math.min(20, dC * 70); notes.push('evita exceso de contraste'); }
      
      suggested = Math.max(60, Math.round(suggested / 5) * 5);
      const top = parts.filter((x) => x.pts > 0).sort((a, b) => b.pts - a.pts).slice(0, 2).map((x) => x.txt);
      const dl = p.dl || 0;
      return { id: p.id, cat: p.cat, premium: !!p.premium, smart: !!p.smart, dl, bw: !!m.bw, score: Math.round(score * 10) / 10, parts, reason: top.join('; ') || 'buen ajuste general', suggested, suggestedWhy: notes.join(', ') };
    }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    /* Variedad: máximo 2 en B/N y 2 de la misma categoría entre los 8 recomendados */
    const picks = [], bwMax = scene.id === 'arquitectura' || scene.id === 'noche' ? 2 : 1;
    const counts = {};
    list.filter((x) => x.smart).slice(0, 3).forEach((x) => picks.push(x));
    for (const it of list) {
      if (picks.length === 8) break;
      counts[it.cat] = counts[it.cat] || 0;
      if (it.bw && picks.filter((x) => x.bw).length >= bwMax) continue;
      if (counts[it.cat] >= 2) continue;
      if (it.premium && picks.filter((x) => x.premium).length >= 2) continue;
      if (picks.includes(it) || it.smart) continue;
      if (it.dl < -5) continue;
      counts[it.cat]++;
      picks.push(it);
    }
    for (const it of list) if (picks.length < 8 && !picks.includes(it) && it.dl >= -5) picks.push(it);
    const set = new Set(picks.map((p) => p.id));
    const rest = list.filter((x) => !set.has(x.id));
    const dark = (x) => x.dl < -5;
    const ordered = [...picks.filter((x) => x.smart), ...picks.filter((x) => !x.smart && !x.premium), ...picks.filter((x) => x.premium), ...rest.filter((x) => x.smart), ...rest.filter((x) => !x.smart && !x.premium && !dark(x)), ...rest.filter((x) => x.premium && !dark(x)), ...rest.filter(dark)];
    return ordered.map((x) => ({ ...x, recommended: set.has(x.id) }));
  }

  /* Máscaras locales (piel y cielo): reglas de color y conectividad, sin descargas */
  function boxBlurMask(m, w, h, r) {
    const tmp = new Float32Array(w * h), out = new Float32Array(w * h), win = 2 * r + 1;
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let x = -r; x <= r; x++) s += m[y * w + clamp(x, 0, w - 1)];
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = s / win;
        s += m[y * w + Math.min(x + r + 1, w - 1)] - m[y * w + Math.max(x - r, 0)];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) s += tmp[clamp(y, 0, h - 1) * w + x];
      for (let y = 0; y < h; y++) {
        out[y * w + x] = s / win;
        s += tmp[Math.min(y + r + 1, h - 1) * w + x] - tmp[Math.max(y - r, 0) * w + x];
      }
    }
    return out;
  }
  function computeSkinMask(rgba, w, h) {
    const m = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) m[i] = isSkin(rgba[i * 4], rgba[i * 4 + 1], rgba[i * 4 + 2]) ? 1 : 0;
    return boxBlurMask(m, w, h, Math.max(1, Math.round(Math.max(w, h) / 200)));
  }
  function computeSkyMask(rgba, w, h) {
    const cand = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) {
      const [hu, sa, va] = rgbToHsv(rgba[i * 4] / 255, rgba[i * 4 + 1] / 255, rgba[i * 4 + 2] / 255);
      cand[i] = (hu > 170 && hu < 260 && sa > 0.05 && va > 0.35) || (sa < 0.14 && va > 0.72) ? 1 : 0;
    }
    const seen = new Uint8Array(w * h), stack = [];
    for (let x = 0; x < w; x++) if (cand[x]) { seen[x] = 1; stack.push(x); }
    while (stack.length) {
      const i = stack.pop(), x = i % w;
      const test = (j) => { if (j >= 0 && j < w * h && !seen[j] && cand[j]) { seen[j] = 1; stack.push(j); } };
      if (x > 0) test(i - 1);
      if (x < w - 1) test(i + 1);
      test(i - w); test(i + w);
    }
    const m = new Float32Array(w * h);
    let area = 0;
    for (let i = 0; i < w * h; i++) { m[i] = seen[i]; area += seen[i]; }
    if (area / (w * h) < 0.015) return { mask: new Float32Array(w * h), area: 0 };
    return { mask: boxBlurMask(m, w, h, Math.max(1, Math.round(Math.max(w, h) / 160))), area: area / (w * h) };
  }

  /* ---------- EXIF ---------- */
  function findApp1(u8) {
    if (u8[0] !== 0xff || u8[1] !== 0xd8) return null;
    let p = 2;
    while (p + 4 < u8.length && u8[p] === 0xff) {
      const marker = u8[p + 1], len = (u8[p + 2] << 8) | u8[p + 3];
      if (marker === 0xda) return null;
      if (marker === 0xe1 && String.fromCharCode(u8[p + 4], u8[p + 5], u8[p + 6], u8[p + 7]) === 'Exif') return u8.slice(p + 4, p + 2 + len);
      p += 2 + len;
    }
    return null;
  }
  function tiffReader(payload) {
    const t = payload.subarray(6), dv = new DataView(t.buffer, t.byteOffset, t.byteLength);
    const le = dv.getUint16(0) === 0x4949;
    return { t, dv, le, u16: (o) => dv.getUint16(o, le), u32: (o) => dv.getUint32(o, le), ifd0: dv.getUint32(4, le) };
  }
  const TYPE_SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  function readExif(u8) {
    const app1 = findApp1(u8);
    if (!app1) return { app1: null };
    try {
      const r = tiffReader(app1), out = { app1 };
      const entries = (ifd, cb) => {
        const n = r.u16(ifd);
        for (let i = 0; i < n; i++) cb(r.u16(ifd + 2 + i * 12), r.u16(ifd + 4 + i * 12), r.u32(ifd + 6 + i * 12), ifd + 10 + i * 12);
      };
      const str = (count, off) => {
        const start = count > 4 ? r.u32(off) : off;
        return String.fromCharCode(...r.t.subarray(start, start + count)).replace(/\0.*$/, '').trim();
      };
      const rat = (off) => { const v = r.u32(off); const a = r.u32(v), b = r.u32(v + 4); return b ? a / b : 0; };
      let exifPtr = 0;
      entries(r.ifd0, (tag, type, count, off) => {
        if (tag === 0x010f) out.make = str(count, off);
        if (tag === 0x0110) out.model = str(count, off);
        if (tag === 0x0112) out.orientation = r.u16(off);
        if (tag === 0x8769) exifPtr = r.u32(off);
        if (tag === 0x8825) out.gps = true;
      });
      if (exifPtr) entries(exifPtr, (tag, type, count, off) => {
        if (tag === 0x8827) out.iso = r.u16(off);
        if (tag === 0x829a) out.exposure = rat(off);
        if (tag === 0x829d) out.fnumber = rat(off);
        if (tag === 0x920a) out.focal = rat(off);
        if (tag === 0x9003) out.date = str(count, off);
      });
      return out;
    } catch { return { app1: null }; }
  }
  /* Ajusta una copia del EXIF: orientación 1, nuevas dimensiones, sin miniatura y opcionalmente sin GPS. */
  function prepareExif(app1, { stripGps, w, h }) {
    const copy = app1.slice(), r = tiffReader(copy);
    const n = r.u16(r.ifd0);
    let exifPtr = 0, gpsIndex = -1;
    for (let i = 0; i < n; i++) {
      const e = r.ifd0 + 2 + i * 12, tag = r.u16(e);
      if (tag === 0x0112) r.dv.setUint16(e + 8, 1, r.le);
      if (tag === 0x8769) exifPtr = r.u32(e + 8);
      if (tag === 0x8825) gpsIndex = i;
    }
    /* El IFD1 es una miniatura de la foto sin editar: se elimina. */
    r.dv.setUint32(r.ifd0 + 2 + n * 12, 0, r.le);
    if (exifPtr) {
      const m = r.u16(exifPtr);
      for (let i = 0; i < m; i++) {
        const e = exifPtr + 2 + i * 12, tag = r.u16(e), type = r.u16(e + 2);
        if (tag === 0xa002 || tag === 0xa003) {
          const v = tag === 0xa002 ? w : h;
          if (type === 3) r.dv.setUint16(e + 8, Math.min(v, 65535), r.le); else r.dv.setUint32(e + 8, v, r.le);
        }
      }
    }
    if (stripGps && gpsIndex >= 0) {
      const e = r.ifd0 + 2 + gpsIndex * 12, gps = r.u32(e + 8);
      if (gps > 0 && gps + 2 < r.t.length) {
        const g = r.u16(gps);
        for (let i = 0; i < g; i++) {
          const ge = gps + 2 + i * 12, type = r.u16(ge + 2), count = r.u32(ge + 4), size = (TYPE_SIZE[type] || 1) * count;
          if (size > 4) { const v = r.u32(ge + 8); if (v + size <= r.t.length) r.t.fill(0, v, v + size); }
        }
        r.t.fill(0, gps, Math.min(r.t.length, gps + 6 + g * 12));
      }
      /* Quita la entrada del IFD0 desplazando las siguientes y su puntero final */
      const start = r.ifd0 + 2;
      r.t.copyWithin(start + gpsIndex * 12, start + (gpsIndex + 1) * 12, start + n * 12 + 4);
      r.dv.setUint16(r.ifd0, n - 1, r.le);
      r.t.fill(0, start + (n - 1) * 12 + 4, start + n * 12 + 4);
    }
    return copy;
  }
  function insertApp1(jpeg, payload) {
    if (jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;
    if (payload.length + 2 > 65535) return jpeg;
    let p = 2;
    if (jpeg[2] === 0xff && jpeg[3] === 0xe0) p = 4 + ((jpeg[4] << 8) | jpeg[5]);
    const seg = new Uint8Array(payload.length + 4);
    seg[0] = 0xff; seg[1] = 0xe1;
    const len = payload.length + 2;
    seg[2] = len >> 8; seg[3] = len & 255;
    seg.set(payload, 4);
    const out = new Uint8Array(jpeg.length + seg.length);
    out.set(jpeg.subarray(0, p), 0);
    out.set(seg, p);
    out.set(jpeg.subarray(p), p + seg.length);
    return out;
  }

  /* ---------- ZIP sin compresión (JPEG ya viene comprimido) ---------- */
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
  function makeZip(files) {
    const enc = new TextEncoder(), chunks = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), crc = crc32(f.bytes);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, f.bytes.length, true); lh.setUint32(22, f.bytes.length, true); lh.setUint16(26, name.length, true);
      chunks.push(new Uint8Array(lh.buffer), name, f.bytes);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, f.bytes.length, true); ch.setUint32(24, f.bytes.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + f.bytes.length;
    }
    const cdSize = central.reduce((a, c) => a + c.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    return new Blob([...chunks, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  /* ---------- Varios ---------- */
  const slugify = (s) => (s || 'foto').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\.[a-z0-9]+$/, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'foto';
  function presetSlug(name) {
    if (!name) return 'sin-preset';
    return slugify(name.replace(/^(Kodak|Fuji|Fujifilm|Agfa|Polaroid|Ilford|Rollei|Lomography)\s+/i, '')).replace(/-/g, '');
  }
  const QUALITY_SLUG = { original: 'original', detail: 'detalle', whatsappHd: 'redes', facebook: 'facebook', instagram: 'instagram', perfil: 'perfil', '1080p': '1080p', '4k': '4k' };
  function exportName(file, presetName, mode, ext) { return `${slugify(file)}_${presetSlug(presetName)}_${QUALITY_SLUG[mode] || mode}.${ext}`; }
  const fmtBytes = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(n >= 10485760 ? 0 : 1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  const fmtTime = (s) => { if (!Number.isFinite(s)) return '—'; if (s < 60) return `${Math.max(1, Math.round(s))} s`; const m = Math.floor(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min ${Math.round(s % 60)} s`; };

  return {
    clamp, lerp, clone, defaultParams, colorIsIdentity, effectiveParams, autoAdjust, smartRecipe, diagnose, casSharpen, edgeSharpen, proMatte, segmentBox, fuseImages, qualityPlan, geoIsIdentity, targetDims, frameSize, geoOutputSize, geoMatrix, IDENTITY_XF, applyXf, curveToTable,
    haldToCube, parseCube, lutTetra, parseXmp, lanczosKernel, lanczosRegion, lanczosResize, planTiles, destRegion, blendTile, resolveAccum,
    analyzePixels, classifyScene, rankPresets, computeSkinMask, computeSkyMask, rgbToHsv, readExif, findApp1, prepareExif, insertApp1, crc32, makeZip,
    SOCIAL_MODES, slugify, presetSlug, exportName, fmtBytes, fmtTime, CAT_LABEL, sectionIsDefault,
  };
})();
if (typeof module !== 'undefined') module.exports = Core;
