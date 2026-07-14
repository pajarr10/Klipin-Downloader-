"use strict";

var azbryDownloader = require("./azbryDownloader");
var azbryNormalizer = require("./azbryNormalizer");

var DEFAULT_TIMEOUT_MS = 60000;

function KlipinDownloader(opts) {
  this.timeout = (opts && opts.timeout) || DEFAULT_TIMEOUT_MS;
  this.azbry = new azbryDownloader.AzbryDownloader({ timeout: this.timeout });
  this.normalizer = azbryNormalizer.instance;
}

/**
 * Main download handler: validates URL, calls Azbry API, normalizes response
 */
KlipinDownloader.prototype.download = async function (url) {
  return this.azbry.download(url, this.normalizer);
};

module.exports = { KlipinDownloader: KlipinDownloader, instance: new KlipinDownloader() };
