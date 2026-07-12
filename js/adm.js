/* KLIPIN — adm.js
   Handles the optional server-admin login panel on /adm.
   Session is stored server-side via HTTP-only cookie; this script never
   touches the admin key itself beyond sending it once over POST. */

(function () {
  "use strict";

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.getElementById("admin-login-form");
    var keyInput = document.getElementById("admin-key-input");
    var statusEl = document.getElementById("admin-login-status");
    var loginBtn = document.getElementById("admin-login-btn");
    var logoutBtn = document.getElementById("admin-logout-btn");
    var panelLogged = document.getElementById("admin-panel-loggedin");
    var panelForm = document.getElementById("admin-panel-form");

    if (!form) return;

    function setStatus(text, isError) {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.style.color = isError ? "var(--danger)" : "var(--accent)";
    }

    function showLoggedIn(show) {
      if (panelLogged) panelLogged.classList.toggle("hidden", !show);
      if (panelForm) panelForm.classList.toggle("hidden", show);
    }

    function checkSession() {
      fetch("/api/admin/verify", { credentials: "include" })
        .then(function (r) {
          return r.json().catch(function () {
            return { ok: false };
          });
        })
        .then(function (body) {
          showLoggedIn(!!(body && body.ok));
        })
        .catch(function () {
          showLoggedIn(false);
        });
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var key = keyInput.value.trim();
      if (!key) {
        setStatus("MASUKKAN ADMIN KEY.", true);
        return;
      }
      loginBtn.disabled = true;
      loginBtn.textContent = "MEMVERIFIKASI...";
      setStatus("", false);

      fetch("/api/admin/login", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: key })
      })
        .then(function (r) {
          return r.json().catch(function () {
            return { ok: false };
          }).then(function (body) {
            return { status: r.status, body: body };
          });
        })
        .then(function (res) {
          if (res.status === 200 && res.body && res.body.ok) {
            keyInput.value = "";
            setStatus("BERHASIL MASUK.", false);
            showLoggedIn(true);
          } else {
            setStatus((res.body && res.body.message) || "ADMIN KEY SALAH.", true);
          }
        })
        .catch(function () {
          setStatus("GAGAL TERHUBUNG KE SERVER.", true);
        })
        .finally(function () {
          loginBtn.disabled = false;
          loginBtn.textContent = "MASUK";
        });
    });

    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        fetch("/api/admin/logout", { method: "POST", credentials: "include" }).finally(function () {
          showLoggedIn(false);
          setStatus("KELUAR DARI SESI ADMIN.", false);
        });
      });
    }

    checkSession();
  });
})();
