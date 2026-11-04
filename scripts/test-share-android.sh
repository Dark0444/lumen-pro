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
adb logcat -d -s LumenNativo:V Capacitor:V AndroidRuntime:E > "$OUT/logcat.txt"
adb logcat -d | grep -E "no access to|FATAL" >> "$OUT/logcat.txt"
cat "$OUT/resultado.txt"
