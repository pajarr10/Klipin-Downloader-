/* KLIPIN — pwa.js
   Service worker registration + custom install toast (Minecraft style). */

(function () {
  "use strict";

  var DISMISS_KEY = "klipin_pwa_dismissed_at";
  var DISMISS_COOLDOWN_MS = 1000 * 60 * 60 * 24; // 24h

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {
        /* silently ignore registration failure */
      });
    });
  }

  var deferredPrompt = null;

  function wasRecentlyDismissed() {
    try {
      var t = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
      return Date.now() - t < DISMISS_COOLDOWN_MS;
    } catch (e) {
      return false;
    }
  }

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (wasRecentlyDismissed()) return;

    document.addEventListener("DOMContentLoaded", showToast);
    if (document.readyState !== "loading") showToast();
  });

  function showToast() {
    var toast = document.getElementById("install-toast");
    if (!toast || !deferredPrompt) return;
    window.setTimeout(function () {
      toast.classList.add("show");
    }, 600);

    var installBtn = document.getElementById("install-toast-btn");
    var closeBtn = document.getElementById("install-toast-close");

    if (installBtn) {
      installBtn.addEventListener("click", function () {
        toast.classList.remove("show");
        if (!deferredPrompt) return;
        deferredPrompt.prompt();
        deferredPrompt.userChoice.finally(function () {
          deferredPrompt = null;
        });
      });
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", function () {
        toast.classList.remove("show");
        try {
          localStorage.setItem(DISMISS_KEY, String(Date.now()));
        } catch (e) {}
      });
    }
  }

  window.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    var toast = document.getElementById("install-toast");
    if (toast) toast.classList.remove("show");
  });
})();
