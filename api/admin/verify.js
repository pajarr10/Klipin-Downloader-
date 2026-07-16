const { getRedis } = require("../../lib/redis");

function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const key = pair.slice(0, idx).trim();
    const val = pair.slice(idx + 1).trim();
    out[key] = decodeURIComponent(val);
  });
  return out;
}

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "METHOD_NOT_ALLOWED" });
  }

  const cookies = parseCookies(req);
  const token = cookies.klipin_session;

  if (!token) {
    return res.status(401).json({ success: false, valid: false });
  }

  const redis = getRedis();
  if (!redis) {
    return res.status(503).json({ success: false, error: "SESSION_STORE_UNAVAILABLE" });
  }

  try {
    const exists = await redis.get(`klipin:session:${token}`);
    if (!exists) {
      return res.status(401).json({ success: false, valid: false });
    }
    return res.status(200).json({ success: true, valid: true });
  } catch (err) {
    return res.status(503).json({ success: false, error: "SESSION_STORE_UNAVAILABLE" });
  }
};
