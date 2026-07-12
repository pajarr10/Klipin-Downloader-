"use strict";

var redis = require("./redis");

// In-memory fallback store, only useful for local dev / single instance.
var memoryStore = new Map();

function getClientIp(req) {
  var fwd = req.headers["x-forwarded-for"];
  if (fwd) return fwd.split(",")[0].trim();
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : "unknown";
}

async function checkRateLimit(req, opts) {
  var limit = (opts && opts.limit) || 12;
  var windowSeconds = (opts && opts.windowSeconds) || 60;
  var scope = (opts && opts.scope) || "default";
  var ip = getClientIp(req);
  var key = "rl:" + scope + ":" + ip;

  if (redis.isConfigured()) {
    try {
      var count = await redis.incr(key);
      if (count === 1) {
        await redis.expire(key, windowSeconds);
      }
      return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
    } catch (e) {
      // fall through to memory store on redis failure
    }
  }

  var now = Date.now();
  var entry = memoryStore.get(key);
  if (!entry || now - entry.start > windowSeconds * 1000) {
    entry = { start: now, count: 0 };
  }
  entry.count += 1;
  memoryStore.set(key, entry);
  return { allowed: entry.count <= limit, remaining: Math.max(0, limit - entry.count) };
}

module.exports = { checkRateLimit: checkRateLimit, getClientIp: getClientIp };
