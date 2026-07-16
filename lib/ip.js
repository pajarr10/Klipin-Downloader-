const crypto = require("crypto");

/**
 * Extracts the client IP from Vercel's forwarded headers.
 */
function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    return String(forwarded).split(",")[0].trim();
  }
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "unknown";
}

/**
 * Hashes an IP address with a server-side secret so raw IPs are never
 * stored or transmitted. Used for rate-limit keys and abuse correlation
 * only, never for identifying an individual user.
 */
function hashIp(ip) {
  const secret = process.env.IP_HASH_SECRET || "klipin-fallback-secret-change-me";
  return crypto
    .createHmac("sha256", secret)
    .update(String(ip))
    .digest("hex")
    .slice(0, 16)
    .toUpperCase();
}

module.exports = { getClientIp, hashIp };
