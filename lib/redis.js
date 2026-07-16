const { Redis } = require("@upstash/redis");

let redisClient = null;

/**
 * Returns a singleton Upstash Redis client, or null if not configured.
 * The app must keep working (without stats/rate-limit) if Redis env vars
 * are missing, so we never throw here.
 */
function getRedis() {
  if (redisClient) return redisClient;

  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    return null;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

function todayKey() {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Simple fixed-window rate limiter using Redis INCR + EXPIRE.
 * Returns { allowed, remaining, limit }.
 */
async function rateLimit(key, limit, windowSeconds) {
  const redis = getRedis();
  if (!redis) {
    // Fail-open: if Redis is not configured, do not block users.
    return { allowed: true, remaining: limit, limit };
  }

  try {
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, windowSeconds);
    }
    const allowed = count <= limit;
    const remaining = Math.max(0, limit - count);
    return { allowed, remaining, limit };
  } catch (err) {
    // Fail-open on Redis errors so downloader keeps working.
    return { allowed: true, remaining: limit, limit };
  }
}

/**
 * Records a monitoring event. Never throws; monitoring failures must never
 * break the downloader for the end user.
 */
async function recordEvent(event) {
  const redis = getRedis();
  if (!redis) return;

  try {
    const day = todayKey();
    const pipelineOps = [];

    pipelineOps.push(redis.incr("klipin:stats:total"));
    pipelineOps.push(redis.incr(`klipin:stats:day:${day}:total`));

    if (event.status === "success") {
      pipelineOps.push(redis.incr("klipin:stats:success"));
      pipelineOps.push(redis.incr(`klipin:stats:day:${day}:success`));
    } else {
      pipelineOps.push(redis.incr("klipin:stats:failed"));
      pipelineOps.push(redis.incr(`klipin:stats:day:${day}:failed`));
      if (event.errorCode) {
        pipelineOps.push(redis.incr(`klipin:error:${event.errorCode}`));
      }
    }

    if (event.platform) {
      pipelineOps.push(redis.incr(`klipin:platform:${event.platform}`));
    }

    await Promise.all(pipelineOps);

    const entry = JSON.stringify({
      status: event.status,
      platform: event.platform || "unknown",
      mediaCount: event.mediaCount || 0,
      type: event.type || "unknown",
      qualities: event.qualities || [],
      timeMs: event.timeMs || 0,
      errorCode: event.errorCode || null,
      userHash: event.userHash || null,
      date: new Date().toISOString(),
    });

    await redis.lpush("klipin:recent", entry);
    await redis.ltrim("klipin:recent", 0, 49);
    await redis.expire("klipin:recent", 60 * 60 * 24 * 7);
  } catch (err) {
    // Swallow all monitoring errors on purpose.
  }
}

async function getStats() {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const [total, success, failed] = await Promise.all([
      redis.get("klipin:stats:total"),
      redis.get("klipin:stats:success"),
      redis.get("klipin:stats:failed"),
    ]);

    const t = Number(total) || 0;
    const s = Number(success) || 0;
    const f = Number(failed) || 0;
    const rate = t > 0 ? ((s / t) * 100).toFixed(1) : "0.0";

    return { total: t, success: s, failed: f, successRate: rate };
  } catch (err) {
    return null;
  }
}

async function getTodayStats() {
  const redis = getRedis();
  if (!redis) return null;

  try {
    const day = todayKey();
    const [total, success, failed] = await Promise.all([
      redis.get(`klipin:stats:day:${day}:total`),
      redis.get(`klipin:stats:day:${day}:success`),
      redis.get(`klipin:stats:day:${day}:failed`),
    ]);

    return {
      day,
      total: Number(total) || 0,
      success: Number(success) || 0,
      failed: Number(failed) || 0,
    };
  } catch (err) {
    return null;
  }
}

async function getRecentEvents(limit = 10) {
  const redis = getRedis();
  if (!redis) return [];

  try {
    const items = await redis.lrange("klipin:recent", 0, limit - 1);
    return items
      .map((raw) => {
        try {
          return typeof raw === "string" ? JSON.parse(raw) : raw;
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch (err) {
    return [];
  }
}

async function getPlatformCounts(platforms) {
  const redis = getRedis();
  if (!redis) return {};

  try {
    const results = await Promise.all(
      platforms.map((p) => redis.get(`klipin:platform:${p}`))
    );
    const out = {};
    platforms.forEach((p, i) => {
      out[p] = Number(results[i]) || 0;
    });
    return out;
  } catch (err) {
    return {};
  }
}

module.exports = {
  getRedis,
  rateLimit,
  recordEvent,
  getStats,
  getTodayStats,
  getRecentEvents,
  getPlatformCounts,
};
