#!/usr/bin/env python3
"""Valida los 40 HaldCLUT del catálogo, los remuestrea a nivel 7 y mide cada LUT real."""
import base64, colorsys, io, json, os, sys
import numpy as np
from PIL import Image

ROOT = os.environ.get('HALD_ROOT', 'hald-clut/HaldCLUT/').rstrip('/') + '/'
LEVEL = 7

C = 'Film Simulation/Color/'
B = 'Film Simulation/Black and White/'
CP = C + 'CreativePack-1/'
X = 'Fujifilm XTrans III/Fuji XTrans III - '
G = 'PictureFX/GoldFX/GoldFX-'
CC = 'CC BY-SA 4.0'
NOLIC = 'Sin licencia declarada (Stuart Sowerby)'
# cat, nombre, archivo, licencia, autor, acabado
L = lambda **k: k
LOOKS = [
    ('limpios', 'Clean', X + 'Provia.png', NOLIC, 'Stuart Sowerby', L(lut=.55, light=dict(contrast=6, shadows=6), color=dict(vibrance=12), detail=dict(clarity=6))),
    ('limpios', 'Airy', C + 'Fuji/Fuji 400H 2.png', CC, 'RawTherapee', L(lut=.5, fade=.035, light=dict(exposure=.14, highlights=-14, shadows=14, contrast=-6), color=dict(saturation=-5, temp=3), grade=dict(highs=dict(h=50, s=8)))),
    ('limpios', 'Pastel', C + 'Kodak/Kodak Portra 400 NC 2.png', CC, 'RawTherapee', L(lut=.6, fade=.055, light=dict(exposure=.08, contrast=-12, shadows=12), color=dict(saturation=-12), grade=dict(shadows=dict(h=215, s=8), highs=dict(h=35, s=8)))),
    ('limpios', 'Natural Pro', X + 'Pro Neg Std.png', NOLIC, 'Stuart Sowerby', L(lut=.75, light=dict(contrast=8), color=dict(vibrance=8))),
    ('limpios', 'Piel Suave', C + 'Kodak/Kodak Portra 160 NC 2.png', CC, 'RawTherapee', L(lut=.65, fade=.02, light=dict(highlights=-10, shadows=8), color=dict(temp=4, vibrance=4), detail=dict(texture=-8))),
    ('limpios', 'Invierno', CP + 'CrispWinter.png', CC, 'RawTherapee', L(lut=.38, light=dict(contrast=6), color=dict(vibrance=8))),
    ('limpios', 'Editorial', X + 'Astia.png', NOLIC, 'Stuart Sowerby', L(lut=.7, fade=.015, light=dict(contrast=8, highlights=-8), color=dict(saturation=-4))),
    ('limpios', 'Vivid Pop', X + 'Velvia.png', NOLIC, 'Stuart Sowerby', L(lut=.5, light=dict(contrast=8), color=dict(vibrance=16), detail=dict(clarity=8))),
    ('calidos', 'Golden Hour', G + 'Perfect-Sunset-01min.png', CC, 'PictureFX', L(lut=.7, light=dict(contrast=8, highlights=-12, shadows=8), color=dict(vibrance=10, temp=5), grade=dict(highs=dict(h=42, s=14)))),
    ('calidos', 'Atardecer', CP + 'LateSunset.png', CC, 'RawTherapee', L(lut=.36, light=dict(contrast=6), color=dict(vibrance=10), fx=dict(halation=10))),
    ('calidos', 'Verano', G + 'Summer-Heat.png', CC, 'PictureFX', L(lut=.48, light=dict(exposure=.06, contrast=8), color=dict(vibrance=12))),
    ('calidos', 'Brisa', G + 'Spring-Breeze.png', CC, 'PictureFX', L(lut=.7, fade=.02, light=dict(exposure=.08, highlights=-8), color=dict(vibrance=8))),
    ('calidos', 'Miel', CP + 'SoftWarming.png', CC, 'RawTherapee', L(lut=.85, light=dict(contrast=4), color=dict(vibrance=8), grade=dict(shadows=dict(h=30, s=8)))),
    ('calidos', 'Luz de Vela', CP + 'CandleLight.png', CC, 'RawTherapee', L(lut=.4, fade=.02, light=dict(shadows=8), fx=dict(halation=12, vignette=-8))),
    ('calidos', 'Otoño', CP + 'FallColors.png', CC, 'RawTherapee', L(lut=.55, light=dict(contrast=8), color=dict(vibrance=8))),
    ('calidos', 'Crisp Cálido', CP + 'CrispWarm.png', CC, 'RawTherapee', L(lut=.75, light=dict(contrast=6), color=dict(vibrance=8), detail=dict(clarity=6))),
    ('moody', 'Classic Chrome', X + 'Classic Chrome.png', NOLIC, 'Stuart Sowerby', L(lut=.8, fade=.012, light=dict(contrast=6), detail=dict(clarity=6))),
    ('moody', 'Moody', CP + 'Smokey.png', CC, 'RawTherapee', L(lut=.5, fade=.04, light=dict(exposure=-.12, contrast=10, highlights=-16), color=dict(saturation=-10), grade=dict(shadows=dict(h=205, s=18)), fx=dict(vignette=-12))),
    ('moody', 'Bosque', CP + 'TensionGreen1.png', CC, 'RawTherapee', L(lut=.38, fade=.03, light=dict(contrast=8, highlights=-10), color=dict(saturation=-6), grade=dict(shadows=dict(h=155, s=12)), fx=dict(vignette=-10))),
    ('moody', 'Niebla', CP + 'FoggyNight.png', CC, 'RawTherapee', L(lut=.42, fade=.05, light=dict(contrast=4), color=dict(saturation=-10), grade=dict(shadows=dict(h=220, s=12)))),
    ('moody', 'Ámbar', CP + 'EdgyEmber.png', CC, 'RawTherapee', L(lut=.28, light=dict(contrast=8, highlights=-10), color=dict(vibrance=4), fx=dict(vignette=-12))),
    ('moody', 'Desaturado', CP + 'BleachBypass1.png', CC, 'RawTherapee', L(lut=.4, light=dict(contrast=6), detail=dict(clarity=10), fx=dict(vignette=-8))),
    ('moody', 'Mate', C + 'Kodak/Kodak Portra 800 2.png', CC, 'RawTherapee', L(lut=.55, fade=.075, light=dict(contrast=-4, highlights=-10), color=dict(saturation=-8))),
    ('moody', 'Luna', CP + 'Moonlight.png', CC, 'RawTherapee', L(lut=.38, fade=.02, light=dict(contrast=8), fx=dict(vignette=-14))),
    ('cine', 'Teal & Orange', CP + 'TealOrange1.png', CC, 'RawTherapee', L(lut=.55, light=dict(contrast=8), detail=dict(clarity=6))),
    ('cine', 'Blockbuster', CP + 'TealOrange3.png', CC, 'RawTherapee', L(lut=.48, light=dict(contrast=12, highlights=-10), color=dict(vibrance=8), fx=dict(vignette=-10))),
    ('cine', 'Neo Noir', CP + 'FuturisticBleak1.png', CC, 'RawTherapee', L(lut=.42, light=dict(contrast=10), fx=dict(vignette=-16))),
    ('cine', 'Azul Nocturno', CP + 'DropBlues.png', CC, 'RawTherapee', L(lut=.42, light=dict(contrast=8), fx=dict(vignette=-10))),
    ('cine', 'Cine Dorado', CP + 'TealMagentaGold.png', CC, 'RawTherapee', L(lut=.45, light=dict(contrast=8, highlights=-8), color=dict(vibrance=6))),
    ('cine', 'Drama', CP + 'BleachBypass3.png', CC, 'RawTherapee', L(lut=.48, light=dict(contrast=10), detail=dict(clarity=10), fx=dict(vignette=-14))),
    ('pelicula', 'Portra 400', C + 'Kodak/Kodak Portra 400 2.png', CC, 'RawTherapee', L(lut=.72, light=dict(highlights=-8, shadows=6), color=dict(temp=3), fx=dict(grain=8))),
    ('pelicula', 'Ektar 100', C + 'Kodak/Kodak Ektar 100.png', CC, 'RawTherapee', L(lut=.75, light=dict(contrast=4), color=dict(vibrance=4), fx=dict(grain=5))),
    ('pelicula', 'Kodachrome', C + 'Kodak/Kodak Kodachrome 64.png', CC, 'RawTherapee', L(lut=.7, light=dict(contrast=4), color=dict(vibrance=8), fx=dict(grain=8))),
    ('pelicula', 'Superia 400', C + 'Fuji/Fuji Superia 400 2.png', CC, 'RawTherapee', L(lut=.62, fade=.015, color=dict(vibrance=6), fx=dict(grain=12))),
    ('pelicula', 'Polaroid', C + 'Polaroid/Polaroid 669 3.png', CC, 'RawTherapee', L(lut=.55, fade=.03, light=dict(exposure=.05), fx=dict(grain=10, vignette=-6))),
    ('pelicula', 'Vista 200', C + 'Agfa/Agfa Vista 200.png', CC, 'RawTherapee', L(lut=.62, color=dict(vibrance=6), fx=dict(grain=8))),
    ('bn', 'Tri-X', B + 'Kodak/Kodak TRI-X 400 2.png', CC, 'RawTherapee', L(lut=.95, light=dict(contrast=6), detail=dict(clarity=8), fx=dict(grain=16))),
    ('bn', 'Acros', X + 'Acros.png', NOLIC, 'Stuart Sowerby', L(lut=1, light=dict(contrast=4), detail=dict(clarity=6), fx=dict(grain=6))),
    ('bn', 'HP5', B + 'Ilford/Ilford HP5 2.png', CC, 'RawTherapee', L(lut=.95, fade=.015, fx=dict(grain=14, vignette=-6))),
    ('bn', 'T-Max', B + 'Kodak/Kodak T-Max 100.png', CC, 'RawTherapee', L(lut=1, light=dict(contrast=8), detail=dict(clarity=6))),
]
SKIN = np.array([[.96, .80, .69], [.90, .72, .60], [.78, .57, .44], [.63, .43, .32], [.45, .30, .22]], np.float32)


