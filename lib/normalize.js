/**
 * Normalized shape:
 * {
 *   platform,
 *   title,
 *   author,
 *   thumbnail,
 *   photos: string[],
 *   medias: [{ type: "video"|"audio", label: string, url: string }]
 * }
 */

function isString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function pick(obj, keys) {
  for (var i = 0; i < keys.length; i++) {
    var v = obj && obj[keys[i]];
    if (isString(v)) return v;
  }
  return null;
}

function addMedia(out, value, type, label) {
  if (!isString(value)) return;

  out.push({
    type: type,
    label: label,
    url: value
  });
}

function collectMediaCandidates(node, out, depth) {
  if (!node || depth > 5) return;

  if (Array.isArray(node)) {
    node.forEach(function (item) {
      collectMediaCandidates(item, out, depth + 1);
    });
    return;
  }

  if (typeof node !== "object") return;

  addMedia(out, node.videoHD, "video", "HD");
  addMedia(out, node.video, "video", "VIDEO");
  addMedia(out, node.audio, "audio", "MP3");

  var url =
    node.url ||
    node.download_url ||
    node.downloadUrl ||
    node.link ||
    node.play;

  if (isString(url)) {
    var rawType = String(node.type || node.format || "").toLowerCase();

    out.push({
      type:
        rawType.indexOf("audio") !== -1 ||
        rawType.indexOf("mp3") !== -1
          ? "audio"
          : "video",
      label: String(
        node.quality ||
        node.resolution ||
        node.label ||
        node.type ||
        "VIDEO"
      ).toUpperCase(),
      url: url
    });
  }

  [
    "videos",
    "result",
    "data",
    "media",
    "medias"
  ].forEach(function (key) {
    if (node[key] && node[key] !== node) {
      collectMediaCandidates(node[key], out, depth + 1);
    }
  });
}

function collectPhotoCandidates(node) {
  var photos = [];

  function collect(arr) {
    if (!Array.isArray(arr)) return;

    arr.forEach(function (item) {
      if (isString(item)) {
        photos.push(item);
      } else if (item && isString(item.url)) {
        photos.push(item.url);
      }
    });
  }

  collect(node.photo);
  collect(node.photos);
  collect(node.images);
  collect(node.slideshow);

  if (node.data) {
    collect(node.data.photo);
    collect(node.data.photos);
    collect(node.data.images);
  }

  return photos;
}

function normalizeUpstreamResponse(raw) {
  if (!raw || typeof raw !== "object") return null;

  var root =
    raw.data && typeof raw.data === "object"
      ? raw.data
      : raw;

  var title = pick(root, [
    "title",
    "desc",
    "description",
    "caption",
    "text"
  ]);

  var author = pick(root, [
    "author",
    "username",
    "nickname",
    "uploader",
    "channel"
  ]);

  var thumbnail = pick(root, [
    "thumbnail",
    "thumb",
    "cover",
    "image",
    "poster"
  ]);

  var platform = pick(root, [
    "platform",
    "source",
    "provider"
  ]);

  var medias = [];

  collectMediaCandidates(root, medias, 0);

  var seen = new Set();

  medias = medias.filter(function (media) {
    if (!isString(media.url)) return false;
    if (seen.has(media.url)) return false;

    seen.add(media.url);
    return true;
  });

  var photos = collectPhotoCandidates(root);

  if (!medias.length && !photos.length) {
    return null;
  }

  return {
    platform: platform,
    title: title,
    author: author,
    thumbnail: thumbnail,
    photos: photos,
    medias: medias
  };
}

module.exports = {
  normalizeUpstreamResponse: normalizeUpstreamResponse
};