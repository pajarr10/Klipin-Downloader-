"use strict";

/**
 * Minimal Upstash Redis REST client.
 * Uses fetch (available natively on Vercel Node 18+ runtimes) so no extra
 * dependency is required beyond what's already in package.json.
 */

var BASE_URL = process.env.UPSTASH_REDIS_REST_URL;
var TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function isConfigured() {
  return Boolean(BASE_URL && TOKEN);
}

function buildHeaders() {
  return { Authorization: "Bearer " + TOKEN };
}

async function command(parts) {
  if (!isConfigured()) {
    throw new Error("REDIS_NOT_CONFIGURED");
  }
  var path = parts.map(encodeURIComponent).join("/");
  var res = await fetch(BASE_URL + "/" + path, { headers: buildHeaders() });
  if (!res.ok) {
    throw new Error("REDIS_REQUEST_FAILED");
  }
  var body = await res.json();
  return body.result;
}

async function get(key) {
  return command(["get", key]);
}

async function set(key, value, opts) {
  var parts = ["set", key, value];
  if (opts && opts.exSeconds) {
    parts.push("EX", String(opts.exSeconds));
  }
  return command(parts);
}

async function del(key) {
  return command(["del", key]);
}

async function incr(key) {
  return command(["incr", key]);
}

async function expire(key, seconds) {
  return command(["expire", key, String(seconds)]);
}

module.exports = {
  isConfigured: isConfigured,
  get: get,
  set: set,
  del: del,
  incr: incr,
  expire: expire
};
