"use strict";

var crypto = require("crypto");

/**
 * Hashes an IP with a server-side salt, truncated, so it can be used for
 * unique-visitor counting and abuse/rate-limit monitoring without ever
 * storing or displaying the raw IP. This is NOT reversible and is not
 * intended for precise geolocation or personal identification — only for
 * aggregate analytics ("how many distinct clients today").
 */

function getSalt() {
  return process.env.IP_HASH_SALT || "klipin-default-salt-change-me";
}

function hashIp(ip) {
  if (!ip || typeof ip !== "string") return "unknown";
  var clean = ip.split(",")[0].trim();
  return crypto
    .createHash("sha256")
    .update(getSalt() + ":" + clean, "utf8")
    .digest("hex")
    .slice(0, 16);
}

function getClientIp(req) {
  var fwd = req.headers && req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return (req.socket && req.socket.remoteAddress) || "unknown";
}

module.exports = { hashIp: hashIp, getClientIp: getClientIp };
