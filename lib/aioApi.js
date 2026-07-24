const axios = require("axios");

/**
 * Single source of truth for talking to the upstream all-in-one downloader
 * API. Every route that needs media data must go through fetchAioMedia()
 * instead of calling axios/fetch directly — this keeps the endpoint,
 * headers, timeout, and response parsing in exactly one place.
 */

const AIO_API_BASE =
  process.env.AIO_API_URL || "https://api.cmnty.biz.id/downloader/aiov3";
const UPSTREAM_TIMEOUT_MS = 25000;

function safeString(value, maxLen = 500) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, maxLen);
}

function safeNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

/**
 * Normalizes a single video/audio entry from the upstream "videos" /
 * "audios" arrays into the safe shape sent to the frontend.
 */
function normalizeVariant(item) {
  if (!item || typeof item !== "object") return null;
  if (typeof item.url !== "string" || item.url.length === 0) return null;

  const out = { url: item.url };

  if (typeof item.quality === "string") out.quality = item.quality;
  if (typeof item.format === "string") out.format = item.format;
  if (typeof item.size === "number") out.size = item.size;
  if (typeof item.thumbnail === "string") out.thumbnail = item.thumbnail;
  if (item.is_hls === true) out.isHls = true;
  if (typeof item.hlsStreamUrl === "string" && item.hlsStreamUrl) {
    out.hlsStreamUrl = item.hlsStreamUrl;
  }

  return out;
}

/**
 * Normalizes a single photo entry. The upstream API may return photos as
 * plain URL strings or as objects with a `url` field — handle both.
 */
function normalizePhoto(item) {
  if (typeof item === "string" && item.length > 0) return { url: item };
  if (item && typeof item === "object" && typeof item.url === "string") {
    return { url: item.url, thumbnail: safeString(item.thumbnail, 1000) };
  }
  return null;
}

/**
 * Fetches and validates media info for a given URL from the upstream
 * all-in-one downloader API.
 *
 * Returns:
 *   { ok: true, data: <normalized result> }
 *   { ok: false, errorCode: string }
 */
async function fetchAioMedia(rawUrl) {
  let response;
  try {
    response = await axios.get(AIO_API_BASE, {
      params: { url: rawUrl },
      timeout: UPSTREAM_TIMEOUT_MS,
      headers: {
        Accept: "application/json",
        "User-Agent": "Klipin/2.0",
      },
      validateStatus: () => true,
    });
  } catch (err) {
    return {
      ok: false,
      errorCode:
        err.code === "ECONNABORTED" ? "UPSTREAM_TIMEOUT" : "UPSTREAM_UNREACHABLE",
    };
  }

  if (response.status < 200 || response.status >= 300) {
    return { ok: false, errorCode: "UPSTREAM_HTTP_" + response.status };
  }

  const body = response.data;

  if (!body || body.status !== true || !body.result || typeof body.result !== "object") {
    return { ok: false, errorCode: "INVALID_UPSTREAM_RESPONSE" };
  }

  const result = body.result;

  const videos = Array.isArray(result.videos)
    ? result.videos.map(normalizeVariant).filter(Boolean)
    : [];
  const audios = Array.isArray(result.audios)
    ? result.audios.map(normalizeVariant).filter(Boolean)
    : [];
  const photos = Array.isArray(result.photos)
    ? result.photos.map(normalizePhoto).filter(Boolean)
    : [];

  if (videos.length === 0 && audios.length === 0 && photos.length === 0) {
    return { ok: false, errorCode: "NO_MEDIA_FOUND" };
  }

  const platformRaw = safeString(result.source, 60) || "unknown";

  const normalized = {
    platform: platformRaw.toLowerCase(),
    platformLabel: platformRaw,
    title: safeString(result.title, 500),
    author: safeString(result.author, 150),
    authorUsername: safeString(result.authorUsername, 150),
    thumbnail: safeString(result.thumbnail, 2000),
    duration: safeString(result.duration, 30),
    music: safeString(result.music, 200),
    viewCount: safeNumber(result.viewCount),
    likeCount: safeNumber(result.likeCount),
    videos,
    audios,
    photos,
  };

  return { ok: true, data: normalized };
}

module.exports = { fetchAioMedia };
