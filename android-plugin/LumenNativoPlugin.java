package com.lumenpro.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;

/** Recibe la imagen por trozos y la guarda en la galería o la comparte. */
@CapacitorPlugin(name = "LumenNativo")
public class LumenNativoPlugin extends Plugin {
    private File temp;
    private FileOutputStream out;
    private String name = "foto.jpg";
    private String mime = "image/jpeg";

    @PluginMethod
    public void begin(PluginCall call) {
        try {
            closeOut();
            name = sanitize(call.getString("name", "foto.jpg"));
            mime = call.getString("mime", "image/jpeg");
            File dir = new File(getContext().getCacheDir(), "export");
            if (!dir.exists() && !dir.mkdirs()) throw new IOException("No se pudo preparar la carpeta temporal.");
            File[] previous = dir.listFiles();
            if (previous != null) for (File f : previous) f.delete();
            temp = new File(dir, name);
            out = new FileOutputStream(temp);
            call.resolve();
        } catch (IOException e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void chunk(PluginCall call) {
        try {
            if (out == null) throw new IOException("La exportación no se inició.");
            out.write(Base64.decode(call.getString("data", ""), Base64.DEFAULT));
            call.resolve();
        } catch (IOException | IllegalArgumentException e) {
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void save(PluginCall call) {
        Uri item = null;
        ContentResolver resolver = getContext().getContentResolver();
        try {
            closeOut();
            if (temp == null) throw new IOException("No hay nada que guardar.");
            boolean image = mime.startsWith("image/");
            ContentValues values = new ContentValues();
            values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            values.put(MediaStore.MediaColumns.RELATIVE_PATH, image ? Environment.DIRECTORY_PICTURES + "/LUMEN PRO" : Environment.DIRECTORY_DOWNLOADS);
            values.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri collection = image ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI : MediaStore.Downloads.EXTERNAL_CONTENT_URI;
            item = resolver.insert(collection, values);
            if (item == null) throw new IOException("Android no permitió crear el archivo.");
            try (InputStream in = new FileInputStream(temp); OutputStream dest = resolver.openOutputStream(item)) {
                if (dest == null) throw new IOException("Android no permitió escribir el archivo.");
                byte[] buffer = new byte[256 * 1024];
                int n;
                while ((n = in.read(buffer)) > 0) dest.write(buffer, 0, n);
            }
            values.clear();
            values.put(MediaStore.MediaColumns.IS_PENDING, 0);
            resolver.update(item, values, null, null);
            temp.delete();
            JSObject result = new JSObject();
            result.put("uri", item.toString());
            call.resolve(result);
        } catch (IOException | SecurityException e) {
            if (item != null) resolver.delete(item, null, null);
            call.reject(e.getMessage());
        }
    }

    @PluginMethod
    public void share(PluginCall call) {
        try {
            closeOut();
            if (temp == null) throw new IOException("No hay nada que compartir.");
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", temp);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(Intent.createChooser(send, "Compartir foto"));
            call.resolve();
        } catch (IOException | IllegalArgumentException e) {
            call.reject(e.getMessage());
        }
    }

    private void closeOut() throws IOException {
        if (out != null) {
            out.close();
            out = null;
        }
    }

    private static String sanitize(String value) {
        String clean = value.replaceAll("[^A-Za-z0-9._-]", "_");
        return clean.isEmpty() ? "foto.jpg" : clean;
    }
}
