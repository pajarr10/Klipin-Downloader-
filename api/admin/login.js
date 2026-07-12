"use strict";

var crypto = require("crypto");
var redis = require("../../lib/redis");
var cookies = require("../../lib/cookies");
var rateLimit = require("../../lib/rateLimit");

var SESSION_COOKIE = "klipin_admin_session";
var SESSION_TTL_SECONDS = 60 * 60 * 2; // 2 hours

function sendJson(res, status, payload) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function timingSafeEqualStr(a, b) {
  var bufA = Buffer.from(a, "utf8");
  var bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

async function readBody(req) {
  if (req.body) {
    if (typeof req.body === "string") {
      try {
        return JSON.parse(req.body);
      } catch (e) {
        return {};
      }
    }
    return req.body;
  }
  return new Promise(function (resolve) {
    var chunks = [];
    req.on("data", function (c) {
      chunks.push(c);
    });
    req.on("end", function () {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"));
      } catch (e) {
        resolve({});
      }
    });
    req.on("error", function () {
      resolve({});
    });
  });
}

module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    return sendJson(res, 405, { ok: false, message: "METODE TIDAK DIIZINKAN." });
  }

  var rl = await rateLimit.checkRateLimit(req, { scope: "admin_login", limit: 8, windowSeconds: 60 });
  if (!rl.allowed) {
    return sendJson(res, 429, { ok: false, message: "TERLALU BANYAK PERCOBAAN. COBA LAGI SEBENTAR LAGI." });
  }

  var body = await readBody(req);
  var key = body && typeof body.key === "string" ? body.key.trim() : "";
  if (!key) {
    return sendJson(res, 400, { ok: false, message: "ADMIN KEY DIPERLUKAN." });
  }

  var expectedHash = null;
  try {
    if (redis.isConfigured()) {
      expectedHash = await redis.get("admin:key_hash");
    }
  } catch (e) {
    console.error("KLIPIN redis error (login):", e && e.message);
  }
  if (!expectedHash) {
    expectedHash = process.env.ADMIN_KEY_HASH || null;
  }

  if (!expectedHash) {
    console.error("KLIPIN admin login: no ADMIN_KEY_HASH configured");
    return sendJson(res, 500, { ok: false, message: "ADMIN BELUM DIKONFIGURASI DI SERVER." });
  }

  var providedHash = sha256(key);
  var valid = timingSafeEqualStr(providedHash, expectedHash);
  if (!valid) {
    return sendJson(res, 401, { ok: false, message: "ADMIN KEY SALAH." });
  }

  var token = crypto.randomBytes(32).toString("hex");
  try {
    if (redis.isConfigured()) {
      await redis.set("admin:session:" + token, "1", { exSeconds: SESSION_TTL_SECONDS });
    }
  } catch (e) {
    console.error("KLIPIN redis error (session set):", e && e.message);
    return sendJson(res, 500, { ok: false, message: "GAGAL MEMBUAT SESI ADMIN." });
  }

  res.setHeader(
    "Set-Cookie",
    cookies.serializeCookie(SESSION_COOKIE, token, {
      maxAge: SESSION_TTL_SECONDS,
      httpOnly: true,
      sameSite: "Lax",
      secure: true
    })
  );

  return sendJson(res, 200, { ok: true });
};
