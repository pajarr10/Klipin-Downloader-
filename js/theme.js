/* KLIPIN — theme.js
   Handles: intro loading screen, theme persistence, theme modal, mobile menu. */

(function () {
  "use strict";

  var THEME_KEY = "klipin_theme";
  var VALID_THEMES = ["abu", "hitam", "putih", "merah", "hijau", "cokelat"];
  var THEME_LABELS = {
    abu: "MINECRAFT ABU-ABU",
    hitam: "MINECRAFT HITAM",
    putih: "MINECRAFT PUTIH",
    merah: "MINECRAFT MERAH",
    hijau: "MINECRAFT HIJAU",
    cokelat: "MINECRAFT COKELAT"
  };
  var THEME_SWATCH = {
    abu: "#8b8b8b",
    hitam: "#3a3a3a",
    putih: "#eceae2",
    merah: "#c93b3b",
    hijau: "#5b8c3e",
    cokelat: "#8a5a2b"
  };

  function getStoredTheme() {
    try {
      var t = localStorage.getItem(THEME_KEY);
      return VALID_THEMES.indexOf(t) !== -1 ? t : "abu";
    } catch (e) {
      return "abu";
    }
  }

  function applyTheme(theme) {
    if (VALID_THEMES.indexOf(theme) === -1) theme = "abu";
    if (theme === "abu") {
      document.documentElement.removeAttribute("data-theme");
    } else {
      document.documentElement.setAttribute("data-theme", theme);
    }
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (e) {}
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      var bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
      if (bg) meta.setAttribute("content", bg);
    }
    document.querySelectorAll(".theme-opt").forEach(function (btn) {
      btn.setAttribute("aria-pressed", btn.dataset.theme === theme ? "true" : "false");
    });
  }

  // Apply theme immediately (before paint) to avoid flash.
  applyTheme(getStoredTheme());

  document.addEventListener("DOMContentLoaded", function () {
    /* ---------------- Loading screen ---------------- */
    var loader = document.getElementById("klipin-loader");
    var app = document.getElementById("klipin-app");
    var bar = document.getElementById("loader-bar-fill");

    var alreadySeen = false;
    try {
      alreadySeen = sessionStorage.getItem("klipin_intro_seen") === "1";
    } catch (e) {}

    function revealApp() {
      if (app) app.classList.add("show");
    }

    if (loader) {
      if (alreadySeen) {
        loader.classList.add("hide");
        revealApp();
      } else {
        requestAnimationFrame(function () {
          if (bar) bar.style.width = "100%";
        });
        var duration = 2100;
        window.setTimeout(function () {
          loader.classList.add("hide");
          revealApp();
          try {
            sessionStorage.setItem("klipin_intro_seen", "1");
          } catch (e) {}
        }, duration);
      }
    } else {
      revealApp();
    }

    /* ---------------- Mobile menu ---------------- */
    var burger = document.getElementById("mc-burger");
    var mobileMenu = document.getElementById("mc-mobile-menu");
    if (burger && mobileMenu) {
      burger.addEventListener("click", function () {
        var open = mobileMenu.classList.toggle("open");
        burger.classList.toggle("open", open);
        burger.setAttribute("aria-expanded", open ? "true" : "false");
        document.body.style.overflow = open ? "hidden" : "";
      });
      mobileMenu.querySelectorAll("a").forEach(function (a) {
        a.addEventListener("click", function () {
          mobileMenu.classList.remove("open");
          burger.classList.remove("open");
          document.body.style.overflow = "";
        });
      });
    }

    /* ---------------- Theme modal ---------------- */
    var themeBtn = document.getElementById("theme-open-btn");
    var themeBtnMobile = document.getElementById("theme-open-btn-mobile");
    var overlay = document.getElementById("theme-overlay");
    var optionsWrap = document.getElementById("theme-options");
    var closeBtn = document.getElementById("theme-close-btn");

    function buildOptions() {
      if (!optionsWrap) return;
      optionsWrap.innerHTML = "";
      VALID_THEMES.forEach(function (t) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "theme-opt";
        btn.dataset.theme = t;
        btn.setAttribute("aria-pressed", "false");
        var swatch = document.createElement("span");
        swatch.className = "swatch";
        swatch.style.background = THEME_SWATCH[t];
        var label = document.createElement("span");
        label.textContent = THEME_LABELS[t];
        btn.appendChild(swatch);
        btn.appendChild(label);
        btn.addEventListener("click", function () {
          applyTheme(t);
        });
        optionsWrap.appendChild(btn);
      });
      applyTheme(getStoredTheme());
    }

    function openModal() {
      buildOptions();
      if (overlay) overlay.classList.add("open");
    }
    function closeModal() {
      if (overlay) overlay.classList.remove("open");
    }

    if (themeBtn) themeBtn.addEventListener("click", openModal);
    if (themeBtnMobile) themeBtnMobile.addEventListener("click", openModal);
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (overlay) {
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) closeModal();
      });
    }
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        closeModal();
        if (mobileMenu) mobileMenu.classList.remove("open");
      }
    });
  });
})();
