/* GATE-CBT · Android WebView glue — injected ONLY into the APK asset copy.
   Not needed when served as a webpage; harmless if included. */
(function () {
  "use strict";

  var BRIDGE = "CBTBridge";

  function activeScreen() {
    var el = document.querySelector(".screen.active");
    return el ? el.id : "";
  }

  /* Hardware back button: consumed while inside the app, false = exit. */
  window.CBTBack = function () {
    var scr = activeScreen();
    if (scr && scr !== "screen-home") {
      if (window.__cbt && typeof window.__cbt.goHome === "function") {
        window.__cbt.goHome();
        return true;
      }
    }
    return false;
  };

  /* Keep the screen awake exactly while the exam screen is active. */
  function syncKeepScreenOn() {
    var b = window[BRIDGE];
    if (b && typeof b.setKeepScreenOn === "function") {
      try { b.setKeepScreenOn(activeScreen() === "screen-exam"); } catch (e) { }
    }
  }
  if (window[BRIDGE]) {
    new MutationObserver(syncKeepScreenOn).observe(document.body, {
      subtree: true, childList: true, attributes: true, attributeFilter: ["class"]
    });
    syncKeepScreenOn();
  }

  /* Block pinch/double-tap zoom inside the exam UI. */
  document.addEventListener("touchstart", function (e) {
    if (e.touches.length > 1) e.preventDefault();
  }, { passive: false });
})();