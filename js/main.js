/* =========================================================
   KLIPIN — main.js
   Intro loading screen, mobile navigation, and the core
   downloader flow (paste, submit, render results safely).
   ========================================================= */

(function () {
  "use strict";

  var INTRO_SESSION_KEY = "klipin_intro_shown";

  /* -------------------- Intro / loading screen -------------------- */
  function runIntro() {
    var screen = document.getElementById("loading-screen");
    if (!screen) return;

    var alreadyShown = false;
    try {
      alreadyShown = window.sessionStorage.getItem(INTRO_SESSION_KEY) === "1";
    } catch (err) {
      alreadyShown = false;
    }

    if (alreadyShown) {
      screen.classList.add("hidden");
      screen.style.display = "none";
      return;
    }

    var fill = screen.querySelector(".loading-bar-fill");
    var duration = 2000 + Math.random() * 500; // 2.0s - 2.5s
    var start = null;

    function step(timestamp) {
      if (start === null) start = timestamp;
      var elapsed = timestamp - start;
      var progress = Math.min(1, elapsed / duration);
      if (fill) fill.style.width = (progress * 100).toFixed(1) + "%";

      if (progress < 1) {
        window.requestAnimationFrame(step);
      } else {
        try {
          window.sessionStorage.setItem(INTRO_SESSION_KEY, "1");
        } catch (err) {
          /* ignore */
        }
        screen.classList.add("hidden");
        window.setTimeout(function () {
          screen.style.display = "none";
        }, 650);
      }
    }

    window.requestAnimationFrame(step);
  }

  /* -------------------- Mobile menu -------------------- */
  function initMobileMenu() {
    var toggle = document.getElementById("nav-toggle");
    var menu = document.getElementById("mobile-menu");
    if (!toggle || !menu) return;

    toggle.addEventListener("click", function () {
      menu.classList.add("open");
    });

    menu.addEventListener("click", function (evt) {
      if (evt.target === menu) {
        menu.classList.remove("open");
      }
    });

    menu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        menu.classList.remove("open");
      });
    });
  }

  /* -------------------- Downloader -------------------- */
  var PLATFORM_LABELS = {
    tiktok: "TIKTOK",
    youtube: "YOUTUBE",
    instagram: "INSTAGRAM",
    douyin: "DOUYIN",
    pinterest: "PINTEREST",
    facebook: "FACEBOOK",
    capcut: "CAPCUT",
    spotify: "SPOTIFY",
    unknown: "MEDIA",
  };

  function escapeForAttribute(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function isSafeMediaUrl(url) {
    try {
      var parsed = new URL(url, window.location.href);
      return parsed.protocol === "http:" || parsed.protocol === "https:";
    } catch (err) {
      return false;
    }
  }

  function clearNode(node) {
    while (node.firstChild) {
      node.removeChild(node.firstChild);
    }
  }

  function formatDuration(ms) {
    if (typeof ms !== "number" || ms <= 0) return null;
    var totalSeconds = Math.round(ms / 1000);
    var minutes = Math.floor(totalSeconds / 60);
    var seconds = totalSeconds % 60;
    return minutes + ":" + String(seconds).padStart(2, "0");
  }

  function renderResult(data) {
    var panel = document.getElementById("result-panel");
    if (!panel) return;

    panel.classList.remove("show");
    clearNode(panel);

    var label = document.createElement("div");
    label.className = "panel-label";
    label.textContent = "[ MEDIA DETECTED // READY ]";
    panel.appendChild(label);

    var header = document.createElement("div");
    header.className = "result-header";

    if (data.thumbnail && isSafeMediaUrl(data.thumbnail)) {
      var img = document.createElement("img");
      img.className = "result-thumb";
      img.src = data.thumbnail;
      img.alt = "";
      img.loading = "lazy";
      img.referrerPolicy = "no-referrer";
      header.appendChild(img);
    }

    var meta = document.createElement("div");
    meta.className = "result-meta";

    if (data.title) {
      var titleEl = document.createElement("div");
      titleEl.className = "result-title";
      titleEl.textContent = data.title; // textContent, never innerHTML
      meta.appendChild(titleEl);
    }

    var subParts = [];
    subParts.push(PLATFORM_LABELS[data.platform] || PLATFORM_LABELS.unknown);
    if (data.author) subParts.push(data.author);
    var durationLabel = formatDuration(data.duration);
    if (durationLabel) subParts.push(durationLabel);

    var subEl = document.createElement("div");
    subEl.className = "result-sub";
    subEl.textContent = subParts.join(" // ");
    meta.appendChild(subEl);

    header.appendChild(meta);
    panel.appendChild(header);

    var listWrap = document.createElement("div");
    listWrap.className = "media-list";

    var photoMedias = data.medias.filter(function (m) {
      return m.type === "image" || m.type === "photo";
    });
    var otherMedias = data.medias.filter(function (m) {
      return m.type !== "image" && m.type !== "photo";
    });

    otherMedias.forEach(function (media, idx) {
      if (!media.url || !isSafeMediaUrl(media.url)) return;

      var item = document.createElement("div");
      item.className = "media-item";

      var info = document.createElement("div");
      info.className = "media-item-info";

      var tag = document.createElement("div");
      tag.className = "media-tag";
      tag.textContent = (media.type || "MEDIA").toString().toUpperCase();
      info.appendChild(tag);

      var quality = document.createElement("div");
      quality.className = "media-quality";
      var qualityParts = [];
      if (media.quality) qualityParts.push(String(media.quality).toUpperCase());
      if (media.extension) qualityParts.push(String(media.extension).toUpperCase());
      quality.textContent = qualityParts.join(" / ") || "ORIGINAL";
      info.appendChild(quality);

      item.appendChild(info);

      var downloadLink = document.createElement("a");
      downloadLink.className = "pixel-btn primary";
      downloadLink.href = media.url;
      downloadLink.target = "_blank";
      downloadLink.rel = "noopener noreferrer";
      downloadLink.textContent = "UNDUH MEDIA \u2193";
      item.appendChild(downloadLink);

      listWrap.appendChild(item);
    });

    panel.appendChild(listWrap);

    if (photoMedias.length > 0) {
      var photoLabel = document.createElement("div");
      photoLabel.className = "panel-label";
      photoLabel.style.marginTop = "18px";
      photoLabel.textContent = "[ SLIDESHOW // " + String(photoMedias.length).padStart(3, "0") + " ]";
      panel.appendChild(photoLabel);

      var grid = document.createElement("div");
      grid.className = "photo-grid";

      photoMedias.forEach(function (media) {
        if (!media.url || !isSafeMediaUrl(media.url)) return;
        var a = document.createElement("a");
        a.href = media.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";

        var img = document.createElement("img");
        img.src = media.url;
        img.alt = "";
        img.loading = "lazy";
        img.referrerPolicy = "no-referrer";
        a.appendChild(img);
        grid.appendChild(a);
      });

      panel.appendChild(grid);
    }

    panel.classList.add("show");

    window.requestAnimationFrame(function () {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  function showErrorDialog(message) {
    var overlay = document.getElementById("error-dialog");
    var messageEl = document.getElementById("error-dialog-message");
    if (!overlay) return;
    if (messageEl) messageEl.textContent = message;
    overlay.classList.add("show");
  }

  function hideErrorDialog() {
    var overlay = document.getElementById("error-dialog");
    if (overlay) overlay.classList.remove("show");
  }

  function setButtonState(button, state) {
    if (!button) return;
    if (state === "loading") {
      button.dataset.originalText = button.dataset.originalText || button.textContent;
      button.textContent = "MEMPROSES...";
      button.disabled = true;
    } else {
      button.textContent = button.dataset.originalText || "PROSES SEKARANG \u2193";
      button.disabled = false;
    }
  }

  function animateProgress(track, targetPercent, durationMs) {
    return new Promise(function (resolve) {
      var start = null;
      var startPercent = parseFloat(track.style.width) || 0;

      function step(timestamp) {
        if (start === null) start = timestamp;
        var elapsed = timestamp - start;
        var t = Math.min(1, elapsed / durationMs);
        var current = startPercent + (targetPercent - startPercent) * t;
        track.style.width = current.toFixed(1) + "%";
        if (t < 1) {
          window.requestAnimationFrame(step);
        } else {
          resolve();
        }
      }
      window.requestAnimationFrame(step);
    });
  }

  function initDownloader() {
    var form = document.getElementById("downloader-form");
    if (!form) return;

    var input = document.getElementById("media-url-input");
    var pasteBtn = document.getElementById("paste-btn");
    var submitBtn = document.getElementById("submit-btn");
    var progressWrap = document.getElementById("progress-wrap");
    var progressFill = document.getElementById("progress-fill");
    var resultPanel = document.getElementById("result-panel");
    var errorCloseBtn = document.getElementById("error-dialog-close");

    if (errorCloseBtn) {
      errorCloseBtn.addEventListener("click", hideErrorDialog);
    }

    if (pasteBtn && input) {
      pasteBtn.addEventListener("click", async function () {
        try {
          if (navigator.clipboard && navigator.clipboard.readText) {
            var text = await navigator.clipboard.readText();
            input.value = text.trim();
            input.focus();
          } else {
            input.focus();
            document.execCommand("paste");
          }
        } catch (err) {
          input.focus();
        }
      });
    }

    form.addEventListener("submit", async function (evt) {
      evt.preventDefault();

      var rawUrl = (input.value || "").trim();
      if (!rawUrl) {
        showErrorDialog("MASUKKAN TAUTAN TERLEBIH DAHULU.");
        return;
      }

      var validProtocol = false;
      try {
        var parsed = new URL(rawUrl);
        validProtocol = parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch (err) {
        validProtocol = false;
      }

      if (!validProtocol) {
        showErrorDialog("TAUTAN TIDAK VALID. GUNAKAN LINK HTTP ATAU HTTPS.");
        return;
      }

      setButtonState(submitBtn, "loading");
      if (resultPanel) resultPanel.classList.remove("show");
      if (progressWrap) {
        progressWrap.classList.add("active");
        progressFill.style.width = "0%";
      }

      var progressPromise = progressFill
        ? animateProgress(progressFill, 85, 900)
        : Promise.resolve();

      try {
        var response = await fetch(
          "/api/download?url=" + encodeURIComponent(rawUrl),
          { method: "GET", headers: { Accept: "application/json" } }
        );

        var data = await response.json();

        await progressPromise;
        if (progressFill) {
          await animateProgress(progressFill, 100, 200);
        }

        if (!response.ok || !data || data.success !== true) {
          if (progressWrap) progressWrap.classList.remove("active");
          setButtonState(submitBtn, "idle");
          showErrorDialog(
            (data && data.message) ||
              "TAUTAN TIDAK DAPAT DIPROSES. COBA PERIKSA KEMBALI TAUTANMU."
          );
          return;
        }

        renderResult(data);
      } catch (err) {
        await progressPromise;
        showErrorDialog("TERJADI KESALAHAN JARINGAN. COBA LAGI.");
      } finally {
        if (progressWrap) {
          window.setTimeout(function () {
            progressWrap.classList.remove("active");
          }, 400);
        }
        setButtonState(submitBtn, "idle");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    initMobileMenu();
    initDownloader();
  });

  runIntro();
})();
