"use strict";

var crypto = require("crypto");
var tg = require("../lib/telegramApi");
var admins = require("../lib/admins");
var analytics = require("../lib/analytics");

var MAX_BODY_BYTES = 1024 * 1024; // 1MB safety cap

/** Constant-time string compare so an invalid secret can't be brute-forced
 *  via response-time differences. Mirrors api/admin/login.js. */
function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  var bufA = Buffer.from(a, "utf8");
  var bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function sendJson(res, status, payload) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

function escapeHtml(str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtNum(n) {
  return Number(n || 0).toLocaleString("id-ID");
}

async function readRawBody(req) {
  if (req.body) {
    return typeof req.body === "string" ? req.body : JSON.stringify(req.body);
  }
  return new Promise(function (resolve, reject) {
    var chunks = [];
    var size = 0;
    req.on("data", function (c) {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error("BODY_TOO_LARGE"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", function () {
      resolve(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", function () {
      resolve("");
    });
  });
}

/* ---------------- menu builders ---------------- */

function mainMenuKeyboard(isOwner) {
  var rows = [
    [{ text: "Analytics", data: "menu:analytics" }, { text: "Download Activity", data: "menu:activity" }],
    [{ text: "Platform Stats", data: "menu:platform" }, { text: "Client Analytics", data: "menu:client" }],
    [{ text: "Monitoring", data: "menu:monitoring" }, { text: "Error Summary", data: "menu:errors" }]
  ];
  if (isOwner) {
    rows.push([{ text: "Admin Management", data: "menu:adminmgmt" }]);
  }
  return tg.buildKeyboard(rows);
}

function backKeyboard() {
  return tg.buildKeyboard([[{ text: "\u2190 Kembali", data: "menu:main" }]]);
}

function adminMgmtKeyboard() {
  return tg.buildKeyboard([
    [{ text: "Daftar Admin", data: "adm:list" }],
    [{ text: "\u2190 Kembali", data: "menu:main" }]
  ]);
}

var MAIN_MENU_TEXT =
  "<b>KLIPIN ADMIN</b>\n\nPilih menu di bawah untuk melihat analytics dan monitoring layanan Klipin.";

/* ---------------- view renderers ---------------- */

async function renderAnalytics() {
  var o = await analytics.getOverview();
  var lines = [
    "<b>ANALYTICS</b>",
    "",
    "Total pengguna: <b>" + fmtNum(o.totalUsers) + "</b>",
    "Total request: <b>" + fmtNum(o.totalRequests) + "</b>",
    "Download berhasil: <b>" + fmtNum(o.totalSuccess) + "</b>",
    "Download gagal: <b>" + fmtNum(o.totalFail) + "</b>",
    "Request hari ini: <b>" + fmtNum(o.requestsToday) + "</b>",
    "Download hari ini: <b>" + fmtNum(o.downloadsToday) + "</b>",
    "Success rate: <b>" + o.successRate + "%</b>",
    "Error rate: <b>" + o.errorRate + "%</b>",
    "Platform terpopuler: <b>" + escapeHtml(o.topPlatform || "-") + "</b>"
  ];
  return lines.join("\n");
}

async function renderActivity() {
  var items = await analytics.getActivity(10);
  if (!items.length) return "<b>DOWNLOAD ACTIVITY</b>\n\nBelum ada aktivitas tercatat.";
  var lines = ["<b>DOWNLOAD ACTIVITY</b> (10 terbaru)", ""];
  items.forEach(function (it) {
    var time = new Date(it.t).toISOString().replace("T", " ").slice(0, 19);
    var mark = it.status ? "OK" : "GAGAL";
    lines.push(
      "\u2022 " +
        time +
        " UTC | " +
        escapeHtml(it.platform || "-") +
        " | " +
        escapeHtml(it.type || "-") +
        " | " +
        mark +
        (it.title ? "\n  " + escapeHtml(it.title) : "")
    );
  });
  return lines.join("\n");
}

async function renderPlatform() {
  var stats = await analytics.getPlatformStats();
  if (!stats.length) return "<b>PLATFORM STATS</b>\n\nBelum ada data.";
  var lines = ["<b>PLATFORM STATS</b>", ""];
  stats.forEach(function (s) {
    lines.push("\u2022 " + escapeHtml(s.platform) + ": <b>" + fmtNum(s.count) + "</b> (" + s.percent + "%)");
  });
  return lines.join("\n");
}

async function renderClient() {
  var c = await analytics.getClientStats();
  var lines = ["<b>CLIENT ANALYTICS</b>", "", "<b>Browser</b>"];
  (c.browser.length ? c.browser : [{ key: "-", count: 0 }]).forEach(function (b) {
    lines.push("\u2022 " + escapeHtml(b.key) + ": " + fmtNum(b.count));
  });
  lines.push("", "<b>OS</b>");
  (c.os.length ? c.os : [{ key: "-", count: 0 }]).forEach(function (o) {
    lines.push("\u2022 " + escapeHtml(o.key) + ": " + fmtNum(o.count));
  });
  lines.push("", "<b>Device</b>");
  (c.device.length ? c.device : [{ key: "-", count: 0 }]).forEach(function (d) {
    lines.push("\u2022 " + escapeHtml(d.key) + ": " + fmtNum(d.count));
  });
  return lines.join("\n");
}

async function renderMonitoring() {
  var m = await analytics.getMonitoring();
  var lines = [
    "<b>MONITORING</b>",
    "",
    "API status: <b>" + m.apiStatus + "</b>",
    "Downloader status: <b>" + m.downloaderStatus + "</b>",
    "Total request: <b>" + fmtNum(m.totalRequests) + "</b>",
    "Success rate: <b>" + m.successRate + "%</b>",
    "Error rate: <b>" + m.errorRate + "%</b>",
    "Rata-rata waktu proses: <b>" + fmtNum(m.avgResponseMs) + " ms</b>",
    "Jumlah timeout: <b>" + fmtNum(m.timeouts) + "</b>",
    "Dicek pada: <b>" + m.checkedAt + "</b>"
  ];
  if (m.recentErrors.length) {
    lines.push("", "<b>Error terbaru</b>");
    m.recentErrors.forEach(function (e) {
      lines.push("\u2022 " + escapeHtml(e.platform || "-") + ": " + escapeHtml(e.message));
    });
  }
  return lines.join("\n");
}

async function renderErrors() {
  var errs = await analytics.getErrorSummary(10);
  if (!errs.length) return "<b>ERROR SUMMARY</b>\n\nTidak ada error tercatat.";
  var lines = ["<b>ERROR SUMMARY</b> (10 terbaru)", ""];
  errs.forEach(function (e) {
    var time = new Date(e.t).toISOString().replace("T", " ").slice(0, 19);
    lines.push("\u2022 " + time + " UTC | " + escapeHtml(e.platform || "-") + "\n  " + escapeHtml(e.message));
  });
  return lines.join("\n");
}

async function renderAdminList() {
  var list = await admins.listAdmins();
  var owner = admins.getOwnerId();
  var lines = ["<b>DAFTAR ADMIN</b>", "", "Owner: <code>" + escapeHtml(owner) + "</code>"];
  if (!list.length) {
    lines.push("", "Belum ada admin tambahan.");
  } else {
    lines.push("", "Admin:");
    list.forEach(function (id) {
      lines.push("\u2022 <code>" + escapeHtml(id) + "</code>");
    });
  }
  lines.push(
    "",
    "Tambah admin: <code>/addadmin ID_TELEGRAM</code>",
    "Hapus admin: <code>/removeadmin ID_TELEGRAM</code>"
  );
  return lines.join("\n");
}

/* ---------------- command handlers ---------------- */

async function handleTextCommand(text, userId, chatId, isOwnerUser) {
  var parts = text.trim().split(/\s+/);
  var cmd = parts[0].toLowerCase();

  if (cmd === "/start" || cmd === "/menu") {
    await tg.sendMessage(chatId, MAIN_MENU_TEXT, { reply_markup: mainMenuKeyboard(isOwnerUser) });
    return;
  }

  if (cmd === "/addadmin") {
    if (!isOwnerUser) {
      await tg.sendMessage(chatId, "Hanya owner yang dapat menambah admin.");
      return;
    }
    var targetAdd = parts[1];
    if (!targetAdd || !/^\d+$/.test(targetAdd)) {
      await tg.sendMessage(chatId, "Format: <code>/addadmin ID_TELEGRAM</code>", { parse_mode: "HTML" });
      return;
    }
    try {
      await admins.addAdmin(userId, targetAdd);
      await tg.sendMessage(chatId, "Admin <code>" + escapeHtml(targetAdd) + "</code> berhasil ditambahkan.", {
        parse_mode: "HTML"
      });
    } catch (e) {
      await tg.sendMessage(chatId, "Gagal menambah admin: " + escapeHtml(e.message));
    }
    return;
  }

  if (cmd === "/removeadmin") {
    if (!isOwnerUser) {
      await tg.sendMessage(chatId, "Hanya owner yang dapat menghapus admin.");
      return;
    }
    var targetDel = parts[1];
    if (!targetDel || !/^\d+$/.test(targetDel)) {
      await tg.sendMessage(chatId, "Format: <code>/removeadmin ID_TELEGRAM</code>", { parse_mode: "HTML" });
      return;
    }
    try {
      await admins.removeAdmin(userId, targetDel);
      await tg.sendMessage(chatId, "Admin <code>" + escapeHtml(targetDel) + "</code> berhasil dihapus.", {
        parse_mode: "HTML"
      });
    } catch (e) {
      await tg.sendMessage(chatId, "Gagal menghapus admin: " + escapeHtml(e.message));
    }
    return;
  }

  // Unknown text — nudge toward /start rather than staying silent.
  await tg.sendMessage(chatId, "Perintah tidak dikenal. Ketik /start untuk membuka menu.");
}

async function handleCallback(data, userId, chatId, messageId, isOwnerUser) {
  var text;
  var keyboard = backKeyboard();

  switch (data) {
    case "menu:main":
      text = MAIN_MENU_TEXT;
      keyboard = mainMenuKeyboard(isOwnerUser);
      break;
    case "menu:analytics":
      text = await renderAnalytics();
      break;
    case "menu:activity":
      text = await renderActivity();
      break;
    case "menu:platform":
      text = await renderPlatform();
      break;
    case "menu:client":
      text = await renderClient();
      break;
    case "menu:monitoring":
      text = await renderMonitoring();
      break;
    case "menu:errors":
      text = await renderErrors();
      break;
    case "menu:adminmgmt":
      if (!isOwnerUser) {
        text = "Hanya owner yang dapat mengakses menu ini.";
      } else {
        text = "<b>ADMIN MANAGEMENT</b>\n\nKelola admin Klipin di sini.";
        keyboard = adminMgmtKeyboard();
      }
      break;
    case "adm:list":
      if (!isOwnerUser) {
        text = "Hanya owner yang dapat mengakses menu ini.";
      } else {
        text = await renderAdminList();
        keyboard = adminMgmtKeyboard();
      }
      break;
    default:
      text = "Menu tidak dikenal.";
  }

  await tg.editMessageText(chatId, messageId, text, { reply_markup: keyboard });
}

/* ---------------- main handler ---------------- */

module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "POST") {
    return sendJson(res, 405, { status: false, message: "Metode tidak diizinkan" });
  }

  var expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  var providedSecret = req.headers["x-telegram-bot-api-secret-token"];
  if (!expectedSecret || !timingSafeEqualStr(String(providedSecret || ""), expectedSecret)) {
    return sendJson(res, 401, { status: false, message: "Webhook tidak sah" });
  }

  var raw;
  try {
    raw = await readRawBody(req);
  } catch (e) {
    return sendJson(res, 413, { status: false, message: "Body terlalu besar" });
  }

  var update;
  try {
    update = raw ? JSON.parse(raw) : {};
  } catch (e) {
    return sendJson(res, 400, { status: false, message: "Payload tidak valid" });
  }

  // Always ack Telegram with 200 quickly once we've validated auth+payload,
  // and do the actual work inside a try/catch so a downstream error never
  // turns into a Telegram retry storm.
  sendJson(res, 200, { status: true });

  try {
    var message = update.message;
    var callback = update.callback_query;

    var fromId = (message && message.from && message.from.id) || (callback && callback.from && callback.from.id);
    if (!fromId) return;

    var isAdminUser = await admins.isAdmin(fromId);
    var isOwnerUser = admins.isOwner(fromId);

    if (!isAdminUser) {
      var chatIdDenied = (message && message.chat && message.chat.id) || (callback && callback.message && callback.message.chat && callback.message.chat.id);
      if (chatIdDenied && message && typeof message.text === "string" && message.text.trim() === "/start") {
        await tg.sendMessage(chatIdDenied, "Akses ditolak. Bot ini khusus admin Klipin.");
      }
      if (callback) {
        await tg.answerCallbackQuery(callback.id, { text: "Akses ditolak.", show_alert: true });
      }
      return;
    }

    if (message && typeof message.text === "string") {
      await handleTextCommand(message.text, fromId, message.chat.id, isOwnerUser);
    } else if (callback) {
      await tg.answerCallbackQuery(callback.id);
      await handleCallback(callback.data, fromId, callback.message.chat.id, callback.message.message_id, isOwnerUser);
    }
  } catch (err) {
    console.error("KLIPIN telegram handler error:", err && err.message);
  }
};
