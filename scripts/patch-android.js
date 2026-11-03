#!/usr/bin/env node
/* Ajustes al proyecto Android que Capacitor genera en cada compilación:
   permisos, memoria, firma, versión, SDK mínimo y el plugin para guardar fotos. */
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
const android = path.join(raiz, 'android');
const fallar = (t, m) => { console.error(`::error title=${t}::${m}`); process.exit(1); };
if (!fs.existsSync(android)) fallar('Falta el proyecto Android', 'Ejecuta npx cap add android antes de este script.');
const leer = (p) => fs.readFileSync(p, 'utf8');
const escribir = (p, s) => fs.writeFileSync(p, s, 'utf8');
const hechos = [];

/* Manifiesto */
const manifestPath = path.join(android, 'app/src/main/AndroidManifest.xml');
let manifest = leer(manifestPath);
if (!manifest.includes('android.permission.VIBRATE')) manifest = manifest.replace('</manifest>', '    <uses-permission android:name="android.permission.VIBRATE" />\n</manifest>');
if (!manifest.includes('android:largeHeap')) manifest = manifest.replace('<application', '<application\n        android:largeHeap="true"\n        android:hardwareAccelerated="true"');
if (!manifest.includes('android:windowSoftInputMode')) manifest = manifest.replace('<activity', '<activity\n            android:windowSoftInputMode="adjustResize"');
escribir(manifestPath, manifest);
hechos.push('manifiesto');

/* Android 10 o superior: el guardado usa MediaStore sin pedir permisos de almacenamiento */
const varsPath = path.join(android, 'variables.gradle');
let vars = leer(varsPath);
if (!/minSdkVersion\s*=\s*\d+/.test(vars)) fallar('SDK mínimo', 'No se encontró minSdkVersion en variables.gradle.');
vars = vars.replace(/minSdkVersion\s*=\s*\d+/, 'minSdkVersion = 29');
escribir(varsPath, vars);
hechos.push('Android 10+');

/* Firma y versión */
if (!fs.existsSync(path.join(raiz, 'keystore', 'lumen.jks'))) fallar('Falta la llave de firma', 'No existe keystore/lumen.jks.');
const gradlePath = path.join(android, 'app/build.gradle');
let gradle = leer(gradlePath);
if (!gradle.includes('signingConfigs')) {
  gradle = gradle.replace(/android\s*\{/, (m) => `${m}
    signingConfigs {
        release {
            storeFile file('../../keystore/lumen.jks')
            storePassword 'lumenpro2026'
            keyAlias 'lumen'
            keyPassword 'lumenpro2026'
        }
    }
`);
}
if (!gradle.includes('signingConfig signingConfigs.release')) gradle = gradle.replace(/(buildTypes\s*\{[\s\S]*?release\s*\{)/, '$1\n            signingConfig signingConfigs.release');
const build = parseInt(process.env.GITHUB_RUN_NUMBER || '1', 10);
const pkg = JSON.parse(leer(path.join(raiz, 'package.json')));
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${build}`).replace(/versionName\s+"[^"]*"/, `versionName "${pkg.version}.${build}"`);
escribir(gradlePath, gradle);
hechos.push(`firma y versión ${pkg.version}.${build}`);

/* Rutas para compartir el archivo temporal */
const xmlDir = path.join(android, 'app/src/main/res/xml');
fs.mkdirSync(xmlDir, { recursive: true });
escribir(path.join(xmlDir, 'file_paths.xml'), `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-path name="my_images" path="." />
    <cache-path name="my_cache_images" path="." />
</paths>
`);

/* Plugin propio */
const paquete = path.join(android, 'app/src/main/java/com/lumenpro/app');
fs.mkdirSync(paquete, { recursive: true });
fs.copyFileSync(path.join(raiz, 'android-plugin/LumenNativoPlugin.java'), path.join(paquete, 'LumenNativoPlugin.java'));
const mainPath = path.join(paquete, 'MainActivity.java');
if (!fs.existsSync(mainPath)) fallar('MainActivity', 'No se encontró MainActivity.java.');
let main = leer(mainPath);
if (!main.includes('LumenNativoPlugin.class')) {
  if (!/public\s+class\s+MainActivity[^{]*\{/.test(main)) fallar('MainActivity', 'No se pudo registrar el plugin.');
  main = main.replace(/(public\s+class\s+MainActivity[^{]*\{)/, `$1
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(LumenNativoPlugin.class);
        super.onCreate(savedInstanceState);
    }
`);
  escribir(mainPath, main);
}
hechos.push('plugin para guardar y compartir');
console.log('patch-android: ' + hechos.join(' · '));
