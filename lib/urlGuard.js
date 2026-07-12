"use strict";

/**
 * Validates a user-supplied URL to prevent SSRF and protocol abuse.
 * Only http/https are allowed, and obviously internal/loopback/private
 * targets are rejected. This is a best-effort static check performed
 * before the URL is ever passed to the upstream scraper.
 */

var BLOCKED_HOSTNAMES = [
  "localhost",
  "localhost.localdomain",
  "0.0.0.0",
  "::1",
  "metadata.google.internal"
];

function isIPv4(hostname) {
  return /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(hostname);
}

function ipv4ToParts(hostname) {
  return hostname.split(".").map(function (n) {
    return parseInt(n, 10);
  });
}

function isPrivateIPv4(hostname) {
  if (!isIPv4(hostname)) return false;
  var p = ipv4ToParts(hostname);
  if (p.some(function (n) { return isNaN(n) || n < 0 || n > 255; })) return true; // malformed -> reject
  var a = p[0], b = p[1];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT
  return false;
}

function isPrivateIPv6(hostname) {
  var h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "::1") return true;
  if (h.indexOf("fe80:") === 0) return true; // link-local
  if (h.indexOf("fc") === 0 || h.indexOf("fd") === 0) return true; // unique local
  return false;
}

function isBlockedHostname(hostname) {
  var h = hostname.toLowerCase();
  if (BLOCKED_HOSTNAMES.indexOf(h) !== -1) return true;
  if (h.endsWith(".local")) return true;
  if (h.endsWith(".internal")) return true;
  if (h.indexOf(".") === -1) return true; // bare hostnames (e.g. "internal-service")
  return false;
}

function validateOutboundUrl(rawUrl) {
  var url;
  try {
    url = new URL(rawUrl);
  } catch (e) {
    return { ok: false, reason: "URL_TIDAK_VALID" };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, reason: "PROTOKOL_TIDAK_DIIZINKAN" };
  }

  var hostname = url.hostname;

  if (isBlockedHostname(hostname)) {
    return { ok: false, reason: "HOST_TIDAK_DIIZINKAN" };
  }
  if (isPrivateIPv4(hostname)) {
    return { ok: false, reason: "TARGET_PRIVAT_DITOLAK" };
  }
  if (hostname.indexOf(":") !== -1 && isPrivateIPv6(hostname)) {
    return { ok: false, reason: "TARGET_PRIVAT_DITOLAK" };
  }
  if (url.username || url.password) {
    return { ok: false, reason: "URL_TIDAK_DIIZINKAN" };
  }

  return { ok: true, url: url };
}

module.exports = { validateOutboundUrl: validateOutboundUrl };
