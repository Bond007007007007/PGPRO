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

import com.google.android.gms.ads.AdRequest;
import com.google.android.gms.ads.FullScreenContentCallback;
import com.google.android.gms.ads.MobileAds;
import com.google.android.gms.ads.OnUserEarnedRewardListener;
import com.google.android.gms.ads.rewarded.RewardedAd;
import com.google.android.gms.ads.rewarded.RewardedAdLoadCallback;

/**
 * GATE-CBT offline exam simulator — thin WebView wrapper around the bundled web app.
 *
 * The whole exam app lives in assets/ and runs 100% offline:
 *   - JavaScript + DOM storage enabled (localStorage = attempt history)
 *   - All navigation stays inside the WebView (WebViewClient)
 *   - Hardware back button is delegated to JS (go back a screen, else exit)
 *   - CBTBridge keeps the screen awake while the exam screen is active
 *
 * AdMob rewarded ads use TEST IDs. Two real-ID swap points:
 *   1) APPLICATION_ID meta-data in AndroidManifest.xml
 *   2) REWARDED_AD_UNIT_ID below
 */
public class MainActivity extends Activity {

    private WebView web;
    private RewardedAd rewardedAd;

    private static final String REWARDED_AD_UNIT_ID = "ca-app-pub-3940256099942544/5224354917";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        MobileAds.initialize(this, unused -> loadRewardedAd());

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

    private void loadRewardedAd() {
        if (rewardedAd != null) {
            return; // guard against double-load while an ad is already held
        }
        RewardedAd.load(this, REWARDED_AD_UNIT_ID, new AdRequest.Builder().build(),
                new RewardedAdLoadCallback() {
                    @Override
                    public void onAdLoaded(RewardedAd ad) {
                        rewardedAd = ad;
                    }
                });
    }

    private void jsResult(boolean ok) {
        web.evaluateJavascript(
                "window.CBTAds && typeof window.CBTAds._onResult === 'function' && window.CBTAds._onResult(" + ok + ")",
                null);
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

        @JavascriptInterface
        public void showRewardedAd() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (rewardedAd == null) {
                        jsResult(false);
                        return;
                    }
                    final boolean[] settled = {false}; // per-show: callback EXACTLY once
                    rewardedAd.setFullScreenContentCallback(new FullScreenContentCallback() {
                        @Override
                        public void onAdShowedFullScreenContent() {
                            rewardedAd = null;
                        }

                        @Override
                        public void onAdDismissedFullScreenContent() {
                            if (!settled[0]) {
                                settled[0] = true;
                                jsResult(false);
                            }
                            loadRewardedAd();
                        }

                        @Override
                        public void onAdFailedToShowFullScreenContent(com.google.android.gms.ads.AdError adError) {
                            if (!settled[0]) {
                                settled[0] = true;
                                jsResult(false);
                            }
                            rewardedAd = null;
                            loadRewardedAd();
                        }
                    });
                    rewardedAd.show(MainActivity.this, (OnUserEarnedRewardListener) rewardItem -> {
                        if (!settled[0]) {
                            settled[0] = true;
                            jsResult(true);
                        }
                    });
                }
            });
        }
    }
}