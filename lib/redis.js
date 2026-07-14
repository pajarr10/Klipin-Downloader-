"use strict";

/**
 * Upstash Redis REST client.
 *
 * Uses POST with a JSON command array (Upstash's "single command" REST
 * form) instead of GET+path-segments, because values here (JSON activity
 * entries, error messages, hashed IPs, etc.) may contain characters that
 * are unsafe to URL-encode reliably across all cases. POST body avoids
 * that entirely and works the same on Vercel's Node runtime (global
 * fetch is available on Node 18+).
 */

var BASE_URL = process.env.UPSTASH_REDIS_REST_URL;
var TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

function isConfigured() {
  return Boolean(BASE_URL && TOKEN);
}

async function call(parts) {
  if (!isConfigured()) {
    var err = new Error("REDIS_NOT_CONFIGURED");
    err.code = "REDIS_NOT_CONFIGURED";
    throw err;
  }
  var res = await fetch(BASE_URL, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + TOKEN,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(parts.map(String))
  });
  if (!res.ok) {
    var text = "";
    try {
      text = await res.text();
    } catch (e) {}
    throw new Error("REDIS_REQUEST_FAILED:" + res.status + (text ? ":" + text.slice(0, 200) : ""));
  }
  var body = await res.json();
  if (body && body.error) {
    throw new Error("REDIS_ERROR:" + body.error);
  }
  return body.result;
}

/* ---------------- strings ---------------- */
async function get(key) {
  return call(["GET", key]);
}
async function set(key, value, opts) {
  var parts = ["SET", key, value];
  if (opts && opts.exSeconds) parts.push("EX", opts.exSeconds);
  return call(parts);
}
async function del(key) {
  return call(["DEL", key]);
}
async function incr(key) {
  return call(["INCR", key]);
}
async function incrby(key, amount) {
  return call(["INCRBY", key, amount]);
}
async function expire(key, seconds) {
  return call(["EXPIRE", key, seconds]);
}

/* ---------------- hashes ---------------- */
async function hset(key, field, value) {
  return call(["HSET", key, field, value]);
}
async function hincrby(key, field, amount) {
  return call(["HINCRBY", key, field, amount]);
}
async function hgetall(key) {
  var flat = await call(["HGETALL", key]);
  var obj = {};
  if (Array.isArray(flat)) {
    for (var i = 0; i < flat.length; i += 2) {
      obj[flat[i]] = flat[i + 1];
    }
  }
  return obj;
}
async function hget(key, field) {
  return call(["HGET", key, field]);
}

/* ---------------- sets ---------------- */
async function sadd(key, member) {
  return call(["SADD", key, member]);
}
async function srem(key, member) {
  return call(["SREM", key, member]);
}
async function smembers(key) {
  var res = await call(["SMEMBERS", key]);
  return Array.isArray(res) ? res : [];
}
async function sismember(key, member) {
  var res = await call(["SISMEMBER", key, member]);
  return res === 1 || res === "1";
}
async function scard(key) {
  var res = await call(["SCARD", key]);
  return Number(res) || 0;
}

/* ---------------- lists ---------------- */
async function lpush(key, value) {
  return call(["LPUSH", key, value]);
}
async function ltrim(key, start, stop) {
  return call(["LTRIM", key, start, stop]);
}
async function lrange(key, start, stop) {
  var res = await call(["LRANGE", key, start, stop]);
  return Array.isArray(res) ? res : [];
}
async function llen(key) {
  var res = await call(["LLEN", key]);
  return Number(res) || 0;
}

/* ---------------- sorted sets ---------------- */
async function zincrby(key, increment, member) {
  return call(["ZINCRBY", key, increment, member]);
}
async function zrevrangeWithScores(key, start, stop) {
  var res = await call(["ZREVRANGE", key, start, stop, "WITHSCORES"]);
  var out = [];
  if (Array.isArray(res)) {
    for (var i = 0; i < res.length; i += 2) {
      out.push({ member: res[i], score: Number(res[i + 1]) || 0 });
    }
  }
  return out;
}

module.exports = {
  isConfigured: isConfigured,
  call: call,
  get: get,
  set: set,
  del: del,
  incr: incr,
  incrby: incrby,
  expire: expire,
  hset: hset,
  hincrby: hincrby,
  hgetall: hgetall,
  hget: hget,
  sadd: sadd,
  srem: srem,
  smembers: smembers,
  sismember: sismember,
  scard: scard,
  lpush: lpush,
  ltrim: ltrim,
  lrange: lrange,
  llen: llen,
  zincrby: zincrby,
  zrevrangeWithScores: zrevrangeWithScores
};
