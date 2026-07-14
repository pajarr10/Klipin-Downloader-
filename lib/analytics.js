"use strict";

var redis = require("./redis");
var ipHash = require("./ipHash");
var uaParser = require("./userAgent");

var TOTAL_KEY = "klipin:stats:total";
var PLATFORM_KEY = "klipin:stats:platform";
var BROWSER_KEY = "klipin:stats:browser";
var OS_KEY = "klipin:stats:os";
var DEVICE_KEY = "klipin:stats:device";
var USERS_KEY = "klipin:users";
var ACTIVITY_KEY = "klipin:activity";
var ERRORS_KEY = "klipin:errors";

var ACTIVITY_RETENTION = 200; // keep only the most recent N entries
var ERROR_RETENTION = 50;

function todayKey() {
  var d = new Date();
  return "klipin:stats:daily:" + d.toISOString().slice(0, 10);
}

function safe(fn) {
  return fn().catch(function (e) {
    console.error("KLIPIN analytics error:", e && e.message);
    return null;
  });
}

/**
 * Sanitizes free-text error messages before they're ever stored, so stack
 * traces, file paths, or upstream tokens never end up persisted.
 */
function sanitizeMessage(msg) {
  if (!msg || typeof msg !== "string") return "ERROR_TIDAK_DIKETAHUI";
  var oneLine = msg.split("\n")[0];
  oneLine = oneLine.replace(/https?:\/\/\S+/g, "[url]");
  oneLine = oneLine.replace(/[A-Za-z0-9_-]{24,}/g, "[token]");
  return oneLine.slice(0, 180);
}

/* ---------------- write path ---------------- */

async function recordRequest(req) {
  if (!redis.isConfigured()) return null;
  var ip = ipHash.getClientIp(req);
  var hashed = ipHash.hashIp(ip);
  var ua = uaParser.parseUserAgent(req.headers && req.headers["user-agent"]);

  await Promise.all([
    safe(function () {
      return redis.hincrby(TOTAL_KEY, "requests", 1);
    }),
    safe(function () {
      return redis.hincrby(todayKey(), "requests", 1);
    }),
    safe(function () {
      return redis.sadd(USERS_KEY, hashed);
    }),
    safe(function () {
      return redis.hincrby(BROWSER_KEY, ua.browser, 1);
    }),
    safe(function () {
      return redis.hincrby(OS_KEY, ua.os, 1);
    }),
    safe(function () {
      return redis.hincrby(DEVICE_KEY, ua.device, 1);
    })
  ]);

  return { hashedIp: hashed, ua: ua };
}

async function recordResult(info) {
  if (!redis.isConfigured()) return;
  var status = Boolean(info && info.status);
  var platform = (info && info.platform) || "unknown";
  var title = (info && info.title) || null;
  var type = (info && info.type) || null;
  var ms = info && typeof info.ms === "number" ? info.ms : null;
  var isTimeout = Boolean(info && info.timeout);
  var errorMessage = info && info.errorMessage;

  var tasks = [
    safe(function () {
      return redis.hincrby(TOTAL_KEY, status ? "success" : "fail", 1);
    }),
    safe(function () {
      return redis.hincrby(todayKey(), status ? "success" : "fail", 1);
    })
  ];

  if (status && platform) {
    tasks.push(
      safe(function () {
        return redis.hincrby(PLATFORM_KEY, platform, 1);
      })
    );
  }

  if (typeof ms === "number" && isFinite(ms)) {
    tasks.push(
      safe(function () {
        return redis.hincrby(TOTAL_KEY, "sum_ms", Math.round(ms));
      })
    );
    tasks.push(
      safe(function () {
        return redis.hincrby(TOTAL_KEY, "timed_count", 1);
      })
    );
  }

  if (isTimeout) {
    tasks.push(
      safe(function () {
        return redis.hincrby(TOTAL_KEY, "timeouts", 1);
      })
    );
  }

  var activityEntry = JSON.stringify({
    t: Date.now(),
    platform: platform,
    title: title ? String(title).slice(0, 80) : null,
    type: type,
    status: status
  });
  tasks.push(
    safe(function () {
      return redis.lpush(ACTIVITY_KEY, activityEntry);
    }).then(function () {
      return safe(function () {
        return redis.ltrim(ACTIVITY_KEY, 0, ACTIVITY_RETENTION - 1);
      });
    })
  );

  if (!status) {
    var errorEntry = JSON.stringify({
      t: Date.now(),
      platform: platform,
      message: sanitizeMessage(errorMessage)
    });
    tasks.push(
      safe(function () {
        return redis.lpush(ERRORS_KEY, errorEntry);
      }).then(function () {
        return safe(function () {
          return redis.ltrim(ERRORS_KEY, 0, ERROR_RETENTION - 1);
        });
      })
    );
  }

  await Promise.all(tasks);
}

