const crypto = require("crypto");
const { getRedis } = require("../../lib/redis");

/**
 * This endpoint is UNRELATED to the public /adm page (which is simply
 * PAJAR's developer identity page and requires no authentication).
 *
 * It exists only as an optional internal session mechanism in case a
 * separate internal dashboard is added later. It is disabled by default
 * unless ADMIN_INTERNAL_SECRET is configured in environment variables.
 */
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "METHOD_NOT_ALLOWED" });
  }

  const configuredSecret = process.env.ADMIN_INTERNAL_SECRET;

  if (!configuredSecret) {
    return res.status(503).json({
      success: false,
      error: "FEATURE_DISABLED",
      message: "Internal session login is not enabled.",
    });
  }

  const providedSecret = req.body && req.body.secret;

  if (typeof providedSecret !== "string" || providedSecret !== configuredSecret) {
    return res.status(401).json({ success: false, error: "INVALID_SECRET" });
  }

  const sessionToken = crypto.randomBytes(32).toString("hex");
  const maxAgeSeconds = 60 * 30; // 30 minute TTL

  const redis = getRedis();
  if (redis) {
    try {
      await redis.set(`klipin:session:${sessionToken}`, "1", { ex: maxAgeSeconds });
    } catch (err) {
      return res.status(503).json({ success: false, error: "SESSION_STORE_UNAVAILABLE" });
    }
  } else {
    return res.status(503).json({ success: false, error: "SESSION_STORE_UNAVAILABLE" });
  }

  res.setHeader(
    "Set-Cookie",
    `klipin_session=${sessionToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}`
  );

  return res.status(200).json({ success: true });
};
