const axios = require("axios");
const { validateMediaUrl } = require("../lib/validateUrl");
const { rateLimit, recordEvent } = require("../lib/redis");
const { getClientIp, hashIp } = require("../lib/ip");
const { notifyOwner } = require("../lib/telegram");

const KYZZ_API_URL =
  process.env.KYZZ_API_URL || "https://api.kyzzz.eu.cc/api/download/aio";
const KYZZ_API_KEY = process.env.KYZZ_API_KEY || "kyzz8337536735";

const RATE_LIMIT_WINDOW_SECONDS = 60;
const RATE_LIMIT_MAX_REQUESTS = 12;
const UPSTREAM_TIMEOUT_MS = 20000;

const KNOWN_PLATFORMS = [
  "tiktok",
  "youtube",
  "instagram",
  "douyin",
  "pinterest",
  "facebook",
  "capcut",
  "spotify",
];

function detectPlatform(sourceFromApi, inputUrl) {
  if (sourceFromApi && typeof sourceFromApi === "string") {
    const s = sourceFromApi.toLowerCase();
    const match = KNOWN_PLATFORMS.find((p) => s.includes(p));
    if (match) return match;
  }
  if (inputUrl) {
    const u = inputUrl.toLowerCase();
    if (u.includes("tiktok")) return "tiktok";
    if (u.includes("youtu")) return "youtube";
    if (u.includes("instagram")) return "instagram";
    if (u.includes("douyin")) return "douyin";
    if (u.includes("pinterest") || u.includes("pin.it")) return "pinterest";
    if (u.includes("facebook") || u.includes("fb.watch")) return "facebook";
    if (u.includes("capcut")) return "capcut";
    if (u.includes("spotify")) return "spotify";
  }
  return "unknown";
}

/**
 * Normalizes a raw media entry from the upstream API result into the
 * safe shape sent to the frontend. Only known, expected fields pass
 * through — nothing from upstream is forwarded blindly.
 */
function normalizeMedia(media) {
  if (!media || typeof media !== "object") return null;
  if (typeof media.url !== "string" || media.url.length === 0) return null;

  const out = { url: media.url };

  if (typeof media.type === "string") out.type = media.type;
  if (typeof media.extension === "string") out.extension = media.extension;
  if (typeof media.quality === "string") out.quality = media.quality;
  if (typeof media.data_size === "number") out.size = media.data_size;
  if (typeof media.width === "number") out.width = media.width;
  if (typeof media.height === "number") out.height = media.height;
  if (typeof media.duration === "number") out.duration = media.duration;

  return out;
}

