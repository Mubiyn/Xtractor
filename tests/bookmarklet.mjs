// Tests the bookmarklet's pure logic by loading bookmarklet/src.js in a Node
// sandbox (its browser entrypoint stays dormant because window/document are
// absent) and exercising parsing, exporters, and request building.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(__dirname, "..", "bookmarklet", "src.js"), "utf8");

if (typeof Blob === "undefined") {
  const { Blob } = await import("node:buffer");
  globalThis.Blob = Blob;
}

// Load the source and expose the internals we want to test.
const factory = new Function(
  src + "\n;return { normalize, extractTweetEntries, extractCursor, EXPORTERS, buildExport, xbeParseTemplate, xbeBuildUrl, xbeDiscoverOps, xbeSyntheticOp, xbeScrapeQueryIds, xbeEnsureOps, xbeInstallInterceptors, xbeAcquireOps };"
);
const api = factory();

let pass = 0;
const ok = (label) => { pass++; console.log(`  ok - ${label}`); };

// --- sample timeline response ---
function makeTweet(id, over = {}) {
  return {
    __typename: "Tweet",
    rest_id: id,
    core: { user_results: { result: { rest_id: "55", core: { name: "Jane Doe", screen_name: "jane" }, legacy: {} } } },
    legacy: {
      id_str: id,
      full_text: "Hello world https://t.co/abc",
      created_at: "Wed Oct 10 20:19:24 +0000 2018",
      favorite_count: 5, retweet_count: 2, reply_count: 1, quote_count: 0, bookmark_count: 3,
      entities: { urls: [{ url: "https://t.co/abc", expanded_url: "https://example.com" }] },
      extended_entities: { media: [{ type: "photo", media_url_https: "https://pbs.twimg.com/x.jpg" }] }
    },
    views: { count: "1000" },
    ...over
  };
}
function tweetEntry(id, result) {
  return { entryId: `tweet-${id}`, content: { entryType: "TimelineTimelineItem", itemContent: { itemType: "TimelineTweet", tweet_results: { result } } } };
}

const sample = {
  data: { bookmark_timeline_v2: { timeline: { instructions: [{ type: "TimelineAddEntries", entries: [
    tweetEntry("123", makeTweet("123", { quoted_status_result: { result: makeTweet("999", { legacy: { id_str: "999", full_text: "quoted!", entities: {} } }) } })),
    tweetEntry("456", { __typename: "TweetWithVisibilityResults", tweet: makeTweet("456") }),
    tweetEntry("777", makeTweet("777", { note_tweet: { note_tweet_results: { result: { text: "long-form article body" } } } })),
    { entryId: "cursor-bottom-1", content: { entryType: "TimelineTimelineCursor", cursorType: "Bottom", value: "NEXT_CURSOR" } }
  ] }] } } }
};

// --- parser ---
const records = api.extractTweetEntries(sample);
assert.equal(records.length, 3);
ok("parses 3 bookmark records");

const byId = Object.fromEntries(records.map((r) => [r.id, r]));
assert.equal(byId["123"].author.handle, "jane");
assert.equal(byId["123"].url, "https://x.com/jane/status/123");
assert.ok(byId["123"].text.includes("https://example.com") && !byId["123"].text.includes("t.co/abc"));
assert.equal(byId["123"].media[0].url, "https://pbs.twimg.com/x.jpg");
assert.equal(byId["123"].metrics.views, 1000);
assert.ok(byId["123"].quoted && byId["123"].quoted.text === "quoted!");
ok("author, url, link expansion, media, metrics, quoted tweet");

assert.equal(byId["456"].id, "456");
ok("TweetWithVisibilityResults unwrapped");
assert.ok(byId["777"].isLongform && byId["777"].text.includes("long-form"));
ok("long-form note tweet text used");
assert.equal(api.extractCursor(sample), "NEXT_CURSOR");
ok("bottom cursor extracted");

byId["123"].folder = "Reading";

// --- exporters ---
assert.equal(api.EXPORTERS.length, 7);
ok("7 export formats");
for (const exp of api.EXPORTERS) {
  const out = api.buildExport(records, exp.id);
  assert.ok(out.blob.size > 0 && out.filename.endsWith("." + exp.ext) && out.count === 3);
  assert.ok(/jane|Jane/.test(exp.render(records)));
  ok(`format "${exp.id}" renders (${out.blob.size} bytes)`);
}
const csv = api.EXPORTERS.find((e) => e.id === "csv").render(records);
assert.ok(csv.includes("Reading"));
ok("CSV includes folder column");
assert.equal(api.buildExport(records, "json", { folder: "Reading" }).count, 1);
ok("folder filtering works");

// --- request discovery / building ---
const vars = encodeURIComponent(JSON.stringify({ count: 20, includePromotedContent: false }));
const feats = encodeURIComponent(JSON.stringify({ f: true }));
globalThis.performance = {
  getEntriesByType: () => [
    { name: `https://x.com/i/api/graphql/ABC123/Bookmarks?variables=${vars}&features=${feats}` },
    { name: "https://x.com/i/api/graphql/XYZ/SomethingElse" }
  ]
};
const ops = api.xbeDiscoverOps();
assert.equal(ops.Bookmarks.queryId, "ABC123");
ok("discovers Bookmarks queryId from Performance API");

