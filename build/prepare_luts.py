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

Z = 'PictureFX/ZilverFX/ZilverFX-'
A = 'PictureFX/AnalogFX/AnalogFX-'
LOOKS += [
    # Interpretaciones del estilo de cada móvil; no son perfiles oficiales
    ('moviles', 'iPhone 17 Pro Max', C + 'Fuji/Fuji Provia 100F.png', CC, 'RawTherapee', L(lut=.3, light=dict(exposure=.18, shadows=24, highlights=-18, contrast=6), color=dict(temp=9, vibrance=18, saturation=4), detail=dict(clarity=8)), ['dark', 'flat', 'dull', 'cool']),
    ('moviles', 'iPhone Contraste Rico', C + 'Fuji/Fuji Provia 100F.png', CC, 'RawTherapee', L(lut=.3, light=dict(exposure=.08, contrast=22, shadows=4, highlights=-12), color=dict(temp=3, vibrance=12, saturation=6), detail=dict(clarity=10)), ['flat']),
    ('moviles', 'iPhone Cálido', C + 'Kodak/Kodak Portra 400 VC 2.png', CC, 'RawTherapee', L(lut=.42, light=dict(exposure=.12, shadows=14, highlights=-12, contrast=6), color=dict(temp=18, tint=2, vibrance=12), grade=dict(highs=dict(h=42, s=10))), ['cool']),
    ('moviles', 'Xiaomi 17 Ultra Vibrant', C + 'Fuji/Fuji Velvia 100 Generic.png', CC, 'RawTherapee', L(lut=.42, light=dict(exposure=.08, contrast=12, shadows=12, highlights=-10), color=dict(vibrance=20, temp=2), detail=dict(clarity=10)), ['flat', 'dull']),
    ('moviles', 'Xiaomi 17 Ultra Authentic', C + 'Kodak/Kodak Kodachrome 64 Generic.png', CC, 'RawTherapee', L(lut=.38, light=dict(exposure=0.2, contrast=24, highlights=-10), color=dict(temp=3, vibrance=4), detail=dict(clarity=14), fx=dict(vignette=-22)), ['flat', 'oversat']),
    ('moviles', 'Xiaomi Monocromo', B + 'Ilford/Ilford Delta 100.png', CC, 'RawTherapee', L(lut=1, light=dict(contrast=14, highlights=-6), detail=dict(clarity=10), fx=dict(vignette=-14, grain=6)), ['oversat', 'flat']),
    ('moviles', 'Google Pixel', C + 'Fuji/Fuji Provia 400X.png', CC, 'RawTherapee', L(lut=.35, light=dict(exposure=.1, contrast=16, shadows=8, highlights=-12), color=dict(temp=-8, tint=-2, vibrance=12), detail=dict(clarity=16)), ['flat', 'warm']),
    ('moviles', 'Pixel Natural', C + 'Fuji/Fuji Provia 100 Generic.png', CC, 'RawTherapee', L(lut=.25, light=dict(exposure=.1, contrast=8, shadows=12, highlights=-12), color=dict(temp=-3, vibrance=8), detail=dict(clarity=10)), ['oversat', 'warm']),
    ('moviles', 'Pixel Vivo', C + 'Fuji/Fuji Provia 400X.png', CC, 'RawTherapee', L(lut=.42, light=dict(exposure=.1, contrast=16, shadows=10, highlights=-10), color=dict(vibrance=26, temp=-4), detail=dict(clarity=14)), ['dull', 'flat']),
    ('retratos', 'Piel Dorada', C + 'Kodak/Kodak Portra 400 VC 2.png', CC, 'RawTherapee', L(lut=.65, light=dict(exposure=.12, contrast=6, shadows=12, highlights=-10), color=dict(temp=10, vibrance=12), grade=dict(highs=dict(h=40, s=12))), ['cool', 'portrait']),
    ('retratos', 'Retrato Suave', C + 'Fuji/Fuji 160C 2.png', CC, 'RawTherapee', L(lut=.7, light=dict(exposure=.1, contrast=4, highlights=-10, shadows=10), color=dict(vibrance=10), detail=dict(texture=-10)), ['portrait', 'oversat']),
    ('retratos', 'Beauty', C + 'Kodak/Kodak Portra 160 VC 2.png', CC, 'RawTherapee', L(lut=.6, light=dict(exposure=.14, contrast=6, shadows=14, highlights=-10), color=dict(vibrance=12, temp=4), detail=dict(texture=-14)), ['portrait', 'dark']),
    ('retratos', 'Piel Bronce', C + 'Kodak/Kodak Elite Color 200.png', CC, 'RawTherapee', L(lut=.55, light=dict(exposure=.1, contrast=12), color=dict(temp=14, vibrance=14), grade=dict(shadows=dict(h=28, s=10))), ['portrait', 'cool']),
    ('retratos', 'Boda Luminosa', C + 'Fuji/Fuji 400H 3 +.png', CC, 'RawTherapee', L(lut=.6, fade=.012, light=dict(exposure=.2, shadows=16, highlights=-14, contrast=4), color=dict(vibrance=12)), ['dark', 'portrait']),
    ('retratos', 'Estudio', C + 'Kodak/Kodak Portra 800 HC.png', CC, 'RawTherapee', L(lut=.62, light=dict(exposure=.08, contrast=14, highlights=-8), color=dict(vibrance=10), detail=dict(clarity=8), fx=dict(vignette=-10), grade=dict(shadows=dict(h=205, s=8))), ['portrait', 'flat']),
    ('retratos', 'Retrato Editorial', C + 'Fuji/Fuji 800Z 2.png', CC, 'RawTherapee', L(lut=.62, fade=.01, light=dict(exposure=.1, contrast=14, highlights=-10), color=dict(vibrance=10)), ['portrait', 'oversat']),
    ('retratos', 'Negro Elegante', B + 'Fuji/Fuji Neopan Acros 100.png', CC, 'RawTherapee', L(lut=1, light=dict(exposure=.12, contrast=12, shadows=8), detail=dict(texture=-6), fx=dict(vignette=-12)), ['portrait', 'oversat']),
    ('viajes', 'Cielo Profundo', C + 'Fuji/Fuji Velvia 50.png', CC, 'RawTherapee', L(lut=.65, light=dict(exposure=0.3, contrast=8, highlights=-14), color=dict(vibrance=12), detail=dict(clarity=12, dehaze=8), grade=dict(shadows=dict(h=215, s=10))), ['flat', 'dull']),
    ('viajes', 'Verde Intenso', C + 'Fuji/Fuji Velvia 100 Generic.png', CC, 'RawTherapee', L(lut=.62, light=dict(exposure=.06, contrast=10, shadows=6), color=dict(vibrance=16), detail=dict(clarity=10)), ['dull']),
    ('viajes', 'Viaje Cálido', G + 'Bright-Summer-Heat.png', CC, 'PictureFX', L(lut=.48, light=dict(contrast=10, highlights=-6), color=dict(vibrance=20), grade=dict(highs=dict(h=42, s=12))), ['cool', 'dull']),
    ('viajes', 'Playa', G + 'Bright-Spring-Breeze.png', CC, 'PictureFX', L(lut=.62, light=dict(exposure=.1, contrast=6, shadows=8), color=dict(vibrance=16)), ['dark', 'dull']),
    ('viajes', 'Ektachrome', C + 'Kodak/Kodak E-100 GX Ektachrome 100.png', CC, 'RawTherapee', L(lut=.7, light=dict(exposure=.08, contrast=8), color=dict(vibrance=18), detail=dict(clarity=8)), ['flat']),
    ('viajes', 'Montaña', C + 'Fuji/Fuji Provia 100F.png', CC, 'RawTherapee', L(lut=.65, light=dict(exposure=.14, contrast=10, shadows=12, highlights=-14), color=dict(vibrance=14), detail=dict(clarity=14, dehaze=12)), ['flat', 'bright']),
    ('viajes', 'Ciudad Cálida', C + 'Kodak/Kodak Elite Chrome 400.png', CC, 'RawTherapee', L(lut=.62, light=dict(exposure=.08, contrast=10), color=dict(temp=7, vibrance=14), detail=dict(clarity=10), grade=dict(shadows=dict(h=200, s=10), highs=dict(h=40, s=10))), ['cool']),
    ('viajes', 'HDR Natural', C + 'Fuji/Fuji Provia 100 Generic.png', CC, 'RawTherapee', L(lut=.4, light=dict(exposure=.06, shadows=30, highlights=-30, contrast=10), color=dict(vibrance=14), detail=dict(clarity=16)), ['backlit', 'dark', 'bright']),
    ('noche', 'Noche Clara', C + 'Fuji/Fuji Superia 1600 2.png', CC, 'RawTherapee', L(lut=.45, light=dict(exposure=.32, shadows=28, highlights=-14), color=dict(vibrance=8), detail=dict(denoise=16)), ['dark']),
    ('noche', 'Neón', CP + 'RedBlueYellow.png', CC, 'RawTherapee', L(lut=.3, light=dict(exposure=.1, contrast=12), color=dict(vibrance=18), fx=dict(halation=16)), ['dark', 'dull']),
    ('noche', 'Ciudad Nocturna', CP + 'FuturisticBleak2.png', CC, 'RawTherapee', L(lut=.3, light=dict(exposure=.16, contrast=10, shadows=12), color=dict(vibrance=20), fx=dict(vignette=-10)), ['dark']),
    ('noche', 'Rescate Oscuro', C + 'Kodak/Kodak Portra 800 3 +.png', CC, 'RawTherapee', L(lut=.5, light=dict(exposure=.38, shadows=36, whites=8), color=dict(vibrance=6), detail=dict(denoise=20)), ['dark', 'backlit']),
    ('noche', 'Luz Tenue', C + 'Fuji/Fuji Superia 800 3 +.png', CC, 'RawTherapee', L(lut=.5, light=dict(exposure=.2, shadows=22), color=dict(temp=4), detail=dict(denoise=12)), ['dark']),
    ('noche', 'Medianoche Azul', CP + 'TealOrange2.png', CC, 'RawTherapee', L(lut=.42, light=dict(exposure=.14, contrast=10, shadows=14), color=dict(vibrance=14), fx=dict(vignette=-10)), ['dark', 'warm']),
    ('calidos', 'Sol de Tarde', G + 'Perfect-Sunset-05min.png', CC, 'PictureFX', L(lut=.5, light=dict(exposure=0.3, highlights=-10, shadows=8), color=dict(vibrance=8)), ['cool']),
    ('calidos', 'Bronce', G + 'Perfect-Sunset-10min.png', CC, 'PictureFX', L(lut=.42, light=dict(exposure=0.3, contrast=8, highlights=-10), color=dict(vibrance=6)), ['cool']),
    ('calidos', 'Calor', G + 'Hot-Summer-Heat.png', CC, 'PictureFX', L(lut=.42, light=dict(contrast=10), color=dict(vibrance=14)), ['cool', 'dull']),
    ('calidos', 'Terracota', C + 'Agfa/Agfa Precisa 100.png', CC, 'RawTherapee', L(lut=.6, light=dict(exposure=.08, contrast=8), color=dict(temp=10, vibrance=12), grade=dict(shadows=dict(h=25, s=10))), ['cool']),
    ('calidos', 'Canela', C + 'Kodak/Kodak Elite ExtraColor 100.png', CC, 'RawTherapee', L(lut=.55, light=dict(exposure=0.26, contrast=8), color=dict(temp=12, vibrance=10)), ['cool']),
    ('vintage', 'Años 70', A + 'Old-Style-I.png', CC, 'PictureFX', L(lut=.3, fade=.03, light=dict(exposure=.04), color=dict(vibrance=14), fx=dict(grain=12, vignette=-10)), ['oversat']),
    ('vintage', 'Postal', A + 'Old-Style-II.png', CC, 'PictureFX', L(lut=.28, fade=.025, light=dict(exposure=.04), color=dict(vibrance=16), fx=dict(grain=8, vignette=-8)), ['oversat']),
    ('vintage', 'Sepia Suave', A + 'Soft-Sepia-I.png', CC, 'PictureFX', L(lut=.42, light=dict(exposure=0.26), color=dict(vibrance=8), fx=dict(grain=6)), ['oversat']),
    ('vintage', 'Polaroid Clásica', C + 'Polaroid/Polaroid PX-70 3.png', CC, 'RawTherapee', L(lut=.36, fade=.015, light=dict(exposure=.04), color=dict(vibrance=16), fx=dict(grain=8)), []),
    ('vintage', 'Cross Pro', C + 'Lomography/Lomography X-Pro Slide 200.png', CC, 'RawTherapee', L(lut=.55, light=dict(exposure=.06, contrast=8), color=dict(vibrance=16), fx=dict(vignette=-8)), ['flat', 'dull']),
    ('bn', 'Alto Contraste', B + 'Fuji/Fuji Neopan Acros 100.png', CC, 'RawTherapee', L(lut=1, light=dict(exposure=.1, contrast=18), detail=dict(clarity=12)), ['flat', 'oversat']),
    ('bn', 'Delta', B + 'Ilford/Ilford Delta 100.png', CC, 'RawTherapee', L(lut=1, light=dict(contrast=6), fx=dict(grain=6)), ['oversat']),
    ('bn', 'Retro B/N', Z + 'Vintage-B&W.png', CC, 'PictureFX', L(lut=.95, fade=.03, fx=dict(grain=12, vignette=-10)), ['oversat']),
]
# Qué problemas de la foto ayuda a resolver cada look original
FITS = {'Clean': ['flat', 'dull'], 'Airy': ['dark'], 'Pastel': ['oversat'], 'Natural Pro': ['oversat'], 'Piel Suave': ['portrait'], 'Invierno': ['warm'], 'Editorial': ['oversat'], 'Vivid Pop': ['flat', 'dull'],
        'Golden Hour': ['cool', 'flat'], 'Atardecer': ['cool'], 'Verano': ['cool'], 'Brisa': ['dull'], 'Miel': ['cool'], 'Otoño': ['cool'], 'Crisp Cálido': ['flat', 'cool'],
        'Classic Chrome': ['oversat'], 'Moody': ['bright', 'oversat'], 'Desaturado': ['oversat'], 'Mate': ['oversat', 'bright'], 'Teal & Orange': ['flat'], 'Blockbuster': ['flat'], 'Drama': ['flat'], 'Tri-X': ['oversat'], 'Acros': ['oversat'], 'Portra 400': ['portrait'], 'Ektar 100': ['dull']}
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

