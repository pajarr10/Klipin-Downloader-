"use strict";

var redis = require("./redis");

var ADMIN_SET_KEY = "klipin:admins";

/**
 * Owner is defined purely by numeric Telegram user ID from environment —
 * never by username (usernames can change) and never stored in Redis, so
 * it can't accidentally be removed via admin-management commands.
 */
function getOwnerId() {
  var raw = process.env.TELEGRAM_OWNER_ID;
  var id = raw ? Number(raw) : NaN;
  return Number.isFinite(id) ? id : null;
}

function isOwner(userId) {
  var owner = getOwnerId();
  return owner !== null && Number(userId) === owner;
}

async function isAdmin(userId) {
  if (isOwner(userId)) return true;
  if (!redis.isConfigured()) return false;
  try {
    return await redis.sismember(ADMIN_SET_KEY, String(userId));
  } catch (e) {
    console.error("KLIPIN admins.isAdmin error:", e && e.message);
    return false;
  }
}

async function listAdmins() {
  if (!redis.isConfigured()) return [];
  try {
    var members = await redis.smembers(ADMIN_SET_KEY);
    return members.map(Number).filter(Number.isFinite);
  } catch (e) {
    console.error("KLIPIN admins.listAdmins error:", e && e.message);
    return [];
  }
}

/**
 * Only callable by the owner (enforced by the caller in api/telegram.js —
 * kept here too as defense in depth).
 */
async function addAdmin(actingUserId, targetUserId) {
  if (!isOwner(actingUserId)) {
    throw new Error("HANYA_OWNER_YANG_BOLEH_MENAMBAH_ADMIN");
  }
  if (!redis.isConfigured()) {
    throw new Error("STORAGE_BELUM_DIKONFIGURASI");
  }
  var target = Number(targetUserId);
  if (!Number.isFinite(target)) {
    throw new Error("TELEGRAM_USER_ID_TIDAK_VALID");
  }
  if (isOwner(target)) {
    throw new Error("OWNER_SUDAH_MEMILIKI_HAK_TERTINGGI");
  }
  await redis.sadd(ADMIN_SET_KEY, String(target));
  return target;
}

async function removeAdmin(actingUserId, targetUserId) {
  if (!isOwner(actingUserId)) {
    throw new Error("HANYA_OWNER_YANG_BOLEH_MENGHAPUS_ADMIN");
  }
  if (!redis.isConfigured()) {
    throw new Error("STORAGE_BELUM_DIKONFIGURASI");
  }
  var target = Number(targetUserId);
  if (!Number.isFinite(target)) {
    throw new Error("TELEGRAM_USER_ID_TIDAK_VALID");
  }
  await redis.srem(ADMIN_SET_KEY, String(target));
  return target;
}

module.exports = {
  getOwnerId: getOwnerId,
  isOwner: isOwner,
  isAdmin: isAdmin,
  listAdmins: listAdmins,
  addAdmin: addAdmin,
  removeAdmin: removeAdmin
};
