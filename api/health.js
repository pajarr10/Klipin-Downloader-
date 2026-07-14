"use strict";

function sendJson(res, status, payload) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

module.exports = async function handler(req, res) {
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method !== "GET") {
    return sendJson(res, 405, { status: false, message: "Metode tidak diizinkan" });
  }

  return sendJson(res, 200, {
    status: true,
    service: "klipin",
    timestamp: new Date().toISOString()
  });
};
