"use strict";

var urlGuard = require("./urlGuard");

var AZBRY_API_URL = "https://api.azbry.com/api/download/allinone";
var DEFAULT_TIMEOUT_MS = 60000;

function AzbryDownloader(opts) {
  this.timeout = (opts && opts.timeout) || DEFAULT_TIMEOUT_MS;
}

/**
 * Validates the incoming URL: must be a non-empty string, http/https only,
 * and not pointed at localhost/private/internal targets.
 */
AzbryDownloader.prototype.validateUrl = function (url) {
  if (!url || typeof url !== "string") {
    throw new Error("URL wajib diisi");
  }

  var parsed;
  try {
    parsed = new URL(url.trim());
  } catch (e) {
    throw new Error("URL tidak valid");
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Protocol URL tidak didukung");
  }

  var guard = urlGuard.validateOutboundUrl(parsed.href);
  if (!guard.ok) {
    throw new Error("URL tidak diizinkan");
  }

  return parsed.href;
};

/**
 * Makes a request to the Azbry API with the given URL
 */
AzbryDownloader.prototype.fetchFromAzbry = async function (targetUrl) {
  // Use native fetch (compatible with Vercel/Node 18+)
  var response = await fetch(AZBRY_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "KlipinDownloader/2.0"
    },
    body: JSON.stringify({ url: targetUrl })
  });

  if (!response.ok) {
    var err = new Error("Upstream API error: HTTP " + response.status);
    err.code = "UPSTREAM_HTTP_ERROR";
    throw err;
  }

  var data = await response.json();
  return data;
};

/**
 * Main download handler: validates URL, calls Azbry API, normalizes response
 */
AzbryDownloader.prototype.download = async function (url, normalizer) {
  var target = this.validateUrl(url);

  var self = this;
  var timer;

  try {
    var timeoutPromise = new Promise(function (_, reject) {
      timer = setTimeout(function () {
        var timeoutErr = new Error("Downloader timeout");
        timeoutErr.code = "DOWNLOADER_TIMEOUT";
        reject(timeoutErr);
      }, self.timeout);
    });

    // Race between API call and timeout
    var upstreamResponse = await Promise.race([
      self.fetchFromAzbry(target),
      timeoutPromise
    ]);

    // Normalize the upstream response
    return normalizer.normalize(upstreamResponse, target);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

module.exports = { AzbryDownloader: AzbryDownloader, instance: new AzbryDownloader() };
