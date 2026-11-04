package com.lumenpro.app;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;
import android.provider.OpenableColumns;
import android.util.Base64;
import android.util.Log;
import android.webkit.MimeTypeMap;

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
    private static final long MAX_INCOMING = 200L * 1024 * 1024;
    private static final String TAG = "LumenNativo";

    /* La app se abrió desde Compartir o Editar de otra app, como la Galería */
    @Override
    public void load() {
        Intent intent = getActivity().getIntent();
        if (receiveImage(intent)) getActivity().setIntent(new Intent(Intent.ACTION_MAIN));
    }

    /* La app ya estaba abierta */
    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        receiveImage(intent);
    }

    private boolean receiveImage(Intent intent) {
        if (intent == null || intent.getAction() == null) return false;
        if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return false;
        final String action = intent.getAction();
        if (!Intent.ACTION_SEND.equals(action) && !Intent.ACTION_EDIT.equals(action)) return false;
        Uri uri = Intent.ACTION_SEND.equals(action) ? intent.getParcelableExtra(Intent.EXTRA_STREAM) : intent.getData();
        Log.i(TAG, "Foto recibida por " + action);
        ClipData clip = intent.getClipData();
        if (uri == null && clip != null && clip.getItemCount() > 0) uri = clip.getItemAt(0).getUri();
        /* Solo se aceptan fotos de otras apps, nunca rutas directas a archivos internos */
        if (uri == null || !ContentResolver.SCHEME_CONTENT.equals(uri.getScheme())) {
            notifyIncomingError("No se pudo abrir esa foto.");
            return true;
        }
        final Uri source = uri;
        new Thread(() -> copyIncoming(source)).start();
        return true;
    }

    private void copyIncoming(Uri source) {
        ContentResolver resolver = getContext().getContentResolver();
        File dir = new File(getContext().getCacheDir(), "incoming");
        try {
            String type = resolver.getType(source);
            if (type != null && !type.startsWith("image/")) throw new IOException("Ese archivo no es una foto.");
            if (!dir.exists() && !dir.mkdirs()) throw new IOException("No se pudo preparar la carpeta temporal.");
            File[] previous = dir.listFiles();
            if (previous != null) for (File f : previous) f.delete();
            /* Sin extensión, el servidor local de la WebView responde con index.html */
            String extension = type == null ? null : MimeTypeMap.getSingleton().getExtensionFromMimeType(type);
            File dest = new File(dir, "foto-" + System.currentTimeMillis() + "." + (extension == null ? "jpg" : extension));
            long total = 0;
            try (InputStream in = resolver.openInputStream(source); OutputStream os = new FileOutputStream(dest)) {
                if (in == null) throw new IOException("Android no permitió leer la foto.");
                byte[] buffer = new byte[256 * 1024];
                int n;
                while ((n = in.read(buffer)) > 0) {
                    total += n;
                    if (total > MAX_INCOMING) throw new IOException("La foto pesa demasiado.");
                    os.write(buffer, 0, n);
                }
            } catch (IOException | RuntimeException e) {
                dest.delete();
                throw e;
            }
            JSObject data = new JSObject();
            data.put("path", Uri.fromFile(dest).toString());
            data.put("name", incomingName(resolver, source));
            data.put("mime", type == null ? "image/jpeg" : type);
            notifyListeners("sharedImage", data, true);
            Log.i(TAG, "Foto copiada: " + total + " bytes");
        } catch (IOException | RuntimeException e) {
            Log.e(TAG, "No se pudo leer la foto", e);
            notifyIncomingError("No se pudo abrir esa foto. " + e.getMessage());
        }
    }

    private String incomingName(ContentResolver resolver, Uri source) {
        try (Cursor c = resolver.query(source, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return sanitize(c.getString(0));
        } catch (RuntimeException e) {
            /* Algunas apps no informan el nombre */
        }
        return "foto.jpg";
    }

    private void notifyIncomingError(String message) {
        JSObject data = new JSObject();
        data.put("error", message);
        notifyListeners("sharedImage", data, true);
    }

    @PluginMethod
    public void note(PluginCall call) {
        Log.i(TAG, call.getString("text", ""));
        call.resolve();
    }

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

    /* Abre directo la app elegida. Si no está instalada, muestra la lista de apps. */
    @PluginMethod
    public void shareTo(PluginCall call) {
        try {
            closeOut();
            if (temp == null) throw new IOException("No hay nada que compartir.");
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", temp);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType(mime);
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            String pkg = call.getString("pkg", "");
            if (!pkg.isEmpty()) send.setPackage(pkg);
            JSObject result = new JSObject();
            try {
                getActivity().startActivity(send);
                result.put("opened", true);
            } catch (ActivityNotFoundException missing) {
                send.setPackage(null);
                getActivity().startActivity(Intent.createChooser(send, "Compartir foto"));
                result.put("opened", false);
            }
            call.resolve(result);
        } catch (IOException | IllegalArgumentException | ActivityNotFoundException e) {
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
