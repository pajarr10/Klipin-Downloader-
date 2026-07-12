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

  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, message: "METODE TIDAK DIIZINKAN." });
  }

  var jar = cookies.parseCookies(req);
  var token = jar[SESSION_COOKIE];

  if (token && redis.isConfigured()) {
    try {
      await redis.del("admin:session:" + token);
    } catch (e) {
      console.error("KLIPIN redis error (logout):", e && e.message);
    }
  }

  res.setHeader(
    "Set-Cookie",
    cookies.serializeCookie(SESSION_COOKIE, "", {
      maxAge: 0,
      httpOnly: true,
      sameSite: "Lax",
      secure: true
    })
  );

  return sendJson(res, 200, { ok: true });
};
