"use strict";

var rateLimit = require("../lib/rateLimit");
var analytics = require("../lib/analytics");
var downloader = require("../lib/klipinDownloader").instance;

function sendJson(res, status, payload) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

function errorResponse(res, status, message) {
  return sendJson(res, status, { status: false, message: message });
}

/** Maps a validation/downloader error message to the right HTTP status. */
function statusForError(err) {
  var code = err && err.code;
  var msg = (err && err.message) || "";

  if (code === "DOWNLOADER_TIMEOUT") return 504;
  if (code === "DOWNLOADER_MODULE_MISSING") return 500;
  if (
    msg === "URL wajib diisi" ||
    msg === "URL tidak valid" ||
    msg === "Protocol URL tidak didukung" ||
    msg === "URL tidak diizinkan"
  ) {
    return 400;
  }
  if (msg === "Media tidak ditemukan dari tautan ini" || msg === "Data media tidak ditemukan") {
    return 422;
  }
  return 502; // upstream/downloader failure of some other kind
}

/** Only ever surface known, safe, pre-defined messages to the client. */
function publicMessage(err, status) {
  var msg = (err && err.message) || "";
  var known = [
    "URL wajib diisi",
    "URL tidak valid",
    "Protocol URL tidak didukung",
    "URL tidak diizinkan",
    "Media tidak ditemukan dari tautan ini",
    "Data media tidak ditemukan",
    "Downloader timeout"
  ];
  if (known.indexOf(msg) !== -1) return msg;
  if (status === 504) return "Downloader timeout";
  if (status === 500) return "Layanan downloader sedang tidak tersedia";
  return "Downloader gagal memproses URL";
}

module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");

  if (req.method !== "GET") {
    return errorResponse(res, 405, "Metode tidak diizinkan");
  }

  var rl = await rateLimit.checkRateLimit(req, { scope: "download", limit: 15, windowSeconds: 60 });
  if (!rl.allowed) {
    return errorResponse(res, 429, "Terlalu banyak permintaan, coba lagi sebentar lagi");
  }

  var targetUrl = req.query && req.query.url;

  // Awaited (not fire-and-forget): on a serverless runtime the invocation
  // can be frozen the instant the handler's promise resolves, so a detached
  // analytics write here could be silently dropped mid-flight. Errors are
  // still swallowed via .catch() so a Redis hiccup never fails the request.
  var recordRequestPromise = analytics.recordRequest(req).catch(function () {});

  var startedAt = Date.now();

  try {
    var data = await downloader.download(targetUrl);
    var elapsedMs = Date.now() - startedAt;

    var primaryType = data.media && data.media[0] ? data.media[0].type : null;

    await recordRequestPromise;
    await analytics
      .recordResult({
        status: true,
        platform: data.platform || "unknown",
        title: data.title,
        type: primaryType,
        ms: elapsedMs
      })
      .catch(function () {});

    return sendJson(res, 200, data);
  } catch (err) {
    var elapsedMsErr = Date.now() - startedAt;
    var status = statusForError(err);
    var isTimeout = status === 504;

    // Never leak stack traces, env vars, or internal error detail.
    console.error("KLIPIN download error:", err && err.message);

    await recordRequestPromise;
    await analytics
      .recordResult({
        status: false,
        platform: "unknown",
        ms: elapsedMsErr,
        timeout: isTimeout,
        errorMessage: err && err.message
      })
      .catch(function () {});

    return errorResponse(res, status, publicMessage(err, status));
  }
};