# Looks que se adaptan a cada foto: la app calcula luz, contraste y color según lo que ve
def S(lut, target=.54, scenes=(), **k):
    return dict(L(lut=lut, **k), target=target, scenes=list(scenes))

LOOKS += [
    ('foto', 'Portada', C + 'Kodak/Kodak Portra 160 NC 2.png', CC, 'RawTherapee', S(.34, .56, ['retrato', 'general'], light=dict(contrast=8, highlights=-10, shadows=10), color=dict(vibrance=12, temp=3), detail=dict(clarity=5)), ['dark', 'flat', 'dull']),
    ('foto', 'Campeón', C + 'Fuji/Fuji Provia 100F.png', CC, 'RawTherapee', S(.36, .55, ['retrato', 'general', 'arquitectura'], light=dict(exposure=0.14, contrast=16, highlights=-12, shadows=8), color=dict(vibrance=16), detail=dict(clarity=10)), ['dark', 'flat', 'dull']),
    ('foto', 'Verano Vivo', C + 'Fuji/Fuji Velvia 100 Generic.png', CC, 'RawTherapee', S(.3, .56, ['paisaje', 'general'], light=dict(exposure=0.06, contrast=10, highlights=-10, shadows=8), color=dict(vibrance=20, temp=4), detail=dict(clarity=6)), ['dark', 'flat', 'dull']),
    ('foto', 'Playa Clara', G + 'Bright-Summer-Heat.png', CC, 'PictureFX', S(.28, .6, ['paisaje', 'retrato'], light=dict(contrast=6, highlights=-14, shadows=12), color=dict(vibrance=16, temp=2)), ['dark', 'flat', 'dull']),
    ('foto', 'Cielo Limpio', C + 'Fuji/Fuji Provia 400X.png', CC, 'RawTherapee', S(.32, .55, ['paisaje', 'arquitectura'], light=dict(exposure=0.26, contrast=10, highlights=-16, shadows=8), color=dict(vibrance=18, temp=-3), detail=dict(clarity=8, dehaze=6)), ['dark', 'flat', 'dull']),
    ('foto', 'Hora Mágica', G + 'Perfect-Sunset-01min.png', CC, 'PictureFX', S(.3, .56, ['retrato', 'paisaje'], light=dict(exposure=0.2, contrast=6, highlights=-10, shadows=10), color=dict(vibrance=10, temp=8)), ['dark', 'flat', 'dull']),
    ('foto', 'Piel Luminosa', C + 'Kodak/Kodak Portra 400 NC 2.png', CC, 'RawTherapee', S(.36, .58, ['retrato'], light=dict(contrast=4, highlights=-10, shadows=12), color=dict(vibrance=8, temp=4), detail=dict(texture=-8)), ['dark', 'flat', 'dull']),
    ('foto', 'Editorial Claro', C + 'Kodak/Kodak Portra 160 VC 2.png', CC, 'RawTherapee', S(.3, .6, ['retrato', 'general', 'comida'], light=dict(contrast=10, highlights=-12, shadows=8), color=dict(vibrance=14)), ['dark', 'flat', 'dull']),
    ('foto', 'Moda', C + 'Kodak/Kodak E-100 GX Ektachrome 100.png', CC, 'RawTherapee', S(.34, .56, ['retrato', 'arquitectura'], light=dict(exposure=0.14, contrast=14, highlights=-10), color=dict(vibrance=12), detail=dict(clarity=6)), ['dark', 'flat', 'dull']),
    ('foto', 'Estudio Blanco', C + 'Fuji/Fuji 160C 2.png', CC, 'RawTherapee', S(.28, .62, ['retrato', 'comida'], light=dict(contrast=6, highlights=-8, shadows=14, whites=8), color=dict(vibrance=10), detail=dict(texture=-6)), ['dark', 'flat', 'dull']),
    ('foto', 'Ciudad Viva', C + 'Kodak/Kodak Ektar 100.png', CC, 'RawTherapee', S(.3, .55, ['arquitectura', 'general'], light=dict(exposure=0.2, contrast=14, highlights=-12, shadows=10), color=dict(vibrance=16), detail=dict(clarity=10)), ['dark', 'flat', 'dull']),
    ('foto', 'Aire Libre', C + 'Fuji/Fuji Superia 400 2.png', CC, 'RawTherapee', S(.28, .56, ['paisaje', 'general'], light=dict(contrast=8, highlights=-12, shadows=10), color=dict(vibrance=18), detail=dict(clarity=6)), ['dark', 'flat', 'dull']),
    ('foto', 'Fresco', G + 'Bright-Spring-Breeze.png', CC, 'PictureFX', S(.28, .6, ['general', 'comida', 'paisaje'], light=dict(contrast=6, highlights=-10, shadows=10), color=dict(vibrance=14, temp=-2)), ['dark', 'flat', 'dull']),
    ('foto', 'Deportivo', C + 'Kodak/Kodak Elite Chrome 400.png', CC, 'RawTherapee', S(.34, .55, ['general', 'retrato', 'arquitectura'], light=dict(exposure=0.18, contrast=20, highlights=-12, shadows=6), color=dict(vibrance=18), detail=dict(clarity=14)), ['dark', 'flat', 'dull']),
    ('foto', 'Luz de Ventana', C + 'Fuji/Fuji 400H 2.png', CC, 'RawTherapee', S(.3, .6, ['retrato', 'comida'], light=dict(contrast=4, highlights=-12, shadows=14), color=dict(vibrance=10, temp=2), detail=dict(texture=-6)), ['dark', 'flat', 'dull']),
    ('foto', 'Noche Viva', C + 'Fuji/Fuji Superia 1600 2.png', CC, 'RawTherapee', S(.28, .46, ['noche'], light=dict(exposure=0.1, contrast=8, highlights=-14, shadows=24), color=dict(vibrance=16), detail=dict(denoise=14)), ['dark', 'flat', 'dull']),
]

