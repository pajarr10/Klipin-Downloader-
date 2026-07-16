const { sendTelegramMessage } = require("../../lib/telegram");
const {
  getRedis,
  getStats,
  getTodayStats,
  getRecentEvents,
  getPlatformCounts,
} = require("../../lib/redis");

const OWNER_ID = "5641187072";
const OWNER_USERNAME_DISPLAY = "JarzGoslingF"; // display-only, never used for auth

const KNOWN_PLATFORMS = [
  "tiktok",
  "youtube",
  "instagram",
  "douyin",
  "pinterest",
  "facebook",
  "capcut",
  "spotify",
];

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

async function handleCommand(command, chatId) {
  switch (command) {
    case "/start": {
      await sendTelegramMessage(
        chatId,
        `[ KLIPIN MONITOR ]\n\nSTATUS  :: OWNER VERIFIED\nOWNER   :: ${OWNER_USERNAME_DISPLAY}\nBUILD   :: KLIPIN 1.0\n\nKetik /help untuk daftar command.`
      );
      return;
    }

    case "/status": {
      const redis = getRedis();
      const redisOk = redis !== null;
      await sendTelegramMessage(
        chatId,
        `[ KLIPIN STATUS ]\n\nREDIS       :: ${redisOk ? "CONNECTED" : "NOT CONFIGURED"}\nAPI         :: KYZZ (server-side only)\nMONITORING  :: ACTIVE`
      );
      return;
    }

    case "/stats": {
      const stats = await getStats();
      if (!stats) {
        await sendTelegramMessage(chatId, "STATS TIDAK TERSEDIA (Redis belum dikonfigurasi).");
        return;
      }
      await sendTelegramMessage(
        chatId,
        `[ KLIPIN STATS ]\n\nTOTAL    :: ${stats.total}\nSUCCESS  :: ${stats.success}\nFAILED   :: ${stats.failed}\nRATE     :: ${stats.successRate}%`
      );
      return;
    }

    case "/today": {
      const today = await getTodayStats();
      if (!today) {
        await sendTelegramMessage(chatId, "DATA HARI INI TIDAK TERSEDIA.");
        return;
      }
      await sendTelegramMessage(
        chatId,
        `[ KLIPIN TODAY :: ${today.day} ]\n\nTOTAL    :: ${today.total}\nSUCCESS  :: ${today.success}\nFAILED   :: ${today.failed}`
      );
      return;
    }

    case "/errors": {
      const recent = await getRecentEvents(20);
      const errors = recent.filter((e) => e.status === "failed" && e.errorCode);
      if (errors.length === 0) {
        await sendTelegramMessage(chatId, "TIDAK ADA ERROR TERBARU.");
        return;
      }
      const lines = errors
        .slice(0, 10)
        .map((e) => `- ${e.errorCode} (${e.platform || "unknown"})`)
        .join("\n");
      await sendTelegramMessage(chatId, `[ KLIPIN ERRORS ]\n\n${escapeHtml(lines)}`);
      return;
    }

    case "/platforms": {
      const counts = await getPlatformCounts(KNOWN_PLATFORMS);
      const lines = KNOWN_PLATFORMS.map(
        (p) => `${p.toUpperCase().padEnd(10)} :: ${counts[p] || 0}`
      ).join("\n");
      await sendTelegramMessage(chatId, `[ KLIPIN PLATFORMS ]\n\n${lines}`);
      return;
    }

    case "/recent": {
      const recent = await getRecentEvents(10);
      if (recent.length === 0) {
        await sendTelegramMessage(chatId, "BELUM ADA EVENT MONITORING.");
        return;
      }
      const lines = recent
        .map(
          (e) =>
            `[${e.status.toUpperCase()}] ${(e.platform || "unknown").toUpperCase()} :: ${e.mediaCount || 0} media :: ${e.timeMs || 0}ms`
        )
        .join("\n");
      await sendTelegramMessage(chatId, `[ KLIPIN RECENT ]\n\n${escapeHtml(lines)}`);
      return;
    }

    case "/help": {
      await sendTelegramMessage(
        chatId,
        `[ KLIPIN MONITOR :: COMMANDS ]\n\n/start\n/status\n/stats\n/today\n/errors\n/platforms\n/recent\n/help`
      );
      return;
    }

    default: {
      await sendTelegramMessage(chatId, "COMMAND TIDAK DIKENALI. Ketik /help.");
      return;
    }
  }
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false });
  }

  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const providedSecret = req.headers["x-telegram-bot-api-secret-token"];

  if (!expectedSecret || providedSecret !== expectedSecret) {
    // Reject silently with 401; do not leak details about why.
    return res.status(401).json({ ok: false });
  }

  const update = req.body;

  try {
    const message = update && update.message;
    if (!message || !message.from || !message.text) {
      // Nothing actionable, acknowledge and ignore.
      return res.status(200).json({ ok: true });
    }

    const senderId = String(message.from.id);

    if (senderId !== OWNER_ID) {
      // Never process commands, never leak info, just acknowledge.
      return res.status(200).json({ ok: true });
    }

    const text = String(message.text).trim();
    const command = text.split(/\s+/)[0].toLowerCase();

    await handleCommand(command, message.chat.id);

    return res.status(200).json({ ok: true });
  } catch (err) {
    // Never expose internal error details to the webhook caller.
    return res.status(200).json({ ok: true });
  }
};