def slug(s):
    import unicodedata
    t = unicodedata.normalize('NFD', s.lower())
    return ''.join(ch for ch in t if (ch.isascii() and ch.isalnum()) or ch == ' ').replace('  ', ' ').replace(' ', '-')


def load_cube(path):
    a = np.asarray(Image.open(path).convert('RGB'))
    h, w = a.shape[:2]
    L = round(h ** (1 / 3))
    if h != w or L ** 3 != h:
        raise ValueError(f'{path}: {w}x{h} no es un patrón Hald válido')
    return a.reshape(L * L, L * L, L * L, 3), L


def resample(c, M):
    N = c.shape[0]
    x = np.linspace(0, N - 1, M)
    i0 = np.minimum(x.astype(int), N - 2)
    f = x - i0
    o = c.astype(np.float32)
    for ax in range(3):
        sh = [1, 1, 1, 1]
        sh[ax] = M
        ff = f.reshape(sh)
        o = np.take(o, i0, ax) * (1 - ff) + np.take(o, i0 + 1, ax) * ff
    return o


def lookup(c, rgb):
    N = c.shape[0]
    p = np.clip(rgb, 0, 1) * (N - 1)
    i = np.minimum(p.astype(int), N - 2)
    f = p - i
    out = 0
    for b in (0, 1):
        for g in (0, 1):
            for r in (0, 1):
                w = (f[:, 0] if r else 1 - f[:, 0]) * (f[:, 1] if g else 1 - f[:, 1]) * (f[:, 2] if b else 1 - f[:, 2])
                out = out + w[:, None] * c[i[:, 2] + b, i[:, 1] + g, i[:, 0] + r]
    return out / 255.0


