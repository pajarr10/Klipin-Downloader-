"use strict";

var redis = require("../../lib/redis");
var cookies = require("../../lib/cookies");

var SESSION_COOKIE = "klipin_admin_session";

function sendJson(res, status, payload) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    return sendJson(res, 405, { ok: false, message: "METODE TIDAK DIIZINKAN." });
  }

  var jar = cookies.parseCookies(req);
  var token = jar[SESSION_COOKIE];
  if (!token) {
    return sendJson(res, 200, { ok: false });
  }

  if (!redis.isConfigured()) {
    return sendJson(res, 200, { ok: false });
  }

  try {
    var exists = await redis.get("admin:session:" + token);
    return sendJson(res, 200, { ok: Boolean(exists) });
  } catch (e) {
    console.error("KLIPIN redis error (verify):", e && e.message);
    return sendJson(res, 200, { ok: false });
  }
};
