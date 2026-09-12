package com.pgpro.gatecbt;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * GATE-CBT offline exam simulator — thin WebView wrapper around the bundled web app.
 *
 * The whole exam app lives in assets/ and runs 100% offline:
 *   - JavaScript + DOM storage enabled (localStorage = attempt history)
 *   - All navigation stays inside the WebView (WebViewClient)
 *   - Hardware back button is delegated to JS (go back a screen, else exit)
 *   - CBTBridge keeps the screen awake while the exam screen is active
 */
public class MainActivity extends Activity {

    private WebView web;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window w = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            w.setStatusBarColor(Color.parseColor("#0f172a"));
            w.setNavigationBarColor(Color.parseColor("#0f172a"));
        }

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);              // attempt history survives restart
        s.setAllowFileAccess(true);                // load file:///android_asset/index.html
        s.setAllowContentAccess(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setBuiltInZoomControls(false);
        s.setSupportZoom(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(false);
        s.setTextZoom(100);

        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient());
        web.addJavascriptInterface(new CBTBridge(), "CBTBridge");
        web.loadUrl("file:///android_asset/index.html");

        setContentView(web);
        web.requestFocus();
    }

    @Override
    public void onBackPressed() {
        // Ask JS first: if CBTBack() handled it (returned true) stay in the app,
        // otherwise the user is on the home screen -> exit.
        web.evaluateJavascript(
                "(function(){ try { var r = window.CBTBack; " +
                "return (typeof r === 'function' && r() === true) ? '1' : '0'; } catch (e) { return '0'; } })()",
                new ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if (value == null || !value.contains("1")) {
                            finish();
                        }
                    }
                });
    }

    private final class CBTBridge {
        @JavascriptInterface
        public void finishApp() {
            runOnUiThread(MainActivity.this::finish);
        }

        @JavascriptInterface
        public void setKeepScreenOn(boolean keep) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (keep) {
                        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    } else {
                        getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                    }
                }
            });
        }
    }
}