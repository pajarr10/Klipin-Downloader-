"use strict";

/**
 * Lightweight heuristic User-Agent parser. Not exhaustive, but enough for
 * aggregate analytics ("most common browser/OS"). Never trusts anything
 * from the frontend — this only ever reads the raw request header.
 */

function parseOS(ua) {
  if (/windows nt 10/i.test(ua)) return "Windows 10/11";
  if (/windows nt/i.test(ua)) return "Windows";
  if (/android/i.test(ua)) return "Android";
  if (/iphone|ipad|ipod/i.test(ua)) return "iOS";
  if (/mac os x/i.test(ua)) return "macOS";
  if (/cros/i.test(ua)) return "ChromeOS";
  if (/linux/i.test(ua)) return "Linux";
  return "Lainnya";
}

function parseBrowser(ua) {
  if (/edg\//i.test(ua)) return "Edge";
  if (/opr\/|opera/i.test(ua)) return "Opera";
  if (/samsungbrowser/i.test(ua)) return "Samsung Internet";
  if (/firefox\//i.test(ua)) return "Firefox";
  if (/crios\//i.test(ua)) return "Chrome (iOS)";
  if (/fxios\//i.test(ua)) return "Firefox (iOS)";
  if (/chrome\//i.test(ua) && !/chromium/i.test(ua)) return "Chrome";
  if (/safari\//i.test(ua) && /version\//i.test(ua)) return "Safari";
  if (/msie|trident/i.test(ua)) return "Internet Explorer";
  return "Lainnya";
}

function parseDeviceType(ua) {
  if (/ipad|tablet|kindle|playbook|silk/i.test(ua)) return "Tablet";
  if (/mobi|android.*mobile|iphone|ipod/i.test(ua)) return "Mobile";
  return "Desktop";
}

function parseUserAgent(rawUa) {
  var ua = typeof rawUa === "string" ? rawUa : "";
  if (!ua) {
    return { os: "Tidak diketahui", browser: "Tidak diketahui", device: "Tidak diketahui" };
  }
  return {
    os: parseOS(ua),
    browser: parseBrowser(ua),
    device: parseDeviceType(ua)
  };
}

module.exports = { parseUserAgent: parseUserAgent };
