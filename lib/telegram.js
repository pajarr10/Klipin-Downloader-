const axios = require("axios");

const TELEGRAM_API = "https://api.telegram.org";

/**
 * Sends a plain-text message to a Telegram chat using the bot token from
 * environment variables. Never throws — callers use this fire-and-forget
 * so a Telegram outage can never break the downloader for end users.
 */
async function sendTelegramMessage(chatId, text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token || !chatId) return;

  try {
    await axios.post(
      `${TELEGRAM_API}/bot${token}/sendMessage`,
      {
        chat_id: chatId,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      },
      { timeout: 5000 }
    );
  } catch (err) {
    // Intentionally swallow errors: monitoring must never affect the user.
  }
}

/**
 * Fire-and-forget notification to the owner. Safe to call from the
 * download handler without awaiting.
 */
function notifyOwner(text) {
  const ownerId = process.env.TELEGRAM_OWNER_ID;
  if (!ownerId) return;
  sendTelegramMessage(ownerId, text).catch(() => {});
}

module.exports = { sendTelegramMessage, notifyOwner };
