"use strict";

function getApiBase() {
  var token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN_NOT_CONFIGURED");
  }
  return "https://api.telegram.org/bot" + token;
}

async function callTelegram(method, payload) {
  var res = await fetch(getApiBase() + "/" + method, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  var body = await res.json().catch(function () {
    return null;
  });
  if (!res.ok || !body || body.ok === false) {
    var desc = (body && body.description) || "TELEGRAM_API_ERROR";
    throw new Error(desc);
  }
  return body.result;
}

function sendMessage(chatId, text, opts) {
  var payload = Object.assign(
    {
      chat_id: chatId,
      text: text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    },
    opts || {}
  );
  return callTelegram("sendMessage", payload);
}

function editMessageText(chatId, messageId, text, opts) {
  var payload = Object.assign(
    {
      chat_id: chatId,
      message_id: messageId,
      text: text,
      parse_mode: "HTML",
      disable_web_page_preview: true
    },
    opts || {}
  );
  return callTelegram("editMessageText", payload);
}

function answerCallbackQuery(callbackQueryId, opts) {
  var payload = Object.assign({ callback_query_id: callbackQueryId }, opts || {});
  return callTelegram("answerCallbackQuery", payload);
}

function setWebhook(url, secretToken) {
  return callTelegram("setWebhook", {
    url: url,
    secret_token: secretToken,
    allowed_updates: ["message", "callback_query"]
  });
}

/** Builds a Telegram inline_keyboard from a 2D array of {text, data}. */
function buildKeyboard(rows) {
  return {
    inline_keyboard: rows.map(function (row) {
      return row.map(function (btn) {
        return { text: btn.text, callback_data: btn.data };
      });
    })
  };
}

module.exports = {
  sendMessage: sendMessage,
  editMessageText: editMessageText,
  answerCallbackQuery: answerCallbackQuery,
  setWebhook: setWebhook,
  buildKeyboard: buildKeyboard
};