/* ---------------- read path ---------------- */

function toNum(v) {
  var n = Number(v);
  return isFinite(n) ? n : 0;
}

function pct(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function sortHashDesc(obj) {
  return Object.keys(obj || {})
    .map(function (k) {
      return { key: k, count: toNum(obj[k]) };
    })
    .sort(function (a, b) {
      return b.count - a.count;
    });
}

async function getOverview() {
  var totalHash =
    (await safe(function () {
      return redis.hgetall(TOTAL_KEY);
    })) || {};
  var daily =
    (await safe(function () {
      return redis.hgetall(todayKey());
    })) || {};
  var totalUsers =
    (await safe(function () {
      return redis.scard(USERS_KEY);
    })) || 0;
  var platform = sortHashDesc(
    (await safe(function () {
      return redis.hgetall(PLATFORM_KEY);
    })) || {}
  );

  var totalRequests = toNum(totalHash.requests);
  var totalSuccess = toNum(totalHash.success);
  var totalFail = toNum(totalHash.fail);
  var processed = totalSuccess + totalFail;

  return {
    totalUsers: totalUsers,
    totalRequests: totalRequests,
    totalSuccess: totalSuccess,
    totalFail: totalFail,
    requestsToday: toNum(daily.requests),
    downloadsToday: toNum(daily.success),
    successRate: pct(totalSuccess, processed),
    errorRate: pct(totalFail, processed),
    topPlatform: platform.length ? platform[0].key : null,
    platformBreakdown: platform.slice(0, 5).map(function (p) {
      return { platform: p.key, count: p.count, percent: pct(p.count, totalSuccess || 1) };
    })
  };
}

async function getPlatformStats() {
  var raw =
    (await safe(function () {
      return redis.hgetall(PLATFORM_KEY);
    })) || {};
  var sorted = sortHashDesc(raw);
  var total = sorted.reduce(function (sum, p) {
    return sum + p.count;
  }, 0);
  return sorted.map(function (p) {
    return { platform: p.key, count: p.count, percent: pct(p.count, total || 1) };
  });
}

async function getClientStats() {
  var browser = sortHashDesc(
    (await safe(function () {
      return redis.hgetall(BROWSER_KEY);
    })) || {}
  );
  var os = sortHashDesc(
    (await safe(function () {
      return redis.hgetall(OS_KEY);
    })) || {}
  );
  var device = sortHashDesc(
    (await safe(function () {
      return redis.hgetall(DEVICE_KEY);
    })) || {}
  );
  return { browser: browser, os: os, device: device };
}

async function getMonitoring() {
  var totalHash =
    (await safe(function () {
      return redis.hgetall(TOTAL_KEY);
    })) || {};
  var totalRequests = toNum(totalHash.requests);
  var totalSuccess = toNum(totalHash.success);
  var totalFail = toNum(totalHash.fail);
  var processed = totalSuccess + totalFail;
  var timedCount = toNum(totalHash.timed_count);
  var sumMs = toNum(totalHash.sum_ms);
  var avgMs = timedCount ? Math.round(sumMs / timedCount) : 0;
  var timeouts = toNum(totalHash.timeouts);
  var recentErrors =
    (await safe(function () {
      return redis.lrange(ERRORS_KEY, 0, 2);
    })) || [];

  return {
    apiStatus: "ONLINE",
    downloaderStatus: redis.isConfigured() ? "READY" : "STORAGE_NOT_CONFIGURED",
    totalRequests: totalRequests,
    successRate: pct(totalSuccess, processed),
    errorRate: pct(totalFail, processed),
    avgResponseMs: avgMs,
    timeouts: timeouts,
    recentErrors: recentErrors
      .map(function (raw) {
        try {
          return JSON.parse(raw);
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean),
    checkedAt: new Date().toISOString()
  };
}

async function getActivity(limit) {
  var n = Math.min(Math.max(limit || 10, 1), 50);
  var raw =
    (await safe(function () {
      return redis.lrange(ACTIVITY_KEY, 0, n - 1);
    })) || [];
  return raw
    .map(function (item) {
      try {
        return JSON.parse(item);
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean);
}

async function getErrorSummary(limit) {
  var n = Math.min(Math.max(limit || 10, 1), 50);
  var raw =
    (await safe(function () {
      return redis.lrange(ERRORS_KEY, 0, n - 1);
    })) || [];
  return raw
    .map(function (item) {
      try {
        return JSON.parse(item);
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean);
}

module.exports = {
  recordRequest: recordRequest,
  recordResult: recordResult,
  getOverview: getOverview,
  getPlatformStats: getPlatformStats,
  getClientStats: getClientStats,
  getMonitoring: getMonitoring,
  getActivity: getActivity,
  getErrorSummary: getErrorSummary
};
