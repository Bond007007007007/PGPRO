package com.pgpro.gatecbt.host;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.Locale;

import fi.iki.elonen.NanoHTTPD;

/**
 * GATE-CBT Web — localhost server edition.
 *
 * On launch this activity starts a NanoHTTPD server bound to 127.0.0.1 (loopback
 * ONLY — never exposed to the LAN) serving the bundled GATE-CBT web app straight
 * from assets/, then opens the device's default browser at http://127.0.0.1:PORT/.
 *
 * No WebView, no ads, no bridge JavaScript — the pure web build of the app is
 * served byte-for-byte. Closing the activity stops the server.
 */
public class WebServerActivity extends Activity {

    private static final int FIRST_PORT = 8080;
    private static final int LAST_PORT = 8099;

    private AssetServer server;
    private int port = -1;
    private TextView urlText;

    /* ------------------------------ lifecycle ------------------------------ */

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.LOLLIPOP) {
            getWindow().setStatusBarColor(Color.parseColor("#0f172a"));
            getWindow().setNavigationBarColor(Color.parseColor("#0f172a"));
        }
        setContentView(buildUi());
        startServer();
        // Give the server a moment to accept connections, then open the browser.
        new Handler(Looper.getMainLooper()).postDelayed(this::openBrowser, 400);
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        stopServer();
    }

    @Override
    public void onBackPressed() {
        stopServer();
        finish();
    }

    /* ------------------------------ server ------------------------------ */

    private void startServer() {
        for (int p = FIRST_PORT; p <= LAST_PORT; p++) {
            try {
                AssetServer s = new AssetServer("127.0.0.1", p, getAssets());
                s.start(NanoHTTPD.SOCKET_READ_TIMEOUT, false);
                server = s;
                port = p;
                break;
            } catch (IOException ignored) {
                server = null;
            }
        }
        if (server == null) {
            urlText.setText("Could not start server on ports " + FIRST_PORT + "-" + LAST_PORT);
        } else {
            urlText.setText("http://127.0.0.1:" + port + "/");
        }
    }

    private void stopServer() {
        if (server != null) {
            server.stop();
            server = null;
        }
    }

    private void openBrowser() {
        if (server == null || port < 0) {
            Toast.makeText(this, "Server is not running", Toast.LENGTH_LONG).show();
            return;
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("http://127.0.0.1:" + port + "/")));
        } catch (ActivityNotFoundException e) {
            Toast.makeText(this, "No browser found — open http://127.0.0.1:" + port + "/", Toast.LENGTH_LONG).show();
        }
    }

    /* ------------------------------ UI ------------------------------ */

    private View buildUi() {
        int pad = dp(24);
        LinearLayout root = new LinearLayout(this);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundColor(Color.parseColor("#0f172a"));
        root.setPadding(pad, dp(56), pad, pad);

        TextView title = new TextView(this);
        title.setText("GATE-CBT Web");
        title.setTextColor(Color.WHITE);
        title.setTextSize(24);

        TextView sub = new TextView(this);
        sub.setText("Local server running — open the interface in your browser.");
        sub.setTextColor(Color.parseColor("#94a3b8"));
        sub.setTextSize(14);
        sub.setPadding(0, dp(8), 0, dp(16));

        urlText = new TextView(this);
        urlText.setTextColor(Color.parseColor("#38bdf8"));
        urlText.setTextSize(18);
        urlText.setPadding(0, 0, 0, dp(24));

        Button openBtn = new Button(this);
        openBtn.setText("Open in Browser");
        openBtn.setOnClickListener(v -> openBrowser());

        Button stopBtn = new Button(this);
        stopBtn.setText("Stop server");
        stopBtn.setOnClickListener(v -> {
            stopServer();
            finish();
        });

        root.addView(title);
        root.addView(sub);
        root.addView(urlText);
        root.addView(openBtn, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        root.addView(stopBtn, new LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT));
        return root;
    }

    private int dp(int v) {
        return Math.round(v * getResources().getDisplayMetrics().density);
    }

    /* ------------------------------ HTTP server ------------------------------ */

    private static final class AssetServer extends NanoHTTPD {

        private final AssetManager assets;

        AssetServer(String hostname, int port, AssetManager assets) {
            super(hostname, port);
            this.assets = assets;
        }

        @Override
        public Response serve(IHTTPSession session) {
            String path = session.getUri();
            if (path == null) {
                path = "/";
            }
            int q = path.indexOf('?');
            if (q >= 0) {
                path = path.substring(0, q);
            }
            if (path.endsWith("/")) {
                path += "index.html";
            }
            if (path.startsWith("/")) {
                path = path.substring(1);
            }
            if (path.isEmpty()) {
                path = "index.html";
            }
            // Path traversal / sloppy paths -> 404, never serve outside assets.
            if (path.contains("..") || path.contains("//")) {
                return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "not found");
            }
            try {
                InputStream in = assets.open(path);
                byte[] body = readAll(in);
                in.close();
                return newFixedLengthResponse(Response.Status.OK, mimeFor(path),
                        new ByteArrayInputStream(body), body.length);
            } catch (IOException e) {
                return newFixedLengthResponse(Response.Status.NOT_FOUND, MIME_PLAINTEXT, "not found");
            }
        }

        private static byte[] readAll(InputStream in) throws IOException {
            ByteArrayOutputStream out = new ByteArrayOutputStream(65536);
            byte[] buf = new byte[32768];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
            }
            return out.toByteArray();
        }

        private static String mimeFor(String path) {
            String p = path.toLowerCase(Locale.US);
            if (p.endsWith(".html") || p.endsWith(".htm")) return "text/html; charset=utf-8";
            if (p.endsWith(".css")) return "text/css; charset=utf-8";
            if (p.endsWith(".js")) return "application/javascript; charset=utf-8";
            if (p.endsWith(".json")) return "application/json; charset=utf-8";
            if (p.endsWith(".svg")) return "image/svg+xml";
            if (p.endsWith(".png")) return "image/png";
            if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
            if (p.endsWith(".gif")) return "image/gif";
            if (p.endsWith(".woff2")) return "font/woff2";
            if (p.endsWith(".woff")) return "font/woff";
            if (p.endsWith(".ttf")) return "font/ttf";
            if (p.endsWith(".otf")) return "font/otf";
            if (p.endsWith(".mp3")) return "audio/mpeg";
            String m = getMimeTypeForFile(path);
            return m != null ? m : "application/octet-stream";
        }
    }
}