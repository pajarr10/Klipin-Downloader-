const { fetchAioMedia } = require("../lib/aioApi");
const { validateMediaUrl } = require("../lib/validateUrl");
const { rateLimit, recordEvent } = require("../lib/redis");
const { getClientIp, hashIp } = require("../lib/ip");
const { notifyOwner } = require("../lib/telegram");

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 12;

function sendJson(res, statusCode, payload) {
  res.status(statusCode).setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(payload));
}

const ERROR_MESSAGES = {
  RATE_LIMITED: "Terlalu banyak permintaan. Coba lagi sebentar lagi.",
  URL_REQUIRED: "Masukkan tautan terlebih dahulu.",
  URL_TOO_LONG: "Tautan terlalu panjang.",
  URL_MALFORMED: "Tautan tidak valid.",
  PROTOCOL_NOT_ALLOWED: "Tautan harus menggunakan http atau https.",
  CREDENTIALS_IN_URL: "Tautan tidak boleh mengandung kredensial.",
  HOST_NOT_ALLOWED: "Domain tautan ini tidak diizinkan.",
  HOST_UNRESOLVABLE: "Domain tautan tidak dapat ditemukan.",
  UPSTREAM_TIMEOUT: "Layanan sumber tidak merespons (timeout). Coba lagi.",
  UPSTREAM_UNREACHABLE: "Tidak dapat menghubungi layanan sumber saat ini.",
  INVALID_UPSTREAM_RESPONSE: "Tautan tidak dapat diproses. Coba periksa kembali tautanmu.",
  NO_MEDIA_FOUND: "Media tidak ditemukan pada tautan tersebut, atau platform belum didukung.",
};

function errorMessage(code) {
  if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (typeof code === "string" && code.startsWith("UPSTREAM_HTTP_")) {
    return "Layanan sumber sedang bermasalah. Coba lagi nanti.";
  }
  return "Tautan tidak dapat diproses. Coba periksa kembali tautanmu.";
}

module.exports = async function handler(req, res) {
  const startedAt = Date.now();

  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    return sendJson(res, 405, {
      success: false,
      error: "METHOD_NOT_ALLOWED",
      message: "Endpoint ini hanya menerima metode GET.",
    });
  }

  const rawUrl = typeof req.query.url === "string" ? req.query.url : "";

  const clientIp = getClientIp(req);
  const ipHash = hashIp(clientIp);
  const rateKey = `klipin:ratelimit:${ipHash}`;

  const rl = await rateLimit(
    rateKey,
    RATE_LIMIT_MAX_REQUESTS,
    RATE_LIMIT_WINDOW_SECONDS
  );

  if (!rl.allowed) {
    return sendJson(res, 429, {
      success: false,
      error: "RATE_LIMITED",
      message: errorMessage("RATE_LIMITED"),
    });
  }

  // --- Input validation (SSRF protection) ---
  const validation = await validateMediaUrl(rawUrl);
  if (!validation.valid) {
    const errorCode = validation.reason || "URL_MALFORMED";
    recordEvent({
      status: "failed",
      errorCode,
      userHash: ipHash,
      timeMs: Date.now() - startedAt,
    }).catch(() => {});

    return sendJson(res, 400, {
      success: false,
      error: errorCode,
      message: errorMessage(errorCode),
    });
  }

  // --- Call upstream all-in-one downloader API (single shared helper) ---
  const upstream = await fetchAioMedia(rawUrl);

  if (!upstream.ok) {
    const timeMs = Date.now() - startedAt;
    const httpStatus = upstream.errorCode === "NO_MEDIA_FOUND" ? 422 : 502;

    recordEvent({
      status: "failed",
      errorCode: upstream.errorCode,
      userHash: ipHash,
      timeMs,
    }).catch(() => {});

    notifyOwner(
      `[ KLIPIN MONITOR ]\n\nSTATUS   :: FAILED\nERROR    :: ${upstream.errorCode}\nUSER     :: HASH:${ipHash}\nDATE     :: ${new Date().toISOString()}`
    );

    return sendJson(res, httpStatus, {
      success: false,
      error: upstream.errorCode,
      message: errorMessage(upstream.errorCode),
    });
  }

  const data = upstream.data;
  const timeMs = Date.now() - startedAt;

  const normalized = {
    success: true,
    platform: data.platform,
    platformLabel: data.platformLabel,
    title: data.title,
    author: data.author,
    authorUsername: data.authorUsername,
    thumbnail: data.thumbnail,
    duration: data.duration,
    music: data.music,
    viewCount: data.viewCount,
    likeCount: data.likeCount,
    videos: data.videos,
    audios: data.audios,
    photos: data.photos,
  };

  const qualities = data.videos.map((v) => v.quality).filter(Boolean);
  const mediaCount = data.videos.length + data.audios.length + data.photos.length;

  recordEvent({
    status: "success",
    platform: data.platform,
    mediaCount,
    type: data.photos.length > 0 ? "photo" : data.videos.length > 0 ? "video" : "audio",
    qualities,
    timeMs,
    userHash: ipHash,
  }).catch(() => {});

  notifyOwner(
    `[ KLIPIN MONITOR ]\n\nSTATUS   :: SUCCESS\nPLATFORM :: ${data.platformLabel.toUpperCase()}\nMEDIA    :: ${mediaCount}\nQUALITY  :: ${qualities.join(", ").toUpperCase() || "-"}\nTIME     :: ${timeMs} MS\nUSER     :: HASH:${ipHash}\nDATE     :: ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC`
  );

  return sendJson(res, 200, normalized);
};
