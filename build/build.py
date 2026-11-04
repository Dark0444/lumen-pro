#!/usr/bin/env python3
"""Une todo en un solo archivo HTML, sin dependencias locales."""
import base64, json, os, shutil

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'src')
read = lambda n: open(os.path.join(SRC, n), encoding='utf-8').read()

luts = json.load(open(os.path.join(HERE, 'luts.json')))
sample = base64.b64encode(open(os.path.join(HERE, 'sample.jpg'), 'rb').read()).decode()

html = f'''<!doctype html>
<html lang="es" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>LUMEN PRO</title>
<meta name="description" content="Corrige tus fotos sola, desliza entre 40 looks y pide cambios con IA.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@500;600;700;800&family=Instrument+Serif:ital@0;1&display=swap">
<style>
{read('app.css')}
</style>
</head>
<body>
<div id="app">
  <header class="top">
    <button class="icon back-top" id="bBack" aria-label="Nueva foto" title="Nueva foto" hidden></button>
    <button id="brandBtn" class="brand" aria-label="LUMEN PRO, volver a la portada">LUMEN<b> PRO</b></button>
    <nav aria-label="Secciones" style="display:contents"><ol class="steps" id="steps" hidden></ol></nav>
    <div class="top-actions">
      <button class="primary-top" id="bExport" hidden>Exportar</button>
      <button class="icon" id="bUndo" aria-label="Deshacer" title="Deshacer (Ctrl+Z)" hidden></button>
      <button class="icon" id="bRedo" aria-label="Rehacer" title="Rehacer (Ctrl+Shift+Z)" hidden></button>
      <button class="icon" id="bTheme" aria-label="Cambiar entre tema claro y oscuro" title="Tema"></button>
      <button class="icon" id="bInfo" aria-label="Créditos y licencias" title="Créditos y licencias"></button>
    </div>
  </header>
  <main id="main" style="min-height:0;min-width:0"></main>
</div>
<div id="toasts" aria-live="polite"></div>
<script id="lut-data" type="application/json">{json.dumps(luts, separators=(',', ':'), ensure_ascii=False)}</script>
<script id="sample-photo" type="text/plain">{sample}</script>
<script id="core-src">
{read('core.js')}
</script>
<script>
{read('gl.js')}
{read('ai.js')}
{read('app.js')}
</script>
</body>
</html>
'''
os.makedirs(os.path.join(HERE, '..', 'dist'), exist_ok=True)
out = os.path.join(HERE, '..', 'dist', 'LUMEN-PRO.html')
open(out, 'w', encoding='utf-8').write(html)
os.makedirs(os.path.join(HERE, '..', 'www'), exist_ok=True)
shutil.copyfile(out, os.path.join(HERE, '..', 'www', 'index.html'))
print(out, f'{os.path.getsize(out) / 1048576:.2f} MB')
