// Normalizes X's GraphQL timeline JSON into flat, export-friendly records.
// Defensive throughout: X's schema shifts, so we tolerate missing fields.

function findInstructions(json) {
  // Deep-search for any { instructions: [...] } node (bookmark_timeline_v2,
  // bookmark_timeline, folder timelines, etc.).
  const out = [];
  const stack = [json];
  const seen = new Set();
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object" || seen.has(node)) continue;
    seen.add(node);
    if (Array.isArray(node.instructions)) out.push(...node.instructions);
    for (const v of Object.values(node)) {
      if (v && typeof v === "object") stack.push(v);
    }
  }
  return out;
}

function collectEntries(json) {
  const entries = [];
  for (const ins of findInstructions(json)) {
    if (ins && Array.isArray(ins.entries)) entries.push(...ins.entries);
    // TimelineAddToModule / pinned-style single entry instructions.
    if (ins && ins.entry) entries.push(ins.entry);
  }
  return entries;
}

export function extractCursor(json) {
  for (const entry of collectEntries(json)) {
    const content = entry && entry.content;
    if (!content) continue;
    // Top-level cursor entry.
    if (content.cursorType === "Bottom" && content.value) return content.value;
    // Some shapes nest the cursor under itemContent.
    const item = content.itemContent;
    if (item && item.cursorType === "Bottom" && item.value) return item.value;
  }
  return null;
}

function unwrapTweet(result) {
  if (!result) return null;
  if (result.__typename === "TweetWithVisibilityResults" && result.tweet) {
    return result.tweet;
  }
  if (result.tweet && result.tweet.legacy && !result.legacy) return result.tweet;
  return result;
}

function getAuthor(tweet) {
  const userResult =
    tweet &&
    tweet.core &&
    tweet.core.user_results &&
    tweet.core.user_results.result;
  if (!userResult) return { name: null, handle: null, userId: null };
  const legacy = userResult.legacy || {};
  const core = userResult.core || {};
  return {
    name: core.name || legacy.name || null,
    handle: core.screen_name || legacy.screen_name || null,
    userId: userResult.rest_id || null
  };
}

function getText(tweet) {
  const note =
    tweet &&
    tweet.note_tweet &&
    tweet.note_tweet.note_tweet_results &&
    tweet.note_tweet.note_tweet_results.result;
  if (note && note.text) return note.text;
  return (tweet && tweet.legacy && tweet.legacy.full_text) || "";
}

function expandUrls(text, legacy) {
  if (!text || !legacy || !legacy.entities) return text;
  let out = text;
  for (const u of legacy.entities.urls || []) {
    if (u.url && u.expanded_url) out = out.split(u.url).join(u.expanded_url);
  }
  // Strip trailing media t.co links (they point back to the tweet itself).
  const media = (legacy.extended_entities && legacy.extended_entities.media) || [];
  for (const m of media) {
    if (m.url) out = out.split(m.url).join("").trim();
  }
  return out;
}

function getMedia(tweet) {
  const legacy = (tweet && tweet.legacy) || {};
  const media =
    (legacy.extended_entities && legacy.extended_entities.media) ||
    (legacy.entities && legacy.entities.media) ||
    [];
  return media.map((m) => {
    if (m.type === "video" || m.type === "animated_gif") {
      const variants = (m.video_info && m.video_info.variants) || [];
      const best = variants
        .filter((v) => v.bitrate != null)
        .sort((a, b) => b.bitrate - a.bitrate)[0];
      return {
        type: m.type,
        thumbnail: m.media_url_https || null,
        url: (best && best.url) || m.media_url_https || null
      };
    }
    return { type: m.type || "photo", url: m.media_url_https || null };
  });
}

function getLinks(tweet) {
  const legacy = (tweet && tweet.legacy) || {};
  const urls = (legacy.entities && legacy.entities.urls) || [];
  return urls.map((u) => u.expanded_url).filter(Boolean);
}

function normalize(result, depth = 0) {
  const tweet = unwrapTweet(result);
  if (!tweet) return null;
  const legacy = tweet.legacy || {};
  const id = tweet.rest_id || legacy.id_str;
  if (!id) return null;

  const author = getAuthor(tweet);
  const rawText = getText(tweet);
  const text = expandUrls(rawText, legacy);
  const views = tweet.views && tweet.views.count != null ? Number(tweet.views.count) : null;

  let quoted = null;
  if (depth < 1) {
    const qr =
      (tweet.quoted_status_result && tweet.quoted_status_result.result) || null;
    if (qr) quoted = normalize(qr, depth + 1);
  }

  return {
    id: String(id),
    url: author.handle ? `https://x.com/${author.handle}/status/${id}` : `https://x.com/i/status/${id}`,
    text,
    createdAt: legacy.created_at || null,
    author,
    metrics: {
      replies: legacy.reply_count ?? null,
      reposts: legacy.retweet_count ?? null,
      likes: legacy.favorite_count ?? null,
      quotes: legacy.quote_count ?? null,
      bookmarks: legacy.bookmark_count ?? null,
      views
    },
    media: getMedia(tweet),
    links: getLinks(tweet),
    isLongform: Boolean(tweet.note_tweet),
    quoted,
    folder: null
  };
}

// Returns an array of normalized bookmark records from a GraphQL response.
export function extractTweetEntries(json) {
  const records = [];
  for (const entry of collectEntries(json)) {
    const entryId = (entry && entry.entryId) || "";
    if (!entryId.startsWith("tweet-") && !entryId.startsWith("bookmark-")) continue;
    const content = entry.content || {};
    const item = content.itemContent || (content.item && content.item.itemContent);
    const result = item && item.tweet_results && item.tweet_results.result;
    const rec = normalize(result);
    if (rec) records.push(rec);
  }
  return records;
}
