// Extractor bookmarklet — X · Bookmarks runtime.
// Runs inside an x.com tab. Discovers the live Bookmarks GraphQL request from
// the Performance API (queryId + feature flags), replays it with your session
// cookies to fetch every bookmark, then lets you download in many formats.
// No servers, no copying, no extension.

var XBE_APP_NAME = "Extractor";
var XBE_EXPORT_LABEL = "X \u00b7 Bookmarks";
function xbeExportBasename() {
  return "extractor-x-bookmarks-" + xbeSlug();
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
var XBE_BEARER = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs=1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";

var XBE_FALLBACK_FEATURES = {
  graphql_timeline_v2_bookmark_timeline: true,
  responsive_web_graphql_exclude_directive_enabled: true,
  verified_phone_label_enabled: false,
  creator_subscriptions_tweet_preview_api_enabled: true,
  responsive_web_graphql_timeline_navigation_enabled: true,
  responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
  c9s_tweet_anatomy_moderator_badge_enabled: true,
  tweetypie_unmention_optimization_enabled: true,
  responsive_web_edit_tweet_api_enabled: true,
  graphql_is_translatable_rweb_tweet_is_translatable_enabled: true,
  view_counts_everywhere_api_enabled: true,
  longform_notetweets_consumption_enabled: true,
  responsive_web_twitter_article_tweet_consumption_enabled: true,
  tweet_awards_web_tipping_enabled: false,
  freedom_of_speech_not_reach_fetch_enabled: true,
  standardized_nudges_misinfo: true,
  tweet_with_visibility_results_prefer_gql_limited_actions_policy_enabled: true,
  rweb_video_timestamps_enabled: true,
  longform_notetweets_rich_text_read_enabled: true,
  longform_notetweets_inline_media_enabled: true,
  responsive_web_enhance_cards_enabled: false
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
function xbeEscapeHtml(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function xbeFmtDate(s) {
  if (!s) return "";
  var d = new Date(s);
  return isNaN(d) ? String(s) : d.toISOString();
}
function xbeMetricsLine(m) {
  if (!m) return "";
  var p = [];
  if (m.likes != null) p.push(m.likes + " likes");
  if (m.reposts != null) p.push(m.reposts + " reposts");
  if (m.replies != null) p.push(m.replies + " replies");
  if (m.views != null) p.push(m.views + " views");
  return p.join(" \u00b7 ");
}
function xbeSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}
function xbeSleep(ms) {
  return new Promise(function (r) { setTimeout(r, ms); });
}

// ---------------------------------------------------------------------------
// Parsing (normalizes X's timeline JSON into flat records)
// ---------------------------------------------------------------------------
function xbeFindInstructions(json) {
  var out = [];
  var stack = [json];
  var seen = new Set();
  while (stack.length) {
    var node = stack.pop();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node.instructions)) out.push.apply(out, node.instructions);
    for (var k in node) {
      var v = node[k];
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return out;
}
function xbeCollectEntries(json) {
  var entries = [];
  var ins = xbeFindInstructions(json);
  for (var i = 0; i < ins.length; i++) {
    if (ins[i] && Array.isArray(ins[i].entries)) entries.push.apply(entries, ins[i].entries);
    if (ins[i] && ins[i].entry) entries.push(ins[i].entry);
  }
  return entries;
}
function extractCursor(json) {
  var entries = xbeCollectEntries(json);
  for (var i = 0; i < entries.length; i++) {
    var c = entries[i] && entries[i].content;
    if (!c) continue;
    if (c.cursorType === "Bottom" && c.value) return c.value;
    var it = c.itemContent;
    if (it && it.cursorType === "Bottom" && it.value) return it.value;
  }
  return null;
}
function xbeUnwrap(result) {
  if (!result) return null;
  if (result.__typename === "TweetWithVisibilityResults" && result.tweet) return result.tweet;
  if (result.tweet && result.tweet.legacy && !result.legacy) return result.tweet;
  return result;
}
function xbeAuthor(t) {
  var ur = t && t.core && t.core.user_results && t.core.user_results.result;
  if (!ur) return { name: null, handle: null, userId: null };
  var lg = ur.legacy || {};
  var co = ur.core || {};
  return {
    name: co.name || lg.name || null,
    handle: co.screen_name || lg.screen_name || null,
    userId: ur.rest_id || null
  };
}
function xbeText(t) {
  var note = t && t.note_tweet && t.note_tweet.note_tweet_results && t.note_tweet.note_tweet_results.result;
  if (note && note.text) return note.text;
  return (t && t.legacy && t.legacy.full_text) || "";
}
function xbeExpandUrls(text, legacy) {
  if (!text || !legacy || !legacy.entities) return text;
  var out = text;
  var urls = legacy.entities.urls || [];
  for (var i = 0; i < urls.length; i++) {
    if (urls[i].url && urls[i].expanded_url) out = out.split(urls[i].url).join(urls[i].expanded_url);
  }
  var media = (legacy.extended_entities && legacy.extended_entities.media) || [];
  for (var j = 0; j < media.length; j++) {
    if (media[j].url) out = out.split(media[j].url).join("").trim();
  }
  return out;
}
function xbeMedia(t) {
  var lg = (t && t.legacy) || {};
  var media = (lg.extended_entities && lg.extended_entities.media) || (lg.entities && lg.entities.media) || [];
  return media.map(function (m) {
    if (m.type === "video" || m.type === "animated_gif") {
      var variants = (m.video_info && m.video_info.variants) || [];
      var best = variants.filter(function (v) { return v.bitrate != null; })
        .sort(function (a, b) { return b.bitrate - a.bitrate; })[0];
      return { type: m.type, thumbnail: m.media_url_https || null, url: (best && best.url) || m.media_url_https || null };
    }
    return { type: m.type || "photo", url: m.media_url_https || null };
  });
}
function xbeLinks(t) {
  var lg = (t && t.legacy) || {};
  var urls = (lg.entities && lg.entities.urls) || [];
  return urls.map(function (u) { return u.expanded_url; }).filter(Boolean);
}
function normalize(result, depth) {
  depth = depth || 0;
  var t = xbeUnwrap(result);
  if (!t) return null;
  var lg = t.legacy || {};
  var id = t.rest_id || lg.id_str;
  if (!id) return null;
  var author = xbeAuthor(t);
  var text = xbeExpandUrls(xbeText(t), lg);
  var views = t.views && t.views.count != null ? Number(t.views.count) : null;
  var quoted = null;
  if (depth < 1) {
    var qr = (t.quoted_status_result && t.quoted_status_result.result) || null;
    if (qr) quoted = normalize(qr, depth + 1);
  }
  return {
    id: String(id),
    url: author.handle ? "https://x.com/" + author.handle + "/status/" + id : "https://x.com/i/status/" + id,
    text: text,
    createdAt: lg.created_at || null,
    author: author,
    metrics: {
      replies: lg.reply_count != null ? lg.reply_count : null,
      reposts: lg.retweet_count != null ? lg.retweet_count : null,
      likes: lg.favorite_count != null ? lg.favorite_count : null,
      quotes: lg.quote_count != null ? lg.quote_count : null,
      bookmarks: lg.bookmark_count != null ? lg.bookmark_count : null,
      views: views
    },
    media: xbeMedia(t),
    links: xbeLinks(t),
    isLongform: Boolean(t.note_tweet),
    quoted: quoted,
    folder: null
  };
}
function extractTweetEntries(json) {
  var records = [];
  var entries = xbeCollectEntries(json);
  for (var i = 0; i < entries.length; i++) {
    var entryId = (entries[i] && entries[i].entryId) || "";
    if (entryId.indexOf("tweet-") !== 0 && entryId.indexOf("bookmark-") !== 0) continue;
    var content = entries[i].content || {};
    var item = content.itemContent || (content.item && content.item.itemContent);
    var result = item && item.tweet_results && item.tweet_results.result;
    var rec = normalize(result);
    if (rec) records.push(rec);
  }
  return records;
}

// ---------------------------------------------------------------------------
// Exporters
// ---------------------------------------------------------------------------
function xbeRenderJSON(records) {
  return JSON.stringify({ exportedAt: new Date().toISOString(), count: records.length, bookmarks: records }, null, 2);
}
function xbeRenderNDJSON(records) {
  return records.map(function (r) { return JSON.stringify(r); }).join("\n");
}
function xbeCsvCell(v) {
  var s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}
function xbeRenderCSV(records) {
  var cols = ["id", "url", "author_name", "author_handle", "created_at", "text", "folder", "likes", "reposts", "replies", "views", "media_urls", "links"];
  var rows = records.map(function (r) {
    return [
      r.id, r.url, r.author && r.author.name, r.author && r.author.handle, xbeFmtDate(r.createdAt),
      r.text, r.folder || "", r.metrics && r.metrics.likes, r.metrics && r.metrics.reposts,
      r.metrics && r.metrics.replies, r.metrics && r.metrics.views,
      (r.media || []).map(function (m) { return m.url; }).filter(Boolean).join(" "),
      (r.links || []).join(" ")
    ].map(xbeCsvCell).join(",");
  });
  return "\uFEFF" + [cols.join(",")].concat(rows).join("\r\n");
}
function xbeRenderMarkdown(records) {
  function quoted(q) {
    if (!q) return "";
    var who = q.author && q.author.handle ? "@" + q.author.handle : "unknown";
    var text = (q.text || "").split("\n").map(function (l) { return "> " + l; }).join("\n");
    return "\n> **Quoting " + who + "** ([link](" + q.url + "))\n" + text + "\n";
  }
  function entry(r) {
    var who = r.author && r.author.name ? r.author.name : "Unknown";
    var handle = r.author && r.author.handle ? "@" + r.author.handle : "";
    var lines = [];
    lines.push(("## " + who + " " + handle).trim());
    if (r.folder) lines.push("*Folder: " + r.folder + "*");
    if (r.createdAt) lines.push("*" + xbeFmtDate(r.createdAt) + "*");
    lines.push("");
    lines.push(r.text || "");
    lines.push(quoted(r.quoted));
    var media = (r.media || []).map(function (m) { return m.url; }).filter(Boolean);
    if (media.length) { lines.push(""); lines.push(media.map(function (u) { return "![media](" + u + ")"; }).join("\n")); }
    if ((r.links || []).length) { lines.push(""); lines.push("Links: " + r.links.map(function (u) { return "<" + u + ">"; }).join(", ")); }
    var m = xbeMetricsLine(r.metrics);
    lines.push("");
    lines.push("[View on X](" + r.url + ")" + (m ? " \u00b7 " + m : ""));
    return lines.join("\n");
  }
  var header = "# " + XBE_EXPORT_LABEL + "\n\nExported " + new Date().toISOString() + " \u00b7 " + records.length + " bookmarks\n\n---\n";
  return header + records.map(entry).join("\n\n---\n\n") + "\n";
}
function xbeRenderTxt(records) {
  function entry(r, i) {
    var who = r.author && r.author.handle ? "@" + r.author.handle : "unknown";
    var name = r.author && r.author.name ? r.author.name : "";
    var p = [];
    p.push("#" + (i + 1) + " " + name + " (" + who + ")");
    if (r.folder) p.push("Folder: " + r.folder);
    if (r.createdAt) p.push(xbeFmtDate(r.createdAt));
    p.push("");
    p.push(r.text || "");
    if (r.quoted) { p.push(""); p.push("  > Quoting @" + (r.quoted.author && r.quoted.author.handle) + ": " + (r.quoted.text || "")); }
    if ((r.links || []).length) p.push("Links: " + r.links.join(", "));
    var m = xbeMetricsLine(r.metrics);
    if (m) p.push(m);
    p.push("URL: " + r.url);
    return p.join("\n");
  }
  var bar = "------------------------------------------------------------";
  var header = XBE_EXPORT_LABEL.toUpperCase() + "\nExported " + new Date().toISOString() + " - " + records.length + " bookmarks\n============================================================\n";
  return header + records.map(entry).join("\n\n" + bar + "\n\n") + "\n";
}
function xbeLinkify(text) {
  return xbeEscapeHtml(text).replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
}
function xbeRenderHTML(records) {
  function media(r) {
    var items = (r.media || []).filter(function (m) { return m.url; });
    if (!items.length) return "";
    var tags = items.map(function (m) {
      return (m.type === "video" || m.type === "animated_gif")
        ? '<video controls poster="' + xbeEscapeHtml(m.thumbnail || "") + '" src="' + xbeEscapeHtml(m.url) + '"></video>'
        : '<img loading="lazy" src="' + xbeEscapeHtml(m.url) + '" alt="media">';
    }).join("");
    return '<div class="media">' + tags + "</div>";
  }
  function quoted(q) {
    if (!q) return "";
    var who = q.author && q.author.handle ? "@" + xbeEscapeHtml(q.author.handle) : "unknown";
    return '<blockquote class="quoted"><div class="qhead">Quoting ' + who + '</div><div>' + xbeLinkify(q.text || "") + "</div></blockquote>";
  }
  function card(r) {
    var name = xbeEscapeHtml((r.author && r.author.name) || "Unknown");
    var handle = r.author && r.author.handle ? "@" + xbeEscapeHtml(r.author.handle) : "";
    var folder = r.folder ? '<span class="folder">' + xbeEscapeHtml(r.folder) + "</span>" : "";
    return '<article class="card"><header><span class="name">' + name + '</span> <span class="handle">' + handle + "</span> " + folder +
      "<time>" + xbeEscapeHtml(xbeFmtDate(r.createdAt)) + '</time></header><div class="text">' + xbeLinkify(r.text || "") + "</div>" +
      quoted(r.quoted) + media(r) + '<footer><a href="' + xbeEscapeHtml(r.url) + '" target="_blank" rel="noopener">View on X</a> <span class="metrics">' +
      xbeEscapeHtml(xbeMetricsLine(r.metrics)) + "</span></footer></article>";
  }
  return '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>" + XBE_EXPORT_LABEL + " (" + records.length + ')</title><style>:root{color-scheme:light dark}body{font:16px/1.5 -apple-system,system-ui,sans-serif;max-width:720px;margin:0 auto;padding:24px}' +
    ".card{border:1px solid #8884;border-radius:12px;padding:16px;margin:0 0 16px}.card header{font-size:14px;margin-bottom:8px}.name{font-weight:600}" +
    ".handle,time,.metrics{color:#888}.folder{background:#8882;border-radius:6px;padding:1px 8px;font-size:12px}.text{white-space:pre-wrap;word-wrap:break-word}" +
    ".quoted{border-left:3px solid #8884;margin:12px 0;padding:8px 12px;color:#aaa}.media{display:grid;gap:8px;margin-top:12px}.media img,.media video{width:100%;border-radius:10px}" +
    "footer{margin-top:12px;font-size:14px;display:flex;gap:12px}a{color:#1d9bf0;text-decoration:none}</style></head><body><h1>" + XBE_EXPORT_LABEL + "</h1>" +
    '<div class="meta">Exported ' + xbeEscapeHtml(new Date().toISOString()) + " \u00b7 " + records.length + " bookmarks</div>" +
    records.map(card).join("\n") + "</body></html>";
}
function xbeRenderDoc(records) {
  function entry(r) {
    var name = xbeEscapeHtml((r.author && r.author.name) || "Unknown");
    var handle = r.author && r.author.handle ? "@" + xbeEscapeHtml(r.author.handle) : "";
    var meta = [xbeFmtDate(r.createdAt), r.folder ? "Folder: " + r.folder : "", xbeMetricsLine(r.metrics)]
      .filter(Boolean).map(xbeEscapeHtml).join(" \u00b7 ");
    var text = xbeEscapeHtml(r.text || "").replace(/\n/g, "<br>");
    var links = (r.links || []).length
      ? '<p style="font-size:10pt;color:#555;">Links: ' + r.links.map(function (u) { return '<a href="' + xbeEscapeHtml(u) + '">' + xbeEscapeHtml(u) + "</a>"; }).join(", ") + "</p>"
      : "";
    var quoted = r.quoted
      ? '<blockquote style="border-left:3px solid #ccc;margin:6pt 0;padding-left:10pt;color:#555;">Quoting @' + xbeEscapeHtml((r.quoted.author && r.quoted.author.handle) || "") + ": " + xbeEscapeHtml(r.quoted.text || "") + "</blockquote>"
      : "";
    return '<div style="margin-bottom:14pt;"><p style="margin:0;"><b>' + name + '</b> <span style="color:#888;">' + handle + "</span></p>" +
      '<p style="margin:0 0 4pt;font-size:9pt;color:#888;">' + meta + '</p><p style="margin:0;">' + text + "</p>" + quoted + links +
      '<p style="margin:2pt 0 0;font-size:9pt;"><a href="' + xbeEscapeHtml(r.url) + '">View on X</a></p></div>';
  }
  return '<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">' +
    '<head><meta charset="utf-8"><title>' + XBE_EXPORT_LABEL + '</title></head><body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;">' +
    '<h1 style="font-size:18pt;">' + XBE_EXPORT_LABEL + '</h1><p style="color:#888;">Exported ' + xbeEscapeHtml(new Date().toISOString()) + " \u00b7 " + records.length + " bookmarks</p><hr>" +
    records.map(entry).join("\n") + "</body></html>";
}

var EXPORTERS = [
  { id: "json", label: "JSON (structured, full data)", ext: "json", mime: "application/json", render: xbeRenderJSON },
  { id: "ndjson", label: "NDJSON (one record per line)", ext: "ndjson", mime: "application/x-ndjson", render: xbeRenderNDJSON },
  { id: "csv", label: "CSV (Sheets / Excel)", ext: "csv", mime: "text/csv", render: xbeRenderCSV },
  { id: "markdown", label: "Markdown (Obsidian / Notion)", ext: "md", mime: "text/markdown", render: xbeRenderMarkdown },
  { id: "html", label: "HTML (webpage)", ext: "html", mime: "text/html", render: xbeRenderHTML },
  { id: "txt", label: "Plain text", ext: "txt", mime: "text/plain", render: xbeRenderTxt },
  { id: "doc", label: "Word / Google Docs", ext: "doc", mime: "application/msword", render: xbeRenderDoc }
];
function xbeGetExporter(id) {
  for (var i = 0; i < EXPORTERS.length; i++) if (EXPORTERS[i].id === id) return EXPORTERS[i];
  return null;
}
function buildExport(records, formatId, opts) {
  opts = opts || {};
  var exp = xbeGetExporter(formatId);
  if (!exp) throw new Error("Unknown format: " + formatId);
  var rows = opts.folder ? records.filter(function (r) { return r.folder === opts.folder; }) : records;
  var content = exp.render(rows);
  return {
    blob: new Blob([content], { type: exp.mime + ";charset=utf-8" }),
    filename: xbeExportBasename() + "." + exp.ext,
    count: rows.length
  };
}

// ---------------------------------------------------------------------------
// In-page runtime (auth, request discovery, pagination, UI)
// ---------------------------------------------------------------------------
function xbeGetCookie(name) {
  var m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return m ? decodeURIComponent(m[1]) : null;
}

// Read the live GraphQL requests the app already made (queryId + features +
// variables) straight from the Performance API. Same-origin URLs are fully
// visible, so no CORS or bundle scraping is required.
function xbeDiscoverOps() {
  var map = {};
  var entries = (performance.getEntriesByType && performance.getEntriesByType("resource")) || [];
  for (var i = entries.length - 1; i >= 0; i--) {
    var u = entries[i].name;
    var m = u.match(/\/i\/api\/graphql\/([^/]+)\/([^/?]+)/);
    if (m && !map[m[2]]) map[m[2]] = { queryId: m[1], url: u };
  }
  return map;
}

// Builds an op object (compatible with xbeParseTemplate) from a scraped queryId,
// so we can proceed without having captured a live request first.
function xbeSyntheticOp(queryId, operation) {
  return { queryId: queryId, url: location.origin + "/i/api/graphql/" + queryId + "/" + operation + "?variables=%7B%7D" };
}

// Fallback discovery: scrape X's loaded JS bundles for GraphQL query IDs. Lets
// the bookmarklet work from anywhere on x.com, not just the Bookmarks page.
// Degrades gracefully (returns {}) if the CDN blocks reads via CORS.
function xbeScrapeQueryIds() {
  var set = {};
  try {
    var nodes = document.querySelectorAll ? document.querySelectorAll("script[src]") : [];
    for (var i = 0; i < nodes.length; i++) {
      var s = nodes[i].src || nodes[i].getAttribute("src");
      if (s && /abs\.twimg\.com\/responsive-web\//.test(s)) set[s] = 1;
    }
  } catch (e) {}
  var perf = (performance.getEntriesByType && performance.getEntriesByType("resource")) || [];
  for (var j = 0; j < perf.length; j++) {
    var u = perf[j].name;
    if (/abs\.twimg\.com\/responsive-web\/.*\.js(\?|$)/.test(u)) set[u] = 1;
  }
  var list = Object.keys(set).slice(0, 80);
  if (!list.length) return Promise.resolve({});
  return Promise.all(list.map(function (url) {
    return fetch(url).then(function (r) { return r.ok ? r.text() : ""; }).catch(function () { return ""; });
  })).then(function (texts) {
    var map = {};
    for (var k = 0; k < texts.length; k++) {
      var re = /\{queryId:"([^"]+)",operationName:"([^"]+)"|operationName:"([^"]+)",queryId:"([^"]+)"/g;
      var m;
      while ((m = re.exec(texts[k])) !== null) {
        if (m[1] && m[2]) map[m[2]] = m[1];
        else if (m[3] && m[4]) map[m[3]] = m[4];
      }
    }
    return map;
  });
}

// Ensures we have the ops we need (at least Bookmarks). If they weren't captured
// from a live request, scrape them from the bundles and synthesize op objects.
function xbeEnsureOps(ops, ui) {
  if (ops.Bookmarks) return Promise.resolve(ops);
  if (ui) ui.status.textContent = "Finding the bookmarks endpoint\u2026";
  return xbeScrapeQueryIds().then(function (map) {
    if (map.Bookmarks && !ops.Bookmarks) ops.Bookmarks = xbeSyntheticOp(map.Bookmarks, "Bookmarks");
    if (map.BookmarkFoldersSlice && !ops.BookmarkFoldersSlice) ops.BookmarkFoldersSlice = xbeSyntheticOp(map.BookmarkFoldersSlice, "BookmarkFoldersSlice");
    var tl = map.BookmarkFolderTimeline || map.bookmarkFolderTimeline;
    if (tl && !ops.BookmarkFolderTimeline && !ops.bookmarkFolderTimeline) ops.BookmarkFolderTimeline = xbeSyntheticOp(tl, "BookmarkFolderTimeline");
    return ops;
  }).catch(function () { return ops; });
}

// Most robust discovery: monkey-patch fetch + XHR to capture the real GraphQL
// requests X's own app makes (full URL incl. queryId + feature flags). Immune to
// the Performance buffer being cleared and to CSP blocking bundle reads.
function xbeInstallInterceptors(captured) {
  function record(url) {
    var s = String(url || "");
    var m = s.match(/\/i\/api\/graphql\/([^/]+)\/([^/?]+)/);
    if (m) captured.ops[m[2]] = { queryId: m[1], url: s.charAt(0) === "/" ? location.origin + s : s };
  }
  try {
    var of = window.fetch;
    if (of && !of.__xbe) {
      window.fetch = function (input) {
        try { record(typeof input === "string" ? input : (input && input.url)); } catch (e) {}
        return of.apply(this, arguments);
      };
      window.fetch.__xbe = true;
    }
  } catch (e) {}
  try {
    var XHR = window.XMLHttpRequest;
    if (XHR && XHR.prototype && XHR.prototype.open && !XHR.prototype.open.__xbe) {
      var oo = XHR.prototype.open;
      XHR.prototype.open = function (method, url) {
        try { record(url); } catch (e) {}
        return oo.apply(this, arguments);
      };
      XHR.prototype.open.__xbe = true;
    }
  } catch (e) {}
}

// Triggers X's app to issue a fresh Bookmarks request so the interceptor can
// capture it. Scrolls to load the next page, and (once) navigates Home then back
// to Bookmarks via the in-app router, which forces a refetch even with few items.
function xbeTriggerRefetch(state) {
  try {
    window.scrollTo(0, document.documentElement.scrollHeight || 1e7);
    window.dispatchEvent(new Event("scroll"));
  } catch (e) {}
  if (state.nav) return;
  state.nav = true;
  try {
    var home = document.querySelector('a[href="/home"]') || document.querySelector('a[data-testid="AppTabBar_Home_Link"]');
    var goBookmarks = function () {
      var bm = document.querySelector('a[href="/i/bookmarks"]') || document.querySelector('a[href="/i/bookmarks/all"]');
      if (bm) bm.click();
    };
    if (home) { home.click(); setTimeout(goBookmarks, 900); }
  } catch (e) {}
}

// Returns a Promise resolving to ops once Bookmarks is discovered by any method
// (live capture preferred), or after a timeout (with scrape as a last resort).
function xbeAcquireOps(ui) {
  var captured = { ops: {} };
  var perf = xbeDiscoverOps();
  for (var k in perf) captured.ops[k] = perf[k];
  if (captured.ops.Bookmarks) return Promise.resolve(captured.ops);

  xbeInstallInterceptors(captured);
  var state = { nav: false };
  xbeTriggerRefetch(state);

  return new Promise(function (resolve) {
    var waited = 0;
    (function poll() {
      if (captured.ops.Bookmarks) return resolve(captured.ops);
      if (waited >= 15000) {
        return xbeEnsureOps(captured.ops, ui).then(resolve);
      }
      if (ui) ui.status.textContent = "Loading your bookmarks\u2026";
      waited += 500;
      if (waited % 2500 === 0) xbeTriggerRefetch(state);
      setTimeout(poll, 500);
    })();
  });
}

function xbeParseTemplate(op) {
  var url = new URL(op.url);
  var variables = {};
  try { variables = JSON.parse(url.searchParams.get("variables") || "{}"); } catch (e) {}
  return {
    queryId: op.queryId,
    operation: url.pathname.split("/").pop(),
    base: url.origin + url.pathname,
    variables: variables,
    features: url.searchParams.get("features"),
    fieldToggles: url.searchParams.get("fieldToggles")
  };
}

function xbeBuildUrl(tpl, count, cursor) {
  var v = JSON.parse(JSON.stringify(tpl.variables || {}));
  if (count != null) v.count = count;
  if (cursor) v.cursor = cursor; else delete v.cursor;
  if (v.includePromotedContent == null) v.includePromotedContent = false;
  var url = new URL(tpl.base);
  url.searchParams.set("variables", JSON.stringify(v));
  url.searchParams.set("features", tpl.features || JSON.stringify(XBE_FALLBACK_FEATURES));
  if (tpl.fieldToggles) url.searchParams.set("fieldToggles", tpl.fieldToggles);
  return url.toString();
}

function xbeRequest(url, ct0, maxRetries) {
  maxRetries = maxRetries == null ? 5 : maxRetries;
  var headers = {
    authorization: "Bearer " + XBE_BEARER,
    "x-csrf-token": ct0,
    "x-twitter-active-user": "yes",
    "x-twitter-auth-type": "OAuth2Session",
    "x-twitter-client-language": "en",
    "content-type": "application/json"
  };
  var attempt = 0;
  function go() {
    return fetch(url, { headers: headers, credentials: "include" }).then(function (res) {
      if (res.status === 429 || res.status === 503) {
        if (attempt >= maxRetries) throw new Error("Rate limited (HTTP " + res.status + ").");
        var reset = Number(res.headers.get("x-rate-limit-reset"));
        var now = Math.floor(Date.now() / 1000);
        var wait = reset && reset > now ? Math.min((reset - now) * 1000, 90000) : Math.min(Math.pow(2, attempt) * 1000, 60000);
        attempt++;
        return xbeSleep(wait).then(go);
      }
      if (res.status === 401 || res.status === 403) throw new Error("Authorization failed (HTTP " + res.status + "). Make sure you are logged into x.com.");
      if (!res.ok) throw new Error("Request failed: HTTP " + res.status);
      return res.json();
    });
  }
  return go();
}

function xbeFetchAll(tpl, ct0, onProgress) {
  var records = [];
  var cursor = null, prev = null, page = 0;
  function step() {
    var url = xbeBuildUrl(tpl, 100, cursor);
    return xbeRequest(url, ct0).then(function (json) {
      var pageEntries = extractTweetEntries(json);
      records.push.apply(records, pageEntries);
      page++;
      if (onProgress) onProgress(records.length, page);
      var next = extractCursor(json);
      if (!next || next === prev || pageEntries.length === 0) return records;
      prev = cursor; cursor = next;
      return xbeSleep(600).then(step);
    });
  }
  return step();
}

// Best-effort folder mapping (X Premium). Requires that the folder list and a
// folder timeline have already been loaded by the app (so they appear in the
// Performance entries). Silently skipped otherwise.
function xbeFetchFolders(ops, ct0, onProgress) {
  var assignments = {};
  var foldersOp = ops.BookmarkFoldersSlice;
  var timelineOp = ops.BookmarkFolderTimeline || ops.bookmarkFolderTimeline;
  if (!foldersOp || !timelineOp) return Promise.resolve(assignments);

  var foldersTpl = xbeParseTemplate(foldersOp);
  var timelineTpl = xbeParseTemplate(timelineOp);
  var url = xbeBuildUrl(foldersTpl, 100, null);
  return xbeRequest(url, ct0, 2).then(function (json) {
    var folders = [];
    var stack = [json], seen = new Set();
    while (stack.length) {
      var node = stack.pop();
      if (!node || typeof node !== "object" || seen.has(node)) continue;
      seen.add(node);
      if (node.id && node.name != null && node.__typename === "BookmarkCollection") folders.push({ id: String(node.id), name: String(node.name) });
      for (var k in node) if (node[k] && typeof node[k] === "object") stack.push(node[k]);
    }
    var idx = 0;
    function nextFolder() {
      if (idx >= folders.length) return assignments;
      var folder = folders[idx++];
      var cursor = null, prev = null;
      function page() {
        var v = JSON.parse(JSON.stringify(timelineTpl.variables || {}));
        v.bookmark_collection_id = folder.id;
        v.count = 100;
        if (cursor) v.cursor = cursor; else delete v.cursor;
        var u = new URL(timelineTpl.base);
        u.searchParams.set("variables", JSON.stringify(v));
        u.searchParams.set("features", timelineTpl.features || JSON.stringify(XBE_FALLBACK_FEATURES));
        if (timelineTpl.fieldToggles) u.searchParams.set("fieldToggles", timelineTpl.fieldToggles);
        return xbeRequest(u.toString(), ct0, 2).then(function (json) {
          var pe = extractTweetEntries(json);
          for (var i = 0; i < pe.length; i++) assignments[pe[i].id] = folder.name;
          if (onProgress) onProgress(folder.name);
          var next = extractCursor(json);
          if (!next || next === prev || pe.length === 0) return nextFolder();
          prev = cursor; cursor = next;
          return xbeSleep(600).then(page);
        }).catch(function () { return nextFolder(); });
      }
      return page();
    }
    return nextFolder();
  }).catch(function () { return assignments; });
}

// ---------------------------------------------------------------------------
// Overlay UI
// ---------------------------------------------------------------------------
function xbeBuildUI() {
  // Always start fresh: remove any previous panel so re-clicking re-extracts
  // (rather than showing stale, already-downloaded results).
  var existing = document.getElementById("xbe-panel");
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

  var panel = document.createElement("div");
  panel.id = "xbe-panel";
  panel.setAttribute("style", [
    "position:fixed", "top:16px", "right:16px", "z-index:2147483647", "width:320px",
    "background:#15202b", "color:#fff", "border:1px solid #38444d", "border-radius:14px",
    "box-shadow:0 10px 40px rgba(0,0,0,.5)", "font:14px/1.5 -apple-system,system-ui,sans-serif",
    "padding:16px"
  ].join(";"));

  var title = document.createElement("div");
  title.textContent = XBE_APP_NAME;
  title.setAttribute("style", "font-weight:700;font-size:15px;margin-bottom:8px;display:flex;justify-content:space-between;align-items:center");
  var close = document.createElement("span");
  close.textContent = "\u2715";
  close.setAttribute("style", "cursor:pointer;color:#8899a6;padding:0 4px");
  close.addEventListener("click", function () { if (panel.parentNode) panel.parentNode.removeChild(panel); });
  title.appendChild(close);
  panel.appendChild(title);

  var status = document.createElement("div");
  status.id = "xbe-status";
  status.setAttribute("style", "color:#8899a6;margin-bottom:10px");
  status.textContent = "Starting\u2026";
  panel.appendChild(status);

  var barWrap = document.createElement("div");
  barWrap.setAttribute("style", "height:6px;background:#38444d;border-radius:999px;overflow:hidden;margin-bottom:12px");
  var bar = document.createElement("div");
  bar.id = "xbe-bar";
  bar.setAttribute("style", "height:100%;width:30%;background:#1d9bf0;border-radius:999px;transition:width .3s");
  barWrap.appendChild(bar);
  panel.appendChild(barWrap);

  var formatRow = document.createElement("div");
  formatRow.id = "xbe-formats";
  formatRow.setAttribute("style", "display:flex;flex-wrap:wrap;gap:6px");
  panel.appendChild(formatRow);

  var note = document.createElement("div");
  note.setAttribute("style", "color:#8899a6;font-size:11px;margin-top:12px");
  note.textContent = "Runs locally in your browser. Nothing is uploaded.";
  panel.appendChild(note);

  document.body.appendChild(panel);
  return { panel: panel, status: status, bar: bar, formatRow: formatRow };
}

// Runs the full export once we're on x.com and have the ops we need.
function xbeProceed(ops, ct0, ui) {
  var tpl = xbeParseTemplate(ops.Bookmarks);
  var records = [];

  ui.status.textContent = "Fetching bookmarks\u2026";
  xbeFetchAll(tpl, ct0, function (count, page) {
    ui.status.textContent = "Fetched " + count + " bookmarks (page " + page + ")\u2026";
  }).then(function (recs) {
    records = recs;
    ui.status.textContent = "Looking up folders\u2026";
    return xbeFetchFolders(ops, ct0, function (name) {
      ui.status.textContent = "Mapping folder: " + name + "\u2026";
    }).then(function (assignments) {
      for (var i = 0; i < records.length; i++) if (assignments[records[i].id]) records[i].folder = assignments[records[i].id];
    });
  }).then(function () {
    ui.bar.style.width = "100%";
    ui.status.textContent = records.length + " bookmarks ready. Pick a format:";
    EXPORTERS.forEach(function (exp) {
      var btn = document.createElement("button");
      btn.textContent = exp.ext.toUpperCase();
      btn.title = exp.label;
      btn.setAttribute("style", "flex:1 0 auto;min-width:56px;background:#1d9bf0;color:#fff;border:0;border-radius:999px;padding:8px 10px;font-weight:600;cursor:pointer");
      btn.addEventListener("click", function () {
        var out = buildExport(records, exp.id);
        var url = URL.createObjectURL(out.blob);
        var a = document.createElement("a");
        a.href = url; a.download = out.filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
        ui.status.textContent = "Downloaded " + out.count + " as " + out.filename;
      });
      ui.formatRow.appendChild(btn);
    });
  }).catch(function (err) {
    ui.bar.style.background = "#e0245e";
    ui.status.textContent = (err && err.message) ? err.message : String(err);
  });
}

function xbeAskExtension(cb) {
  var done = false;
  var timer = setTimeout(function () { if (!done) cb(false); }, 450);
  function onAck(e) {
    if (!e || !e.detail) return;
    done = true;
    clearTimeout(timer);
    document.removeEventListener("xbe-export-ack", onAck);
    cb(!!e.detail.handled);
  }
  document.addEventListener("xbe-export-ack", onAck);
  try { document.dispatchEvent(new CustomEvent("xbe-export-request")); } catch (err) { onAck({ detail: { handled: false } }); }
}

function xbeRun() {
  // Off x.com: a bookmarklet cannot read X cookies or run on x.com from here
  // (browser same-origin rules). If our extension is installed, its bridge
  // content script hears xbe-export-request and runs the export on x.com for us.
  if (location.hostname.indexOf("x.com") === -1 && location.hostname.indexOf("twitter.com") === -1) {
    xbeAskExtension(function (handled) {
      if (handled) return;
      // No extension: land on Bookmarks in this tab so the next bookmarklet
      // click is already on x.com (one click, not two tabs).
      location.href = "https://x.com/i/bookmarks#xbe-auto";
    });
    return;
  }

  var ct0 = xbeGetCookie("ct0");
  if (!ct0) { alert("Couldn't find your X session. Make sure you are logged into x.com, then try again."); return; }

  var ui = xbeBuildUI();
  if (!ui) return; // panel already open

  // Capture the live Bookmarks request (intercept + trigger a refetch). Robust
  // against cleared Performance history and CSP-blocked bundle reads.
  ui.status.textContent = "Loading your bookmarks\u2026";
  xbeAcquireOps(ui).then(function (ops) {
    if (!ops.Bookmarks) {
      ui.status.textContent = "Couldn't reach the bookmarks API.";
      ui.bar.style.width = "100%";
      ui.bar.style.background = "#f5a623";
      var hint = document.createElement("div");
      hint.setAttribute("style", "color:#8899a6;margin-top:8px;font-size:13px");
      hint.innerHTML = 'Scroll your Bookmarks once, then click again. If it keeps failing, your browser is blocking it (CSP) &mdash; use the <b>browser extension</b> (see README), which always works.';
      ui.formatRow.appendChild(hint);
      return;
    }
    xbeProceed(ops, ct0, ui);
  });
}

// Auto-run only in a real browser. In Node (tests) we just expose internals.
var XBE_IS_BROWSER = (typeof window !== "undefined") && (typeof document !== "undefined") && (typeof location !== "undefined");
if (XBE_IS_BROWSER) { xbeRun(); }
