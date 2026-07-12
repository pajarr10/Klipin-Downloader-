"use strict";

function parseCookies(req) {
  var header = req.headers && req.headers.cookie;
  var out = {};
  if (!header) return out;
  header.split(";").forEach(function (pair) {
    var idx = pair.indexOf("=");
    if (idx === -1) return;
    var key = pair.slice(0, idx).trim();
    var value = pair.slice(idx + 1).trim();
    try {
      out[key] = decodeURIComponent(value);
    } catch (e) {
      out[key] = value;
    }
  });
  return out;
}

function serializeCookie(name, value, opts) {
  opts = opts || {};
  var parts = [name + "=" + encodeURIComponent(value)];
  parts.push("Path=" + (opts.path || "/"));
  if (opts.maxAge !== undefined) parts.push("Max-Age=" + opts.maxAge);
  if (opts.httpOnly !== false) parts.push("HttpOnly");
  parts.push("SameSite=" + (opts.sameSite || "Lax"));
  if (opts.secure !== false) parts.push("Secure");
  if (opts.expires) parts.push("Expires=" + opts.expires.toUTCString());
  return parts.join("; ");
}

module.exports = { parseCookies: parseCookies, serializeCookie: serializeCookie };
