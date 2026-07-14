"use strict";

/**
 * Converts bytes to human-readable format
 */
function formatBytes(bytes) {
  if (bytes === null || bytes === undefined) return null;
  bytes = Number(bytes);
  if (!isFinite(bytes) || bytes < 0) return null;

  var units = ["B", "KB", "MB", "GB"];
  var unitIndex = 0;
  var size = bytes;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  var rounded = Math.round(size * 100) / 100;
  return rounded + " " + units[unitIndex];
}

/**
 * Formats quality strings: convert underscores to spaces and title case
 * Examples:
 * - "hd_no_watermark" → "HD No Watermark"
 * - "no_watermark" → "No Watermark"
 * - "audio" → "Audio"
 */
function formatQuality(quality) {
  if (!quality || typeof quality !== "string") return null;
  
  return quality
    .toLowerCase()
    .split("_")
    .map(function (word) {
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/**
 * Validates that a value is a valid HTTP/HTTPS URL
 */
function isValidUrl(url) {
  if (typeof url !== "string") return false;
  try {
    var parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (e) {
    return false;
  }
}

/**
 * Converts resolution dimensions to human-readable format
 */
function formatResolution(width, height) {
  if (!width || !height) return null;
  width = Number(width);
  height = Number(height);
  if (!isFinite(width) || !isFinite(height)) return null;
  return width + " × " + height;
}

/**
 * Normalizes media array from upstream response
 */
function normalizeMedia(upstreamMedias) {
  if (!Array.isArray(upstreamMedias)) return [];

  var media = [];
  var seen = {};

  upstreamMedias.forEach(function (m) {
    if (!m || typeof m !== "object") return;

    // Validate that media has URL
    if (!isValidUrl(m.url)) return;

    // Validate that type is supported
    var type = (m.type && String(m.type).toLowerCase()) || null;
    if (!type || (type !== "video" && type !== "audio" && type !== "image")) return;

    // Create unique key to avoid duplicates
    var key = type + "|" + m.url;
    if (seen[key]) return;
    seen[key] = true;

    // Format quality string
    var quality = m.quality ? formatQuality(m.quality) : null;

    // Format file size
    var size = m.data_size ? formatBytes(m.data_size) : null;

    // Format resolution if available
    var resolution = null;
    if (m.width && m.height) {
      resolution = formatResolution(m.width, m.height);
    }

    media.push({
      type: type,
      quality: quality,
      size: size,
      width: m.width || null,
      height: m.height || null,
      extension: m.extension || null,
      url: m.url
    });
  });

  return media;
}

/**
 * Normalizes author information from upstream response
 */
function normalizeAuthor(upstream) {
  if (!upstream || typeof upstream !== "object") {
    return { username: null, name: null, avatar: null };
  }

  return {
    username: (upstream.unique_id && String(upstream.unique_id)) || null,
    name: (upstream.author && String(upstream.author)) || null,
    avatar: upstream.avatar || null
  };
}

/**
 * Normalizes statistics object from upstream response
 */
function normalizeStatistics(upstreamStats) {
  if (!upstreamStats || typeof upstreamStats !== "object") {
    return null;
  }

  return {
    views: upstreamStats.play_count || null,
    likes: upstreamStats.digg_count || null,
    comments: upstreamStats.comment_count || null,
    shares: upstreamStats.share_count || null,
    downloads: upstreamStats.download_count || null,
    favorites: upstreamStats.collect_count || null
  };
}

/**
 * Detects platform from source field
 */
function detectPlatform(source) {
  if (!source || typeof source !== "string") return null;
  var lower = source.toLowerCase();
  
  // Azbry typically returns platform name in source field
  // Examples: "tiktok", "instagram", "facebook", etc.
  return lower;
}

function AzbryNormalizer() {}

/**
 * Main normalization function: converts Azbry API response to Klipin API format
 */
AzbryNormalizer.prototype.normalize = function (response, sourceUrl) {
  if (!response || typeof response !== "object") {
    throw new Error("Response downloader tidak valid");
  }

  // Validate response status
  if (response.status !== true) {
    var errorMsg = (response && response.message) || "Azbry API error";
    throw new Error(errorMsg);
  }

  // Check for valid result
  var result = response.result;
  if (!result || typeof result !== "object") {
    throw new Error("Media tidak ditemukan dari tautan ini");
  }

  // Check for upstream error flag
  if (result.error === true) {
    throw new Error("Media tidak ditemukan dari tautan ini");
  }

  // Validate media array exists and is valid
  var upstreamMedias = result.medias;
  if (!Array.isArray(upstreamMedias)) {
    throw new Error("Media tidak ditemukan dari tautan ini");
  }

  // Normalize media
  var media = normalizeMedia(upstreamMedias);
  if (!media.length) {
    throw new Error("Media tidak ditemukan dari tautan ini");
  }

  // Extract platform from source field
  var platform = detectPlatform(result.source);

  // Extract author information
  var author = normalizeAuthor(result);

  // Extract statistics if available
  var statistics = normalizeStatistics(result.statistics);

  // Build normalized response
  var normalized = {
    status: true,
    platform: platform,
    title: (result.title && String(result.title)) || null,
    thumbnail: (result.thumbnail && String(result.thumbnail)) || null,
    author: author,
    duration: result.duration || null,
    media: media
  };

  // Add statistics if available
  if (statistics) {
    normalized.statistics = statistics;
  }

  return normalized;
};

module.exports = { AzbryNormalizer: AzbryNormalizer, instance: new AzbryNormalizer() };