def luma(a):
    return a @ np.array([.2126, .7152, .0722])


def metrics(c):
    ramp = np.linspace(0, 1, 33)[:, None].repeat(3, 1)
    o = lookup(c, ramp)
    y = luma(o)
    contrast = float((y[24] - y[8]) / (ramp[24, 0] - ramp[8, 0]))
    warm = float(np.mean(o[6:27, 0] - o[6:27, 2]))
    rng = np.random.default_rng(7)
    pts = rng.random((6000, 3))
    po = lookup(c, pts)
    chroma = lambda a: a.max(1) - a.min(1)
    sat = float(chroma(po).mean() / max(chroma(pts).mean(), 1e-3))
    bw = bool(chroma(po).mean() < .02)
    so = lookup(c, SKIN)
    shifts = []
    for i, s in zip(SKIN, so):
        h0 = colorsys.rgb_to_hsv(*i)[0]
        h1 = colorsys.rgb_to_hsv(*s)[0]
        shifts.append(abs((h1 - h0 + .5) % 1 - .5) * 360)
    return dict(contrast=round(contrast, 3), sat=round(sat, 3), warm=round(warm, 4), bw=bw,
                skinHue=round(float(np.mean(shifts)), 1), skinDelta=round(float(np.abs(so - SKIN).mean()) * 100, 1),
                black=round(float(y[0]), 3), white=round(float(y[-1]), 3), gray=round(float(y[16]), 3))


def main():
    out, missing = [], []
    M = LEVEL * LEVEL
    for cat, name, rel, lic, author, fin in LOOKS:
        p = ROOT + rel
        if not os.path.isfile(p):
            missing.append(rel)
            print('FALTA', rel, file=sys.stderr)
            continue
        c, src_level = load_cube(p)
        r = np.clip(np.round(resample(c, M)), 0, 255).astype(np.uint8)
        side = LEVEL ** 3
        buf = io.BytesIO()
        Image.fromarray(r.reshape(side, side, 3)).save(buf, 'PNG', optimize=True)
        out.append(dict(id=slug(name), name=name, cat=cat, file=rel, srcLevel=src_level, level=LEVEL, license=lic, author=author,
                        fin=fin, m=metrics(c), png=base64.b64encode(buf.getvalue()).decode()))
    if missing:
        sys.exit(f'Faltan {len(missing)} presets')
    if len(out) != 40 or len({x["id"] for x in out}) != 40:
        sys.exit('El catálogo no tiene 40 presets únicos')
    json.dump(out, open(os.path.join(os.path.dirname(__file__), 'luts.json'), 'w'), separators=(',', ':'))
    total = sum(len(x['png']) for x in out)
    print(f'{len(out)} presets, {total / 1048576:.2f} MB en base64')
    for x in out:
        print(f"{x['cat']:<10}{x['name']:<16} L{x['srcLevel']} con={x['m']['contrast']} sat={x['m']['sat']} warm={x['m']['warm']} skin={x['m']['skinHue']} bw={x['m']['bw']}")


main()
