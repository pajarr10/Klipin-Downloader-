const dns = require("dns").promises;
const net = require("net");

const MAX_URL_LENGTH = 2048;

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "0.0.0.0",
  "ip6-localhost",
  "metadata.google.internal",
]);

/**
 * Checks whether an IP address string falls within a private / reserved
 * range that should never be reachable from a public-facing URL fetch.
 */
function isPrivateIp(ip) {
  if (!ip) return true;

  // IPv4
  if (net.isIPv4(ip)) {
    const parts = ip.split(".").map(Number);
    const [a, b] = parts;

    if (a === 127) return true; // loopback
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 169 && b === 254) return true; // link-local
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 0) return true; // "this" network
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  // IPv6
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === "::1") return true; // loopback
    if (lower.startsWith("fe80:")) return true; // link-local
    if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // unique local
    if (lower.startsWith("::ffff:")) {
      const v4 = lower.split(":").pop();
      if (net.isIPv4(v4)) return isPrivateIp(v4);
    }
    return false;
  }

  return true;
}

/**
 * Validates a user-supplied media URL before it is ever forwarded to the
 * upstream downloader API. Rejects malformed, oversized, or internal-facing
 * targets to reduce SSRF risk.
 *
 * Returns { valid: boolean, reason?: string, parsed?: URL }
 */
async function validateMediaUrl(rawUrl) {
  if (typeof rawUrl !== "string" || rawUrl.length === 0) {
    return { valid: false, reason: "URL_REQUIRED" };
  }

  if (rawUrl.length > MAX_URL_LENGTH) {
    return { valid: false, reason: "URL_TOO_LONG" };
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (err) {
    return { valid: false, reason: "URL_MALFORMED" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { valid: false, reason: "PROTOCOL_NOT_ALLOWED" };
  }

  if (parsed.username || parsed.password) {
    return { valid: false, reason: "CREDENTIALS_IN_URL" };
  }

  const hostname = parsed.hostname.toLowerCase();

  if (BLOCKED_HOSTNAMES.has(hostname)) {
    return { valid: false, reason: "HOST_NOT_ALLOWED" };
  }

  if (hostname.endsWith(".local") || hostname.endsWith(".internal")) {
    return { valid: false, reason: "HOST_NOT_ALLOWED" };
  }

  // If the hostname is already a literal IP, check it directly.
  if (net.isIP(hostname)) {
    if (isPrivateIp(hostname)) {
      return { valid: false, reason: "HOST_NOT_ALLOWED" };
    }
    return { valid: true, parsed };
  }

  // Resolve DNS to make sure the hostname does not point to an internal IP
  // (basic protection against DNS rebinding to private ranges).
  try {
    const records = await dns.lookup(hostname, { all: true });
    for (const record of records) {
      if (isPrivateIp(record.address)) {
        return { valid: false, reason: "HOST_NOT_ALLOWED" };
      }
    }
  } catch (err) {
    // If DNS resolution fails outright, treat as invalid rather than
    // forwarding an unresolvable host to the upstream API.
    return { valid: false, reason: "HOST_UNRESOLVABLE" };
  }

  return { valid: true, parsed };
}

module.exports = { validateMediaUrl, isPrivateIp };
