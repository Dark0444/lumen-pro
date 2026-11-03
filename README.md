# LUMEN PRO

Sube una foto y la app detecta si está oscura, opaca o muy saturada, la corrige y te sugiere ediciones.
Luego deslizas entre 84 looks, la ajustas a mano y la guardas hasta en 4K. Todo es gratis y corre en el teléfono.

## Instalar en Android

Descarga [`LumenPro.apk`](../../releases/download/apk-latest/LumenPro.apk). Requiere Android 10 o superior.
Cada versión se instala encima de la anterior, porque siempre va firmada con la misma llave.

Las fotos se guardan en la galería, en el álbum **LUMEN PRO**. Los ZIP van a Descargas.

## Privacidad y funcionamiento sin internet

El APK incluye todo lo que usa: ONNX Runtime, Real-ESRGAN, MediaPipe y las fuentes. No sube fotos, no pide cuentas ni cobra por nada.

La release `vendor-v1` guarda esos archivos. La crea el workflow `vendor.yml`, y cada compilación los copia al APK.

## Cómo está armado

```
src/                 la app: núcleo, WebGL, IA, interfaz y estilos
build/build.py       une todo en un solo HTML (dist/ y www/)
build/luts.json      los 84 looks: tablas reales reducidas y su acabado
build/prepare_luts.py  regenera luts.json a partir de la colección HaldCLUT
android-plugin/      guardar en la galería y compartir
scripts/             fuentes locales y ajustes al proyecto Android
keystore/lumen.jks   llave de firma de esta app personal
test/                pruebas del motor y prueba en navegador
```

La carpeta `android/` no se versiona. GitHub Actions la genera con Capacitor en cada `push` a `main`,
compila el APK y lo publica en `apk-latest`.

```bash
python3 build/build.py      # genera dist/LUMEN-PRO.html
node --test test/core.test.js
WWW=www node test/smoke.mjs # requiere Playwright y www/vendor
```

## Licencias y antes de publicar

- Tablas de RawTherapee y PictureFX: CC BY-SA 4.0. Los autores aparecen en la pantalla de créditos de la app.
- Clean, Natural Pro, Editorial, Vivid Pop, Classic Chrome y Acros usan tablas de Stuart Sowerby sin licencia declarada. Pide permiso o quítalas antes de publicar la app.
- Los looks de Móviles son interpretaciones. No son perfiles oficiales de Apple, Xiaomi, Leica ni Google.
- Real-ESRGAN: BSD-3-Clause. ONNX Runtime Web: MIT. MediaPipe: Apache-2.0.
- La llave de firma y su contraseña están en el repositorio. Si lo haces público o publicas la app, cambia la llave primero.
