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
/* Aparecer en Compartir y Editar de la Galería */
if (!manifest.includes('android.intent.action.SEND')) {
  if (!manifest.includes('</activity>')) fallar('Manifiesto', 'No se encontró la actividad principal.');
  manifest = manifest.replace('</activity>', `    <intent-filter android:label="Editar en LUMEN PRO">
                <action android:name="android.intent.action.SEND" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="image/*" />
            </intent-filter>
            <intent-filter android:label="Editar en LUMEN PRO">
                <action android:name="android.intent.action.EDIT" />
                <category android:name="android.intent.category.DEFAULT" />
                <data android:mimeType="image/*" />
            </intent-filter>
        </activity>`);
}
/* Cámara: permiso, widget y acceso directo */
if (!manifest.includes('android.permission.CAMERA')) manifest = manifest.replace('</manifest>', '    <uses-permission android:name="android.permission.CAMERA" />\n    <uses-feature android:name="android.hardware.camera" android:required="false" />\n</manifest>');
if (!manifest.includes('LumenCamaraWidget')) {
  manifest = manifest.replace('</activity>', `</activity>
        <receiver android:name=".LumenCamaraWidget" android:exported="true" android:label="Cámara LUMEN">
            <intent-filter><action android:name="android.appwidget.action.APPWIDGET_UPDATE" /></intent-filter>
            <meta-data android:name="android.appwidget.provider" android:resource="@xml/widget_camara_info" />
        </receiver>`);
  manifest = manifest.replace('</activity>', `    <meta-data android:name="android.app.shortcuts" android:resource="@xml/atajos" />
        </activity>`);
}
escribir(manifestPath, manifest);
hechos.push('manifiesto, compartir desde la Galería y cámara');

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

/* Barras del sistema oscuras, igual que la app */
const estilosPath = path.join(android, 'app/src/main/res/values/styles.xml');
let estilos = leer(estilosPath);
if (!estilos.includes('android:navigationBarColor')) {
  estilos = estilos.replace(/<\/style>/g, '    <item name="android:statusBarColor">#08080A</item>\n        <item name="android:navigationBarColor">#08080A</item>\n    </style>');
  escribir(estilosPath, estilos);
  hechos.push('barras oscuras');
}

/* Rutas para compartir el archivo temporal */
const xmlDir = path.join(android, 'app/src/main/res/xml');
fs.mkdirSync(xmlDir, { recursive: true });
escribir(path.join(xmlDir, 'file_paths.xml'), `<?xml version="1.0" encoding="utf-8"?>
<paths xmlns:android="http://schemas.android.com/apk/res/android">
    <external-path name="my_images" path="." />
    <cache-path name="my_cache_images" path="." />
</paths>
`);

/* Widget y acceso directo de la cámara */
const resDir = path.join(android, 'app/src/main/res');
for (const d of ['layout', 'drawable', 'xml']) fs.mkdirSync(path.join(resDir, d), { recursive: true });
escribir(path.join(resDir, 'layout/widget_camara.xml'), `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android" android:id="@+id/widget_root" android:layout_width="match_parent" android:layout_height="match_parent" android:gravity="center" android:orientation="vertical" android:background="@drawable/widget_fondo">
    <ImageView android:layout_width="30dp" android:layout_height="30dp" android:src="@drawable/widget_icono" android:contentDescription="Cámara LUMEN" />
    <TextView android:layout_width="wrap_content" android:layout_height="wrap_content" android:layout_marginTop="2dp" android:text="Cámara" android:textColor="#FFFFFF" android:textSize="11sp" android:textStyle="bold" />
</LinearLayout>
`);
escribir(path.join(resDir, 'drawable/widget_fondo.xml'), `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android" android:shape="rectangle"><solid android:color="#000000" /><corners android:radius="22dp" /></shape>
`);
escribir(path.join(resDir, 'drawable/widget_icono.xml'), `<?xml version="1.0" encoding="utf-8"?>
<vector xmlns:android="http://schemas.android.com/apk/res/android" android:width="24dp" android:height="24dp" android:viewportWidth="24" android:viewportHeight="24">
    <path android:fillColor="#00000000" android:strokeColor="#FFC83D" android:strokeWidth="1.8" android:pathData="M4,7.5h3.5l1.6,-2.5h5.8l1.6,2.5H20a1.5,1.5 0,0 1,1.5 1.5v9a1.5,1.5 0,0 1,-1.5 1.5H4A1.5,1.5 0,0 1,2.5 18V9A1.5,1.5 0,0 1,4 7.5z" />
    <path android:fillColor="#00000000" android:strokeColor="#FFFFFF" android:strokeWidth="1.8" android:pathData="M12,9.7a3.8,3.8 0,1 0,0 7.6a3.8,3.8 0,1 0,0 -7.6z" />
</vector>
`);
escribir(path.join(xmlDir, 'widget_camara_info.xml'), `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android" android:minWidth="57dp" android:minHeight="57dp" android:targetCellWidth="1" android:targetCellHeight="1" android:updatePeriodMillis="0" android:initialLayout="@layout/widget_camara" android:previewLayout="@layout/widget_camara" android:resizeMode="none" android:widgetCategory="home_screen" android:description="@string/widget_camara_desc" />
`);
escribir(path.join(xmlDir, 'atajos.xml'), `<?xml version="1.0" encoding="utf-8"?>
<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">
    <shortcut android:shortcutId="camara" android:enabled="true" android:icon="@drawable/widget_icono" android:shortcutShortLabel="@string/atajo_camara">
        <intent android:action="com.lumenpro.app.CAMARA" android:targetPackage="com.lumenpro.app" android:targetClass="com.lumenpro.app.MainActivity" />
    </shortcut>
</shortcuts>
`);
const stringsPath = path.join(resDir, 'values/strings.xml');
let strings = leer(stringsPath);
if (!strings.includes('atajo_camara')) { strings = strings.replace('</resources>', '    <string name="atajo_camara">Cámara</string>\n    <string name="widget_camara_desc">Abre la cámara con presets en vivo</string>\n</resources>'); escribir(stringsPath, strings); }
hechos.push('widget de cámara');

/* Plugin propio */
const paquete = path.join(android, 'app/src/main/java/com/lumenpro/app');
fs.mkdirSync(paquete, { recursive: true });
fs.copyFileSync(path.join(raiz, 'android-plugin/LumenNativoPlugin.java'), path.join(paquete, 'LumenNativoPlugin.java'));
fs.copyFileSync(path.join(raiz, 'android-plugin/LumenCamaraWidget.java'), path.join(paquete, 'LumenCamaraWidget.java'));
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