const tpl = api.xbeParseTemplate(ops.Bookmarks);
assert.equal(tpl.queryId, "ABC123");
assert.equal(tpl.variables.count, 20);
const url = api.xbeBuildUrl(tpl, 100, "CURSOR_X");
assert.ok(url.includes("/graphql/ABC123/Bookmarks"));
const built = new URL(url);
const builtVars = JSON.parse(built.searchParams.get("variables"));
assert.equal(builtVars.count, 100);
assert.equal(builtVars.cursor, "CURSOR_X");
assert.equal(built.searchParams.get("features"), JSON.stringify({ f: true }));
ok("builds paginated URL preserving features, updating count+cursor");

// --- bundle-scrape fallback (works anywhere on x.com) ---
globalThis.location = { origin: "https://x.com", hostname: "x.com" };
const syn = api.xbeSyntheticOp("QID9", "Bookmarks");
assert.equal(syn.queryId, "QID9");
assert.ok(api.xbeParseTemplate(syn).base.endsWith("/i/api/graphql/QID9/Bookmarks"));
ok("synthetic op parses into a usable template");

// Mock a loaded JS bundle that contains the query IDs, and no captured request.
globalThis.document = { querySelectorAll: () => [{ src: "https://abs.twimg.com/responsive-web/client-web/bundle.x.js" }] };
globalThis.performance = { getEntriesByType: () => [] };
globalThis.fetch = async (u) => ({
  ok: true,
  text: async () =>
    u.includes("bundle.x.js")
      ? 'a={queryId:"BMK_ID",operationName:"Bookmarks"};b={operationName:"BookmarkFoldersSlice",queryId:"FOLD_ID"};'
      : ""
});
const map = await api.xbeScrapeQueryIds();
assert.equal(map.Bookmarks, "BMK_ID");
assert.equal(map.BookmarkFoldersSlice, "FOLD_ID");
ok("scrapes query IDs from loaded bundles (both orderings)");

const ensured = await api.xbeEnsureOps({}, null);
assert.equal(ensured.Bookmarks.queryId, "BMK_ID");
assert.equal(ensured.BookmarkFoldersSlice.queryId, "FOLD_ID");
ok("xbeEnsureOps synthesizes ops when nothing was captured");

const alreadyHave = await api.xbeEnsureOps({ Bookmarks: { queryId: "KEEP", url: "https://x.com/i/api/graphql/KEEP/Bookmarks?variables=%7B%7D" } }, null);
assert.equal(alreadyHave.Bookmarks.queryId, "KEEP");
ok("xbeEnsureOps keeps captured ops without scraping");

// --- network interception (the robust path) ---
{
  const captured = { ops: {} };
  const calls = [];
  globalThis.window = { fetch: function (u) { calls.push(u); return Promise.resolve({}); }, XMLHttpRequest: function () {} };
  globalThis.window.XMLHttpRequest.prototype = { open: function () {} };
  globalThis.location = { origin: "https://x.com", hostname: "x.com" };
  api.xbeInstallInterceptors(captured);
  // Simulate X's app firing a real Bookmarks GraphQL request through fetch.
  globalThis.window.fetch("https://x.com/i/api/graphql/LIVE_QID/Bookmarks?variables=%7B%7D&features=%7B%7D");
  assert.equal(captured.ops.Bookmarks.queryId, "LIVE_QID", "fetch interceptor captured the Bookmarks queryId");
  assert.equal(calls[0].includes("Bookmarks"), true, "original fetch still invoked (pass-through)");
  // Relative URL should be resolved against origin.
  const xhr = new globalThis.window.XMLHttpRequest();
  globalThis.window.XMLHttpRequest.prototype.open.call(xhr, "GET", "/i/api/graphql/XHR_QID/BookmarkFoldersSlice?variables=%7B%7D");
  assert.equal(captured.ops.BookmarkFoldersSlice.queryId, "XHR_QID", "XHR interceptor captured folder queryId");
  assert.ok(captured.ops.BookmarkFoldersSlice.url.startsWith("https://x.com/"), "relative URL resolved to absolute");
  ok("fetch + XHR interceptors capture live GraphQL ops");
}

// xbeAcquireOps resolves immediately when Performance already has Bookmarks.
{
  const V = encodeURIComponent(JSON.stringify({ count: 20 }));
  globalThis.performance = { getEntriesByType: () => [{ name: `https://x.com/i/api/graphql/PERF_QID/Bookmarks?variables=${V}` }] };
  const ops = await api.xbeAcquireOps(null);
  assert.equal(ops.Bookmarks.queryId, "PERF_QID");
  ok("xbeAcquireOps short-circuits when Performance already has Bookmarks");
}

console.log(`\nAll ${pass} bookmarklet checks passed.`);
