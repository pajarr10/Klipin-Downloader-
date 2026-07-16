/* =========================================================
   KLIPIN — adm.js
   Behavior for the public /adm developer identity page.
   This page is NOT an admin panel or login screen — it simply
   displays PAJAR's developer profile and social links. Only the
   DONASI entry navigates to an external donation page.
   ========================================================= */

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var entries = document.querySelectorAll(".server-entry[data-href]");

    entries.forEach(function (entry) {
      entry.setAttribute("role", "link");
      entry.setAttribute("tabindex", "0");

      function activate() {
        var href = entry.getAttribute("data-href");
        var external = entry.getAttribute("data-external") === "1";
        if (!href) return;

        if (external) {
          window.open(href, "_blank", "noopener,noreferrer");
        } else {
          window.location.href = href;
        }
      }

      entry.addEventListener("click", activate);
      entry.addEventListener("keydown", function (evt) {
        if (evt.key === "Enter" || evt.key === " ") {
          evt.preventDefault();
          activate();
        }
      });
    });
  });
})();
