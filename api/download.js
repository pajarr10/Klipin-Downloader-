"use strict";

var axios = require("axios");
var urlGuard = require("../lib/urlGuard");
var rateLimit = require("../lib/rateLimit");
var normalize = require("../lib/normalize");

var UPSTREAM_ENDPOINT = "https://download.amane-acel.web.id/api/aio";
var UPSTREAM_REFERER = "https://download.amane-acel.web.id/";
var UPSTREAM_UA =
  "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
var UPSTREAM_TIMEOUT_MS = 15000;

function sendJson(res, status, payload) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

async function fetchFromUpstream(targetUrl) {
  var controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  var timer = null;
  if (controller) {
    timer = setTimeout(function () {
      controller.abort();
    }, UPSTREAM_TIMEOUT_MS);
  }

  try {
    var response = await axios.get(UPSTREAM_ENDPOINT, {
      params: { url: targetUrl },
      timeout: UPSTREAM_TIMEOUT_MS,
      signal: controller ? controller.signal : undefined,
      headers: {
        Referer: UPSTREAM_REFERER,
        "User-Agent": UPSTREAM_UA,
        Accept: "application/json"
      },
      validateStatus: function () {
        return true; // handle status manually below
      }
    });
    return response;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");

  if (req.method !== "GET") {
    return sendJson(res, 405, { ok: false, message: "METODE TIDAK DIIZINKAN." });
  }

  var rl = await rateLimit.checkRateLimit(req, { scope: "download", limit: 15, windowSeconds: 60 });
  if (!rl.allowed) {
    return sendJson(res, 429, {
      ok: false,
      message: "TERLALU BANYAK PERMINTAAN. COBA LAGI SEBENTAR LAGI."
    });
  }

  var targetUrl = req.query && req.query.url;
  if (!targetUrl || typeof targetUrl !== "string") {
    return sendJson(res, 400, { ok: false, message: "PARAMETER URL DIPERLUKAN." });
  }

  var validation = urlGuard.validateOutboundUrl(targetUrl);
  if (!validation.ok) {
    return sendJson(res, 400, { ok: false, message: "TAUTAN TIDAK VALID ATAU TIDAK DIIZINKAN." });
  }

  var upstreamResponse;
  try {
    upstreamResponse = await fetchFromUpstream(validation.url.toString());
  } catch (err) {
    // Never leak stack traces / internal details to the client.
    console.error("KLIPIN upstream error:", err && err.message);
    return sendJson(res, 502, {
      ok: false,
      message: "TAUTAN TIDAK DAPAT DIPROSES. SERVER SUMBER TIDAK MERESPON."
    });
  }

  if (upstreamResponse.status < 200 || upstreamResponse.status >= 300) {
    return sendJson(res, 502, {
      ok: false,
      message: "TAUTAN TIDAK DAPAT DIPROSES. SERVER SUMBER MENGEMBALIKAN ERROR."
    });
  }

  var body = upstreamResponse.data;
  if (!body || (typeof body === "object" && Object.keys(body).length === 0)) {
    return sendJson(res, 502, { ok: false, message: "RESPON KOSONG DARI SERVER SUMBER." });
  }

  var normalized;
  try {
    normalized = normalize.normalizeUpstreamResponse(body);
  } catch (err) {
    console.error("KLIPIN normalize error:", err && err.message);
    normalized = null;
  }

  if (!normalized) {
    return sendJson(res, 422, {
      ok: false,
      message: "TIDAK ADA MEDIA YANG DITEMUKAN DARI TAUTAN INI."
    });
  }

  return sendJson(res, 200, { ok: true, data: normalized });
};
