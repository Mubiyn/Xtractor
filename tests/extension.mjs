// Functional test for the pure logic (parser + exporters) using a realistic
// sample GraphQL response. Browser-only files (graphql/db/queryIds/background)
// are validated separately via `node --check`.

import assert from "node:assert/strict";
import { extractTweetEntries, extractCursor } from "../extension/lib/parse.js";
import { EXPORTERS, buildExport, getExporter } from "../extension/lib/exporters/index.js";

// Shim Blob if running on an older Node (Node 18+ has it globally).
if (typeof Blob === "undefined") {
  const { Blob } = await import("node:buffer");
  globalThis.Blob = Blob;
}

function tweetEntry(id, opts = {}) {
  return {
    entryId: `tweet-${id}`,
    content: {
      entryType: "TimelineTimelineItem",
      itemContent: {
        itemType: "TimelineTweet",
        tweet_results: {
          result: opts.visibility
            ? { __typename: "TweetWithVisibilityResults", tweet: opts.tweet }
            : opts.tweet
        }
      }
    }
  };
}

function makeTweet(id, over = {}) {
  return {
    __typename: "Tweet",
    rest_id: id,
    core: {
      user_results: {
        result: {
          rest_id: "55",
          core: { name: "Jane Doe", screen_name: "jane" },
          legacy: { name: "Jane Doe", screen_name: "jane" }
        }
      }
    },
    legacy: {
      id_str: id,
      full_text: "Hello world https://t.co/abc",
      created_at: "Wed Oct 10 20:19:24 +0000 2018",
      favorite_count: 5,
      retweet_count: 2,
      reply_count: 1,
      quote_count: 0,
      bookmark_count: 3,
      entities: { urls: [{ url: "https://t.co/abc", expanded_url: "https://example.com" }] },
      extended_entities: { media: [{ type: "photo", media_url_https: "https://pbs.twimg.com/x.jpg" }] }
    },
    views: { count: "1000" },
    ...over
  };
}

const quoted = makeTweet("999", {
  legacy: {
    id_str: "999",
    full_text: "I am the quoted tweet",
    created_at: "Wed Oct 10 20:19:24 +0000 2018",
    entities: {}
  }
});

const longform = makeTweet("777", {
  note_tweet: {
    note_tweet_results: { result: { text: "A very long article-style note tweet that exceeds 280 chars..." } }
  }
});

const sample = {
  data: {
    bookmark_timeline_v2: {
      timeline: {
        instructions: [
          {
            type: "TimelineAddEntries",
            entries: [
              tweetEntry("123", { tweet: makeTweet("123", { quoted_status_result: { result: quoted } }) }),
              tweetEntry("456", { visibility: true, tweet: makeTweet("456") }),
              tweetEntry("777", { tweet: longform }),
              {
                entryId: "cursor-bottom-1",
                content: { entryType: "TimelineTimelineCursor", cursorType: "Bottom", value: "NEXT_CURSOR_TOKEN" }
              }
            ]
          }
        ]
      }
    }
  }
};

let pass = 0;
const ok = (label) => { pass++; console.log(`  ok - ${label}`); };

// --- Parser ---
const records = extractTweetEntries(sample);
assert.equal(records.length, 3, "should parse 3 tweets");
ok("parses 3 bookmark records");

const byId = Object.fromEntries(records.map((r) => [r.id, r]));
assert.equal(byId["123"].author.handle, "jane");
assert.equal(byId["123"].url, "https://x.com/jane/status/123");
ok("author + url resolved");

assert.ok(byId["123"].text.includes("https://example.com"), "t.co should be expanded");
assert.ok(!byId["123"].text.includes("t.co/abc"), "media t.co stripped");
ok("t.co links expanded and media link stripped");

assert.equal(byId["123"].media[0].url, "https://pbs.twimg.com/x.jpg");
assert.equal(byId["123"].metrics.likes, 5);
assert.equal(byId["123"].metrics.views, 1000);
ok("media + metrics extracted");

assert.ok(byId["123"].quoted && byId["123"].quoted.text.includes("quoted tweet"));
ok("quoted tweet normalized");

assert.equal(byId["456"].id, "456", "TweetWithVisibilityResults unwrapped");
ok("visibility-wrapped tweet unwrapped");

assert.ok(byId["777"].isLongform && byId["777"].text.includes("article-style"));
ok("long-form note tweet text used");

assert.equal(extractCursor(sample), "NEXT_CURSOR_TOKEN");
ok("bottom cursor extracted");

// tag a folder for export filtering
byId["123"].folder = "Reading";

// --- Exporters ---
assert.equal(EXPORTERS.length, 7, "7 exporters registered");
ok("7 export formats registered");

for (const exp of EXPORTERS) {
  const out = buildExport(records, exp.id);
  assert.ok(out.blob && out.blob.size > 0, `${exp.id} produces non-empty blob`);
  assert.ok(out.filename.endsWith("." + exp.ext), `${exp.id} filename ext`);
  assert.equal(out.count, 3, `${exp.id} count`);
  const text = exp.render(records);
  assert.ok(text.includes("jane") || text.includes("Jane"), `${exp.id} contains author`);
  ok(`format "${exp.id}" renders (${out.blob.size} bytes)`);
}

// JSON round-trips
const parsed = JSON.parse(getExporter("json").render(records));
assert.equal(parsed.count, 3);
assert.equal(parsed.bookmarks.length, 3);
ok("JSON export round-trips");

// CSV header + rows
const csv = getExporter("csv").render(records);
assert.ok(csv.split("\r\n").length >= 4, "csv has header + 3 rows");
assert.ok(csv.includes("Reading"), "csv includes folder");
ok("CSV structure + folder column");

// folder filtering
const filtered = buildExport(records, "json", { folder: "Reading" });
assert.equal(filtered.count, 1, "folder filter keeps 1");
ok("folder filtering works");

console.log(`\nAll ${pass} checks passed.`);
