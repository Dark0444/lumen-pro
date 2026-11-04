#!/usr/bin/env bash
# Prueba en un emulador que la app reciba una foto desde Compartir y Editar.
set -u
OUT=resultado-compartir
mkdir -p "$OUT"
python3 - <<'PY'
import struct, zlib
w, h = 1200, 900
rows = b''.join(b'\0' + bytes(v for x in range(w) for v in (x * 255 // w, y * 255 // h, 180)) for y in range(h))
def chunk(t, d):
    return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d))
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows, 6)) + chunk(b'IEND', b'')
open('prueba-lumen.png', 'wb').write(png)
PY
adb install -r LumenPro.apk
adb push prueba-lumen.png /sdcard/Pictures/prueba-lumen.png
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Pictures/prueba-lumen.png
sleep 8
ID=$(adb shell content query --uri content://media/external/images/media --projection _id:_display_name | tr -d '\r' | grep prueba-lumen | sed -E 's/.*_id=([0-9]+).*/\1/' | head -1)
URI="content://media/external/images/media/$ID"
{
  echo "URI: $URI"
  echo "--- Aparece en Compartir:"
  adb shell cmd package query-activities --components -a android.intent.action.SEND -t image/png | tr -d '\r' | grep -i lumenpro || echo NO
  echo "--- Aparece en Editar:"
  adb shell cmd package query-activities --components -a android.intent.action.EDIT -t image/png | tr -d '\r' | grep -i lumenpro || echo NO
} > "$OUT/resultado.txt"
adb logcat -c
# am no concede permiso sobre EXTRA_STREAM: se pasa también como dato para que el permiso exista
adb shell am start -W -a android.intent.action.SEND -t image/png -d "$URI" --eu android.intent.extra.STREAM "$URI" --grant-read-uri-permission -n com.lumenpro.app/.MainActivity >> "$OUT/resultado.txt" 2>&1
for i in 1 2 3 4; do sleep 4; adb exec-out screencap -p > "$OUT/1-compartir-$i.png"; done
sleep 45
adb exec-out screencap -p > "$OUT/1-compartir-final.png"
adb shell am start -W -a android.intent.action.EDIT -t image/png -d "$URI" --grant-read-uri-permission -n com.lumenpro.app/.MainActivity >> "$OUT/resultado.txt" 2>&1
for i in 1 2 3; do sleep 4; adb exec-out screencap -p > "$OUT/2-editar-$i.png"; done
sleep 30
adb exec-out screencap -p > "$OUT/2-editar-final.png"
# Cámara: se abre como desde el widget y toma dos fotos
{
  echo "--- Widget:"
  adb shell cmd package query-receivers --components -a android.appwidget.action.APPWIDGET_UPDATE | tr -d '\r' | grep -i lumen || echo NO
} >> "$OUT/resultado.txt"
adb shell am force-stop com.lumenpro.app
adb shell pm grant com.lumenpro.app android.permission.CAMERA
adb shell am start -W -a com.lumenpro.app.CAMARA -n com.lumenpro.app/.MainActivity >> "$OUT/resultado.txt" 2>&1
sleep 40
adb exec-out screencap -p > "$OUT/3-camara.png"
SIZE=$(adb shell wm size | tr -d '\r' | sed -E 's/.*: //' | tail -1)
W=${SIZE%x*}; H=${SIZE#*x}
D=$(adb shell wm density | tr -d '\r' | sed -E 's/.*: //' | tail -1)
Y=$(( H - 58 * D / 160 ))
adb shell input tap $(( W / 2 )) "$Y"
sleep 6
adb shell input tap $(( W / 2 )) "$Y"
sleep 3
adb exec-out screencap -p > "$OUT/4-camara-guardando.png"
sleep 200
adb exec-out screencap -p > "$OUT/5-camara-final.png"
{
  echo "--- Sin respuesta (ANR):"
  adb shell dumpsys window | tr -d '\r' | grep -i "Application Not Responding" | head -2 || true
  adb shell dumpsys activity processes | tr -d '\r' | grep -i "notResponding=true\|Not Responding" | head -2 || true
  echo "--- fin ANR"
} >> "$OUT/resultado.txt"
{
  echo "--- Fotos guardadas:"
  adb shell content query --uri content://media/external/images/media --projection _display_name:_size:width:height | tr -d '\r' | grep LUMEN_ || echo NINGUNA
} >> "$OUT/resultado.txt"
FOTO=$(adb shell ls "/sdcard/Pictures/LUMEN\\ PRO/" 2>/dev/null | tr -d '\r' | grep LUMEN_ | tail -1)
[ -n "$FOTO" ] && adb pull "/sdcard/Pictures/LUMEN PRO/$FOTO" "$OUT/6-foto-guardada.jpg" >/dev/null
adb logcat -d -s LumenNativo:V Capacitor:V AndroidRuntime:E > "$OUT/logcat.txt"
adb logcat -d | grep -E "no access to|FATAL" >> "$OUT/logcat.txt"
cat "$OUT/resultado.txt"
