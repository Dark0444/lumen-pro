#!/usr/bin/env node
/* Copia las fuentes dentro de www/ para que el APK no dependa de Google Fonts.
   Si falta alguna, avisa y deja el enlace a Google como respaldo. */
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const destino = path.join(raiz, 'www', 'vendor');
fs.mkdirSync(destino, { recursive: true });
const fuentes = [
  { paq: '@fontsource/manrope', familia: 'Manrope', pesos: [500, 600, 700, 800], estilos: ['normal'] },
  { paq: '@fontsource/instrument-serif', familia: 'Instrument Serif', pesos: [400], estilos: ['normal', 'italic'] },
];
let css = '', faltan = [];
for (const f of fuentes) for (const peso of f.pesos) for (const estilo of f.estilos) {
  const archivo = `${f.paq.split('/')[1]}-latin-${peso}-${estilo}.woff2`;
  const origen = path.join(raiz, 'node_modules', f.paq, 'files', archivo);
  if (!fs.existsSync(origen)) { faltan.push(archivo); continue; }
  fs.copyFileSync(origen, path.join(destino, archivo));
  css += `@font-face{font-family:'${f.familia}';font-style:${estilo};font-weight:${peso};font-display:swap;src:url('${archivo}') format('woff2');}\n`;
}
if (faltan.length) {
  console.log('::warning title=Fuentes incompletas::' + faltan.join(', '));
  process.exit(0);
}
fs.writeFileSync(path.join(destino, 'fuentes.css'), css);
const indice = path.join(raiz, 'www', 'index.html');
const html = fs.readFileSync(indice, 'utf8');
const nuevo = html.replace(/<link rel="preconnect"[^>]*>\s*<link rel="preconnect"[^>]*>\s*<link rel="stylesheet" href="https:\/\/fonts\.googleapis\.com[^>]*>/, '<link rel="stylesheet" href="vendor/fuentes.css">');
if (nuevo === html) { console.log('::warning title=Fuentes::No se encontró el enlace a Google Fonts.'); process.exit(0); }
fs.writeFileSync(indice, nuevo);
console.log('vendor: fuentes locales listas');
