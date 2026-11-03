# LUMEN PRO

Sube una foto y la app la corrige sola según su luz y su color. Luego deslizas entre 40 looks,
la ajustas a mano y la guardas hasta en 4K. También puedes pedir cambios con una instrucción,
como «quita el árbol» o «ponme en París».

## Instalar en Android

Descarga `LumenPro.apk` desde la release [`apk-latest`](../../releases/tag/apk-latest).
Requiere Android 10 o superior. Cada versión se instala encima de la anterior, porque siempre va
firmada con la misma llave.

Las fotos se guardan en la galería, en el álbum **LUMEN PRO**. Los ZIP van a Descargas.

## Qué funciona sin internet

Los looks, el autoajuste, los ajustes manuales, el recorte y la exportación clásica funcionan sin conexión.

| Función | Necesita | Qué se envía |
|---|---|---|
| Editar con instrucciones | Clave de Gemini con facturación activa; cobra Google | La foto y la instrucción, a Google |
| Mejora con Real-ESRGAN | Descargar el modelo una vez | Nada; corre en el teléfono |
| Detección de rostros y personas | Descargar MediaPipe una vez | Nada; corre en el teléfono |

## Cómo está armado

```
src/                 la app: núcleo, WebGL, IA, interfaz y estilos
build/build.py       une todo en un solo HTML (dist/ y www/)
build/luts.json      los 40 looks: tablas reales reducidas y su acabado
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
node test/smoke.mjs         # requiere Playwright
```

## Licencias y antes de publicar

- Tablas de RawTherapee y PictureFX: CC BY-SA 4.0. Los autores aparecen en la pantalla de créditos de la app.
- Clean, Natural Pro, Editorial, Vivid Pop, Classic Chrome y Acros usan tablas de Stuart Sowerby sin licencia declarada. Pide permiso o quítalas antes de publicar la app.
- Real-ESRGAN: BSD-3-Clause. ONNX Runtime Web: MIT. MediaPipe: Apache-2.0.
- La llave de firma y su contraseña están en el repositorio. Si lo haces público o publicas la app, cambia la llave primero.
