/* =========================================================
   KLIPIN — pwa.js
   Registers the service worker and manages the custom
   Minecraft-styled install toast (beforeinstallprompt).
   ========================================================= */

(function () {
  "use strict";

  var DISMISS_KEY = "klipin_pwa_dismissed_at";
  var DISMISS_COOLDOWN_MS = 1000 * 60 * 60 * 24; // 24h before asking again
  var deferredPrompt = null;

  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", function () {
        navigator.serviceWorker.register("/sw.js").catch(function () {
          /* silent fail, PWA is a progressive enhancement */
        });
      });
    }
  }

  function wasRecentlyDismissed() {
    try {
      var raw = window.localStorage.getItem(DISMISS_KEY);
      if (!raw) return false;
      var dismissedAt = parseInt(raw, 10);
      if (isNaN(dismissedAt)) return false;
      return Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
    } catch (err) {
      return false;
    }
  }

  function markDismissed() {
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch (err) {
      /* ignore */
    }
  }

  function showToast() {
    var toast = document.getElementById("pwa-toast");
    if (!toast || wasRecentlyDismissed()) return;
    toast.classList.add("show");
  }

  function hideToast() {
    var toast = document.getElementById("pwa-toast");
    if (!toast) return;
    toast.classList.remove("show");
  }

  function initInstallFlow() {
    window.addEventListener("beforeinstallprompt", function (event) {
      event.preventDefault();
      deferredPrompt = event;
      showToast();
    });

    document.addEventListener("DOMContentLoaded", function () {
      var installBtn = document.getElementById("pwa-install-btn");
      var dismissBtn = document.getElementById("pwa-dismiss-btn");

      if (installBtn) {
        installBtn.addEventListener("click", function () {
          hideToast();
          if (!deferredPrompt) return;
          deferredPrompt.prompt();
          deferredPrompt.userChoice.finally(function () {
            deferredPrompt = null;
          });
        });
      }

      if (dismissBtn) {
        dismissBtn.addEventListener("click", function () {
          hideToast();
          markDismissed();
        });
      }
    });

    window.addEventListener("appinstalled", function () {
      hideToast();
      deferredPrompt = null;
    });
  }

  registerServiceWorker();
  initInstallFlow();
})();