LIGHT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'look-light.json')
LIGHT = json.load(open(LIGHT_PATH)) if os.path.isfile(LIGHT_PATH) else {}


def main():
    out, missing = [], []
    M = LEVEL * LEVEL
    seen = {}
    for row in LOOKS:
        cat, name, rel, lic, author, fin = row[:6]
        fits = row[6] if len(row) > 6 else FITS.get(name, [])
        path = ROOT + rel
        if not os.path.isfile(path):
            missing.append(rel)
            print('FALTA', rel, file=sys.stderr)
            continue
        c, src_level = load_cube(path)
        item = dict(id=slug(name), name=name, cat=cat, premium=len(row) > 6 and cat != 'foto', smart=cat == 'foto', dl=LIGHT.get(slug(name), 0), file=rel, srcLevel=src_level, level=LEVEL, license=lic, author=author, fin=fin, fits=fits, m=metrics(c))
        if rel in seen:
            item['ref'] = seen[rel]
        else:
            r = np.clip(np.round(resample(c, M)), 0, 255).astype(np.uint8)
            side = LEVEL ** 3
            buf = io.BytesIO()
            Image.fromarray(r.reshape(side, side, 3)).save(buf, 'PNG', optimize=True)
            item['png'] = base64.b64encode(buf.getvalue()).decode()
            seen[rel] = item['id']
        out.append(item)
    if missing:
        sys.exit(f'Faltan {len(missing)} presets')
    if len({x["id"] for x in out}) != len(out):
        sys.exit('Hay nombres de look repetidos')
    json.dump(out, open(os.path.join(os.path.dirname(__file__), 'luts.json'), 'w'), separators=(',', ':'))
    total = sum(len(x.get('png', '')) for x in out)
    print(f'{len(out)} presets, {total / 1048576:.2f} MB en base64')
    for x in out:
        print(f"{x['cat']:<10}{x['name']:<16} L{x['srcLevel']} con={x['m']['contrast']} sat={x['m']['sat']} warm={x['m']['warm']} skin={x['m']['skinHue']} bw={x['m']['bw']}")


main()
