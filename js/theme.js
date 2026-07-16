/* =========================================================
   KLIPIN — theme.js
   Handles theme selection, persistence (localStorage), and the
   fullscreen OPTIONS / THEME SETTINGS panel.
   ========================================================= */

(function () {
  "use strict";

  var STORAGE_KEY = "klipin_theme";
  var DEFAULT_THEME = "abu-abu";

  var THEMES = [
    { id: "abu-abu", label: "MINECRAFT ABU-ABU" },
    { id: "hitam", label: "MINECRAFT HITAM" },
    { id: "putih", label: "MINECRAFT PUTIH" },
    { id: "merah", label: "MINECRAFT MERAH" },
    { id: "hijau", label: "MINECRAFT HIJAU" },
    { id: "cokelat", label: "MINECRAFT COKELAT" },
  ];

  function applyTheme(themeId) {
    if (themeId === "abu-abu") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", themeId);
    }
  }

  function getStoredTheme() {
    try {
      return window.localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
    } catch (err) {
      return DEFAULT_THEME;
    }
  }

  function setStoredTheme(themeId) {
    try {
      window.localStorage.setItem(STORAGE_KEY, themeId);
    } catch (err) {
      /* localStorage unavailable, theme just won't persist */
    }
  }

  function buildOptionsPanel() {
    var overlay = document.getElementById("options-overlay");
    if (!overlay) return;

    var grid = overlay.querySelector(".theme-grid");
    if (!grid) return;

    grid.innerHTML = "";

    var current = getStoredTheme();

    THEMES.forEach(function (theme) {
      var el = document.createElement("div");
      el.className = "theme-option panel";
      el.textContent = theme.label;
      el.dataset.themeId = theme.id;
      if (theme.id === current) {
        el.classList.add("active");
      }
      el.addEventListener("click", function () {
        applyTheme(theme.id);
        setStoredTheme(theme.id);
        grid.querySelectorAll(".theme-option").forEach(function (node) {
          node.classList.remove("active");
        });
        el.classList.add("active");
      });
      grid.appendChild(el);
    });
  }

  function initThemeMenu() {
    var overlay = document.getElementById("options-overlay");
    var openBtn = document.getElementById("theme-open-btn");
    var closeBtn = document.getElementById("options-close-btn");

    if (openBtn && overlay) {
      openBtn.addEventListener("click", function () {
        buildOptionsPanel();
        overlay.classList.add("show");
      });
    }

    if (closeBtn && overlay) {
      closeBtn.addEventListener("click", function () {
        overlay.classList.remove("show");
      });
    }

    if (overlay) {
      overlay.addEventListener("click", function (evt) {
        if (evt.target === overlay) {
          overlay.classList.remove("show");
        }
      });
    }
  }

  // Apply the persisted theme immediately (before DOMContentLoaded) to
  // avoid a flash of the default theme.
  applyTheme(getStoredTheme());

  document.addEventListener("DOMContentLoaded", initThemeMenu);
})();
