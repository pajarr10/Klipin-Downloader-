"use strict";

/**
 * Usage:
 *   TELEGRAM_BOT_TOKEN=xxx TELEGRAM_WEBHOOK_SECRET=yyy \
 *     node scripts/set-telegram-webhook.js https://your-domain.vercel.app
 *
 * Registers https://your-domain.vercel.app/api/telegram as the bot's
 * webhook, with the given secret so Telegram requests can be verified.
 */

var https = require("https");

var domain = process.argv[2];
var token = process.env.TELEGRAM_BOT_TOKEN;
var secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!domain) {
  console.error("Penggunaan: node scripts/set-telegram-webhook.js https://domain-kamu.vercel.app");
  process.exit(1);
}
if (!token) {
  console.error("TELEGRAM_BOT_TOKEN belum diset di environment.");
  process.exit(1);
}
if (!secret) {
  console.error("TELEGRAM_WEBHOOK_SECRET belum diset di environment.");
  process.exit(1);
}

var webhookUrl = domain.replace(/\/$/, "") + "/api/telegram";
var payload = JSON.stringify({
  url: webhookUrl,
  secret_token: secret,
  allowed_updates: ["message", "callback_query"]
});

var req = https.request(
  {
    hostname: "api.telegram.org",
    path: "/bot" + token + "/setWebhook",
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Content-Length": Buffer.byteLength(payload)
    }
  },
  function (res) {
    var body = "";
    res.on("data", function (c) {
      body += c;
    });
    res.on("end", function () {
      console.log("Status HTTP:", res.statusCode);
      console.log(body);
    });
  }
);

req.on("error", function (e) {
  console.error("Gagal menghubungi Telegram API:", e.message);
  process.exit(1);
});

req.write(payload);
req.end();
