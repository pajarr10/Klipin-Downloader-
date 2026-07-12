"use strict";

/**
 * server.js — LOCAL PREVIEW ONLY.
 *
 * This file is NOT used by Vercel in production. Vercel automatically turns
 * every file under /api into its own serverless function; this server just
 * emulates that behavior with plain Node http so you can run:
 *
 *   node server.js
 *
 * and preview the whole site (frontend + /api/*) on http://localhost:3000
 * without installing the Vercel CLI.
 */

var http = require("http");
var fs = require("fs");
var path = require("path");
var url = require("url");

var PORT = process.env.PORT || 3000;
var ROOT = __dirname;

/* ---------------- tiny .env loader (no dependency) ---------------- */
(function loadEnv() {
  var envPath = path.join(ROOT, ".env");
  if (!fs.existsSync(envPath)) return;
  var lines = fs.readFileSync(envPath, "utf8").split("\n");
  lines.forEach(function (line) {
    var trimmed = line.trim();
    if (!trimmed || trimmed.indexOf("#") === 0) return;
    var idx = trimmed.indexOf("=");
    if (idx === -1) return;
    var key = trimmed.slice(0, idx).trim();
    var value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  });
})();

/* ---------------- static file map ---------------- */
var MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ico": "image/x-icon"
};

var CLEAN_ROUTES = {
  "/": "/index.html",
  "/cara-penggunaan": "/cara-penggunaan/index.html",
  "/larangan": "/larangan/index.html",
  "/adm": "/adm/index.html"
};

function serveStatic(req, res, pathname) {
  var relPath = CLEAN_ROUTES[pathname] || pathname;
  var filePath = path.join(ROOT, relPath);

  // Prevent path traversal outside project root.
  if (filePath.indexOf(ROOT) !== 0) {
    res.statusCode = 403;
    return res.end("Forbidden");
  }

  fs.stat(filePath, function (err, stat) {
    if (err || !stat.isFile()) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      return res.end("404 — halaman tidak ditemukan: " + pathname);
    }
    var ext = path.extname(filePath);
    res.setHeader("Content-Type", MIME[ext] || "application/octet-stream");
    fs.createReadStream(filePath).pipe(res);
  });
}

/* ---------------- /api/* dispatcher ---------------- */
function toApiFilePath(pathname) {
  // "/api/download" -> "api/download.js"
  // "/api/admin/login" -> "api/admin/login.js"
  var rel = pathname.replace(/^\/api\//, "").replace(/\/$/, "");
  return path.join(ROOT, "api", rel + ".js");
}

function readRawBody(req) {
  return new Promise(function (resolve) {
    var chunks = [];
    req.on("data", function (c) {
      chunks.push(c);
    });
    req.on("end", function () {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", function () {
      resolve("");
    });
  });
}

async function handleApi(req, res, pathname, query) {
  var filePath = toApiFilePath(pathname);

  if (!fs.existsSync(filePath)) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(JSON.stringify({ ok: false, message: "ENDPOINT TIDAK DITEMUKAN." }));
  }

  // Shim Vercel-style req.query / req.body onto the raw Node request.
  req.query = query;

  if (req.method === "POST" || req.method === "PUT") {
    var raw = await readRawBody(req);
    try {
      req.body = raw ? JSON.parse(raw) : {};
    } catch (e) {
      req.body = {};
    }
  }

  delete require.cache[require.resolve(filePath)];

  var handler;
  try {
    handler = require(filePath);
  } catch (err) {
    console.error("KLIPIN api load error:", err && err.message);
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    return res.end(
      JSON.stringify({
        ok: false,
        message: "MODUL SERVER BELUM SIAP. JALANKAN 'npm install' TERLEBIH DAHULU."
      })
    );
  }

  try {
    await handler(req, res);
  } catch (err) {
    console.error("KLIPIN api error:", err && err.stack);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({ ok: false, message: "TERJADI KESALAHAN SERVER." }));
    }
  }
}

/* ---------------- main server ---------------- */
var server = http.createServer(function (req, res) {
  var parsed = url.parse(req.url, true);
  var pathname = decodeURIComponent(parsed.pathname);

  if (pathname.indexOf("/api/") === 0) {
    handleApi(req, res, pathname, parsed.query);
    return;
  }

  serveStatic(req, res, pathname);
});

server.listen(PORT, function () {
  console.log("");
  console.log("  KLIPIN local preview running");
  console.log("  ->  http://localhost:" + PORT);
  console.log("");
  if (!process.env.UPSTASH_REDIS_REST_URL) {
    console.log("  [info] UPSTASH_REDIS_REST_URL belum diset — rate limit pakai");
    console.log("         fallback in-memory, dan login admin akan ditolak.");
    console.log("         Isi file .env (lihat .env.example) untuk fitur penuh.");
    console.log("");
  }
});
