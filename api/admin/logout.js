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
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "METHOD_NOT_ALLOWED" });
  }

  const cookies = parseCookies(req);
  const token = cookies.klipin_session;

  const redis = getRedis();
  if (token && redis) {
    try {
      await redis.del(`klipin:session:${token}`);
    } catch (err) {
      // ignore, still clear cookie below
    }
  }

  res.setHeader(
    "Set-Cookie",
    "klipin_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0"
  );

  return res.status(200).json({ success: true });
};