function safeString(value, maxLen = 300) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function sendJson(res, statusCode, payload) {
  res.status(statusCode).setHeader("Content-Type", "application/json");
  res.send(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  const startedAt = Date.now();

  // Security headers specific to this API response.
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

  // --- Rate limiting (per hashed IP) ---
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
      message: "Terlalu banyak permintaan. Coba lagi sebentar lagi.",
    });
  }

  // --- Input validation (SSRF protection) ---
  const validation = await validateMediaUrl(rawUrl);
  if (!validation.valid) {
    const errorCode = validation.reason || "URL_INVALID";
    recordEvent({
      status: "failed",
      errorCode,
      userHash: ipHash,
      timeMs: Date.now() - startedAt,
    }).catch(() => {});

    return sendJson(res, 400, {
      success: false,
      error: errorCode,
      message: "Tautan tidak valid atau tidak diizinkan.",
    });
  }

  // --- Call upstream KYZZ API (server-side only) ---
  let upstreamData;
  try {
    const response = await axios.get(KYZZ_API_URL, {
      params: {
        url: rawUrl,
        apikey: KYZZ_API_KEY,
      },
      timeout: UPSTREAM_TIMEOUT_MS,
      headers: {
        Accept: "application/json",
        "User-Agent": "Klipin/1.0",
      },
      validateStatus: () => true,
    });

    if (response.status < 200 || response.status >= 300) {
      recordEvent({
        status: "failed",
        errorCode: "UPSTREAM_HTTP_" + response.status,
        userHash: ipHash,
        timeMs: Date.now() - startedAt,
      }).catch(() => {});

      notifyOwner(
        `[ KLIPIN MONITOR ]\n\nSTATUS   :: FAILED\nERROR    :: UPSTREAM_HTTP_${response.status}\nUSER     :: HASH:${ipHash}\nDATE     :: ${new Date().toISOString()}`
      );

      return sendJson(res, 502, {
        success: false,
        error: "UPSTREAM_ERROR",
        message: "Layanan sumber sedang bermasalah. Coba lagi nanti.",
      });
    }

    upstreamData = response.data;
  } catch (err) {
    const errorCode =
      err.code === "ECONNABORTED" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNREACHABLE";

    recordEvent({
      status: "failed",
      errorCode,
      userHash: ipHash,
      timeMs: Date.now() - startedAt,
    }).catch(() => {});

    notifyOwner(
      `[ KLIPIN MONITOR ]\n\nSTATUS   :: FAILED\nERROR    :: ${errorCode}\nUSER     :: HASH:${ipHash}\nDATE     :: ${new Date().toISOString()}`
    );

    return sendJson(res, 502, {
      success: false,
      error: errorCode,
      message: "Tidak dapat menghubungi layanan sumber saat ini.",
    });
  }

  // --- Defensive parsing following the real KYZZ response shape ---
  if (
    !upstreamData ||
    upstreamData.status !== true ||
    !upstreamData.result ||
    typeof upstreamData.result !== "object" ||
    upstreamData.result.error === true
  ) {
    recordEvent({
      status: "failed",
      errorCode: "INVALID_UPSTREAM_RESPONSE",
      userHash: ipHash,
      timeMs: Date.now() - startedAt,
    }).catch(() => {});

    return sendJson(res, 422, {
      success: false,
      error: "PROCESS_FAILED",
      message: "Tautan tidak dapat diproses. Coba periksa kembali tautanmu.",
    });
  }

  const result = upstreamData.result;

  if (!Array.isArray(result.medias) || result.medias.length === 0) {
    recordEvent({
      status: "failed",
      errorCode: "NO_MEDIA_FOUND",
      userHash: ipHash,
      timeMs: Date.now() - startedAt,
    }).catch(() => {});

    return sendJson(res, 422, {
      success: false,
      error: "NO_MEDIA_FOUND",
      message: "Media tidak ditemukan pada tautan tersebut.",
    });
  }

  const medias = result.medias.map(normalizeMedia).filter(Boolean);

  if (medias.length === 0) {
    recordEvent({
      status: "failed",
      errorCode: "NO_VALID_MEDIA",
      userHash: ipHash,
      timeMs: Date.now() - startedAt,
    }).catch(() => {});

    return sendJson(res, 422, {
      success: false,
      error: "NO_VALID_MEDIA",
      message: "Media tidak dapat diverifikasi.",
    });
  }

  const platform = detectPlatform(result.source, result.url || rawUrl);

  const statistics = result.statistics && typeof result.statistics === "object"
    ? {
        collect: Number(result.statistics.collect_count) || 0,
        comments: Number(result.statistics.comment_count) || 0,
        likes: Number(result.statistics.digg_count) || 0,
        downloads: Number(result.statistics.download_count) || 0,
        plays: Number(result.statistics.play_count) || 0,
        shares: Number(result.statistics.share_count) || 0,
      }
    : undefined;

  const normalized = {
    success: true,
    platform,
    id: safeString(result.id, 100),
    author: safeString(result.author, 150),
    title: safeString(result.title, 300),
    thumbnail: safeString(result.thumbnail, 1000),
    duration: typeof result.duration === "number" ? result.duration : undefined,
    type: safeString(result.type, 50),
    statistics,
    medias,
  };

  const timeMs = Date.now() - startedAt;
  const qualities = medias.map((m) => m.quality).filter(Boolean);

  recordEvent({
    status: "success",
    platform,
    mediaCount: medias.length,
    type: normalized.type || "single",
    qualities,
    timeMs,
    userHash: ipHash,
  }).catch(() => {});

  notifyOwner(
    `[ KLIPIN MONITOR ]\n\nSTATUS   :: SUCCESS\nPLATFORM :: ${platform.toUpperCase()}\nMEDIA    :: ${medias.length}\nTYPE     :: ${(normalized.type || "SINGLE").toUpperCase()}\nQUALITY  :: ${qualities.join(", ").toUpperCase() || "-"}\nTIME     :: ${timeMs} MS\nUSER     :: HASH:${ipHash}\nDATE     :: ${new Date().toISOString().replace("T", " ").slice(0, 16)} UTC`
  );

  return sendJson(res, 200, normalized);
};
