/* KLIPIN — main.js
   Handles: link input, paste button, download request, safe result rendering.
   Matches API contract:
   { status, platform, title, thumbnail, author:{username,name,avatar}, media:[{type,quality,size,url}], statistics:{...}, duration:... }
   On failure: { status:false, message } */

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

    function hasText(v) {
      return typeof v === "string" && v.trim().length > 0;
    }

    function el(tag, className, text) {
      var n = document.createElement(tag);
      if (className) n.className = className;
      if (hasText(text)) n.textContent = text;
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

    function showEmptyState() {
      resultBody.appendChild(el("p", "empty-state", "TIDAK ADA MEDIA YANG DAPAT DIUNDUH DARI TAUTAN INI."));
    }

    function typeLabel(type) {
      var t = (type || "").toLowerCase();
      if (t.indexOf("audio") !== -1) return "AUDIO";
      if (t.indexOf("photo") !== -1 || t.indexOf("image") !== -1) return "FOTO";
      if (t.indexOf("video") !== -1) return "VIDEO";
      return hasText(type) ? type.toUpperCase() : "MEDIA";
    }

    function formatDuration(ms) {
      if (!ms || typeof ms !== "number") return null;
      var totalSeconds = Math.floor(ms / 1000);
      var hours = Math.floor(totalSeconds / 3600);
      var minutes = Math.floor((totalSeconds % 3600) / 60);
      var seconds = totalSeconds % 60;

      if (hours > 0) {
        return hours + ":" + String(minutes).padStart(2, "0") + ":" + String(seconds).padStart(2, "0");
      }
      return minutes + ":" + String(seconds).padStart(2, "0");
    }

    function formatNumber(n) {
      if (n === null || n === undefined) return null;
      n = Number(n);
      if (!isFinite(n)) return null;
      return n.toLocaleString("id-ID");
    }

    function renderMediaList(media) {
      var list = el("div", "media-list");
      media.forEach(function (m) {
        if (!m || !hasText(m.url)) return;

        var item = el("div", "media-item");
        var info = el("div", "media-info");

        info.appendChild(el("span", "media-kind", typeLabel(m.type)));

        var subParts = [];
        if (hasText(m.quality)) subParts.push(m.quality);
        if (hasText(m.size)) subParts.push(m.size);
        if (m.width && m.height) subParts.push(m.width + "x" + m.height);
        if (subParts.length) {
          info.appendChild(el("span", "media-sub", subParts.join(" \u00b7 ")));
        }

        item.appendChild(info);

        var a = document.createElement("a");
        a.href = m.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.className = "mc-btn primary";
        a.textContent = "UNDUH \u2193";
        a.setAttribute("download", "");
        item.appendChild(a);

        list.appendChild(item);
      });
      return list;
    }

    function renderAuthor(author) {
      if (!author || typeof author !== "object") return null;
      var name = hasText(author.name) ? author.name : null;
      var username = hasText(author.username) ? author.username : null;
      if (!name && !username) return null;

      var row = el("div", "author-row");
      if (hasText(author.avatar)) {
        var avatar = document.createElement("img");
        avatar.className = "author-avatar";
        avatar.src = author.avatar;
        avatar.alt = "Author avatar";
        avatar.loading = "lazy";
        avatar.onerror = function () {
          avatar.style.display = "none";
        };
        row.appendChild(avatar);
      }
      var textWrap = el("div", "author-text");
      if (name) textWrap.appendChild(el("div", "author-name", name));
      if (username) textWrap.appendChild(el("div", "author-username", "@" + username.replace(/^@/, "")));
      row.appendChild(textWrap);
      return row;
    }

    function renderStatistics(stats) {
      if (!stats || typeof stats !== "object") return null;

      var hasAnyStats = false;
      for (var key in stats) {
        if (stats.hasOwnProperty(key) && stats[key] !== null) {
          hasAnyStats = true;
          break;
        }
      }

      if (!hasAnyStats) return null;

      var statsMap = {
        views: "Ditonton",
        likes: "Disukai",
        comments: "Komentar",
        shares: "Dibagikan",
        downloads: "Diunduh",
        favorites: "Disimpan"
      };

      var container = el("div", "statistics-row");
      for (var statKey in statsMap) {
        if (statsMap.hasOwnProperty(statKey)) {
          var value = stats[statKey];
          if (value !== null && value !== undefined) {
            var stat = el("div", "stat-item");
            stat.appendChild(el("span", "stat-value", formatNumber(value)));
            stat.appendChild(el("span", "stat-label", statsMap[statKey]));
            container.appendChild(stat);
          }
        }
      }

      return container;
    }

    function renderResult(data) {
      clearResult();

      var head = el("div", "result-head");

      if (hasText(data.thumbnail)) {
        var thumb = document.createElement("img");
        thumb.className = "result-thumb";
        thumb.src = data.thumbnail;
        thumb.alt = "Thumbnail";
        thumb.loading = "lazy";
        thumb.onerror = function () {
          thumb.remove();
        };
        head.appendChild(thumb);
      }

      var meta = el("div", "result-meta");
      if (hasText(data.title)) {
        meta.appendChild(el("h3", null, data.title));
      }
      if (hasText(data.platform)) {
        var platformLine = "PLATFORM :: " + data.platform.toUpperCase();
        if (data.duration) {
          var durationStr = formatDuration(data.duration);
          if (durationStr) platformLine += " \u00b7 " + durationStr;
        }
        meta.appendChild(el("div", "meta-line", platformLine));
      }
      var authorRow = renderAuthor(data.author);
      if (authorRow) meta.appendChild(authorRow);

      var statsRow = renderStatistics(data.statistics);
      if (statsRow) meta.appendChild(statsRow);

      head.appendChild(meta);
      resultBody.appendChild(head);

      var media = Array.isArray(data.media) ? data.media.filter(function (m) { return m && hasText(m.url); }) : [];
      if (media.length) {
        resultBody.appendChild(renderMediaList(media));
      } else {
        showEmptyState();
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
              if (!res.ok || !body || body.status === false) {
                var msg = (body && body.message) || "TAUTAN TIDAK DAPAT DIPROSES.";
                throw new Error(msg);
              }
              return body;
            });
        })
        .then(function (body) {
          renderResult(body);
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
