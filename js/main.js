/* KLIPIN — main.js
   Handles: link input, paste button, download request, safe result rendering. */

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("downloader-form");
    if (!form) return;

    var input = document.getElementById("media-url");
    var pasteBtn = document.getElementById("paste-btn");
    var submitBtn = document.getElementById("process-btn");
    var progressWrap = document.getElementById("progress-wrap");
    var progressFill = document.getElementById("progress-fill");
    var resultPanel = document.getElementById("result-panel");
    var resultBody = document.getElementById("result-body");
    var dialogOverlay = document.getElementById("error-dialog");
    var dialogCloseBtn = document.getElementById("error-dialog-close");
    var dialogMsg = document.getElementById("error-dialog-msg");

    var busy = false;

    /* ------------- helpers ------------- */
    function isLikelyUrl(v) {
      try {
        var u = new URL(v.trim());
        return u.protocol === "http:" || u.protocol === "https:";
      } catch (e) {
        return false;
      }
    }

    function el(tag, className, text) {
      var n = document.createElement(tag);
      if (className) n.className = className;
      if (text !== undefined && text !== null) n.textContent = text;
      return n;
    }

    function showDialog(message) {
      if (dialogMsg) dialogMsg.textContent = message;
      if (dialogOverlay) dialogOverlay.classList.add("open");
    }
    function hideDialog() {
      if (dialogOverlay) dialogOverlay.classList.remove("open");
    }
    if (dialogCloseBtn) dialogCloseBtn.addEventListener("click", hideDialog);
    if (dialogOverlay) {
      dialogOverlay.addEventListener("click", function (e) {
        if (e.target === dialogOverlay) hideDialog();
      });
    }

    function setBusy(state) {
      busy = state;
      submitBtn.disabled = state;
      submitBtn.textContent = state ? "MEMPROSES..." : "PROSES SEKARANG \u2193";
      if (state) {
        progressWrap.classList.add("show");
        progressFill.style.width = "8%";
        window.requestAnimationFrame(function () {
          progressFill.style.width = "70%";
        });
      } else {
        progressFill.style.width = "100%";
        window.setTimeout(function () {
          progressWrap.classList.remove("show");
          progressFill.style.width = "0%";
        }, 350);
      }
    }

    /* ------------- paste button ------------- */
    if (pasteBtn) {
      pasteBtn.addEventListener("click", function () {
        if (navigator.clipboard && navigator.clipboard.readText) {
          navigator.clipboard
            .readText()
            .then(function (text) {
              if (text) {
                input.value = text.trim();
                input.focus();
              }
            })
            .catch(function () {
              input.focus();
              showDialog("BROWSER MEMBLOKIR AKSES CLIPBOARD. SILAKAN TEMPEL MANUAL DENGAN LONG-PRESS ATAU CTRL+V.");
            });
        } else {
          input.focus();
          showDialog("CLIPBOARD TIDAK DIDUKUNG DI BROWSER INI. SILAKAN TEMPEL MANUAL.");
        }
      });
    }

    /* ------------- result rendering ------------- */
    function clearResult() {
      resultBody.innerHTML = "";
      resultPanel.classList.remove("show", "reveal");
    }

    function renderMediaList(medias) {
      var list = el("div", "media-list");
      medias.forEach(function (m) {
        if (!m || !m.url) return;
        var item = el("div", "media-item");
        var info = el("div", "media-info");
        info.appendChild(el("span", "media-kind", (m.type || "MEDIA").toUpperCase()));
        if (m.label) info.appendChild(el("span", "media-sub", String(m.label).toUpperCase()));
        item.appendChild(info);

        var a = document.createElement("a");
        a.href = m.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "mc-btn primary";
        a.textContent = "UNDUH MEDIA \u2193";
        a.setAttribute("download", "");
        item.appendChild(a);

        list.appendChild(item);
      });
      return list;
    }

    function renderPhotoGrid(photos) {
      var grid = el("div", "photo-grid");
      photos.forEach(function (p) {
        var url = typeof p === "string" ? p : p && p.url;
        if (!url) return;
        var img = document.createElement("img");
        img.loading = "lazy";
        img.src = url;
        img.alt = "Media preview";
        grid.appendChild(img);
      });
      return grid;
    }

    function renderResult(data) {
      clearResult();

      var head = el("div", "result-head");
      if (data.thumbnail) {
        var thumb = document.createElement("img");
        thumb.className = "result-thumb";
        thumb.src = data.thumbnail;
        thumb.alt = "Thumbnail";
        thumb.loading = "lazy";
        head.appendChild(thumb);
      }
      var meta = el("div", "result-meta");
      if (data.title) {
        meta.appendChild(el("h3", null, data.title));
      }
      if (data.platform) {
        meta.appendChild(el("div", "meta-line", "PLATFORM :: " + data.platform.toUpperCase()));
      }
      if (data.author) {
        meta.appendChild(el("div", "meta-line", "AUTHOR :: " + data.author));
      }
      head.appendChild(meta);
      resultBody.appendChild(head);

      if (Array.isArray(data.photos) && data.photos.length) {
        resultBody.appendChild(renderPhotoGrid(data.photos));
      }

      if (Array.isArray(data.medias) && data.medias.length) {
        resultBody.appendChild(renderMediaList(data.medias));
      } else if (!Array.isArray(data.photos) || !data.photos.length) {
        resultBody.appendChild(el("p", null, "TIDAK ADA MEDIA YANG DAPAT DIUNDUH DARI TAUTAN INI."));
      }

      resultPanel.classList.add("show");
      window.requestAnimationFrame(function () {
        resultPanel.classList.add("reveal");
        resultPanel.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    }

    /* ------------- submit ------------- */
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (busy) return;

      var url = input.value.trim();
      if (!url) {
        showDialog("MASUKKAN TAUTAN TERLEBIH DAHULU.");
        return;
      }
      if (!isLikelyUrl(url)) {
        showDialog("TAUTAN TIDAK VALID. PASTIKAN DIAWALI DENGAN HTTP:// ATAU HTTPS://.");
        return;
      }

      setBusy(true);
      clearResult();

      fetch("/api/download?url=" + encodeURIComponent(url), {
        method: "GET",
        headers: { Accept: "application/json" }
      })
        .then(function (res) {
          return res
            .json()
            .catch(function () {
              throw new Error("RESPON SERVER TIDAK VALID.");
            })
            .then(function (body) {
              if (!res.ok || !body || body.ok === false) {
                var msg = (body && body.message) || "TAUTAN TIDAK DAPAT DIPROSES.";
                throw new Error(msg);
              }
              return body;
            });
        })
        .then(function (body) {
          renderResult(body.data || body);
        })
        .catch(function (err) {
          showDialog(
            (err && err.message ? err.message.toUpperCase() : "TAUTAN TIDAK DAPAT DIPROSES.") +
              "\nCOBA PERIKSA KEMBALI TAUTANMU."
          );
        })
        .finally(function () {
          setBusy(false);
        });
    });
  });
})();
