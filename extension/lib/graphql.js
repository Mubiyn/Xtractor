// Talks to X's internal GraphQL bookmarks endpoints by replaying the exact
// request the web app makes (captured by background.js), only changing the
// pagination cursor. Cookies are sent automatically via credentials:"include".

import { resolveOperation, getAuth } from "./queryIds.js";
import { extractCursor, extractTweetEntries } from "./parse.js";

const DEFAULT_HEADERS = {
  "x-twitter-active-user": "yes",
  "x-twitter-auth-type": "OAuth2Session",
  "x-twitter-client-language": "en",
  "content-type": "application/json"
};

// Best-effort fallback feature flags, only used when we could not capture the
// real ones. X may reject these if the schema has moved on; the captured path
// is strongly preferred.
const FALLBACK_FEATURES = {
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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function buildUrl(template, { count, cursor }) {
  let variables;
  try {
    variables = template.variables ? JSON.parse(template.variables) : {};
  } catch {
    variables = {};
  }
  if (count != null) variables.count = count;
  if (cursor) variables.cursor = cursor;
  else delete variables.cursor;
  if (variables.includePromotedContent == null) {
    variables.includePromotedContent = false;
  }

  const features = template.features || JSON.stringify(FALLBACK_FEATURES);
  const url = new URL(template.base);
  url.searchParams.set("variables", JSON.stringify(variables));
  url.searchParams.set("features", features);
  if (template.fieldToggles) {
    url.searchParams.set("fieldToggles", template.fieldToggles);
  }
  return url.toString();
}

async function request(url, authHeaders, { maxRetries = 5, signal } = {}) {
  const headers = { ...DEFAULT_HEADERS, ...authHeaders };
  let attempt = 0;
  while (true) {
    if (signal && signal.aborted) throw new DOMException("Aborted", "AbortError");
    const res = await fetch(url, { headers, credentials: "include", signal });

    if (res.status === 429 || res.status === 503) {
      if (attempt >= maxRetries) {
        throw new Error(`Rate limited (HTTP ${res.status}) after ${attempt} retries`);
      }
      const resetHeader = Number(res.headers.get("x-rate-limit-reset"));
      const now = Math.floor(Date.now() / 1000);
      const waitMs = resetHeader && resetHeader > now
        ? Math.min((resetHeader - now) * 1000, 90_000)
        : Math.min(2 ** attempt * 1000, 60_000);
      attempt += 1;
      await sleep(waitMs);
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Authorization failed (HTTP ${res.status}). Open x.com (logged in), visit your Bookmarks, then retry.`
      );
    }
    if (!res.ok) {
      throw new Error(`Request failed: HTTP ${res.status}`);
    }
    return res.json();
  }
}

async function getReadyContext(operation) {
  const auth = await getAuth();
  if (!auth || !auth.headers || !auth.headers.authorization) {
    throw new Error(
      "Not connected yet. Open x.com while logged in and visit your Bookmarks page once, then return here."
    );
  }
  const template = await resolveOperation(operation);
  if (!template) {
    throw new Error(
      `Could not resolve the "${operation}" request. Visit the matching page on x.com once so the extension can learn it.`
    );
  }
  return { auth, template };
}

// Streams all bookmark entries, paging until exhausted.
// onProgress({ count, page }) is called after each page.
export async function fetchAllBookmarks({ onProgress, signal, perPage = 100 } = {}) {
  const { auth, template } = await getReadyContext("Bookmarks");
  const entries = [];
  let cursor = null;
  let page = 0;
  let prevCursor = null;

  while (true) {
    const url = buildUrl(template, { count: perPage, cursor });
    const json = await request(url, auth.headers, { signal });
    const pageEntries = extractTweetEntries(json);
    entries.push(...pageEntries);
    page += 1;

    if (onProgress) onProgress({ count: entries.length, page });

    const next = extractCursor(json);
    // Stop when there are no more tweets or the cursor stops advancing.
    if (!next || next === prevCursor || pageEntries.length === 0) break;
    prevCursor = cursor;
    cursor = next;
    await sleep(600); // be gentle to avoid rate limits
  }

  return entries;
}

// Returns [{ id, name }] of the user's bookmark folders (Premium feature).
// Returns [] gracefully if folders aren't available.
export async function fetchFolders({ signal } = {}) {
  let ctx;
  try {
    ctx = await getReadyContext("BookmarkFoldersSlice");
  } catch {
    return [];
  }
  const url = buildUrl(ctx.template, { count: 100, cursor: null });
  let json;
  try {
    json = await request(url, ctx.auth.headers, { signal, maxRetries: 2 });
  } catch {
    return [];
  }
  const folders = [];
  const stack = [json];
  // The folders response nests under bookmark_collections; walk defensively.
  while (stack.length) {
    const node = stack.pop();
    if (!node || typeof node !== "object") continue;
    if (node.id && (node.name != null) && node.__typename === "BookmarkCollection") {
      folders.push({ id: String(node.id), name: String(node.name) });
    }
    for (const v of Object.values(node)) {
      if (v && typeof v === "object") stack.push(v);
    }
  }
  // De-dupe by id.
  const seen = new Set();
  return folders.filter((f) => (seen.has(f.id) ? false : seen.add(f.id)));
}

// Maps each tweet id to a folder name by paginating each folder timeline.
// Best-effort: requires the folder-timeline operation to have been captured.
export async function fetchFolderAssignments({ folders, signal, perPage = 100 } = {}) {
  const assignments = {}; // tweetId -> folderName
  if (!folders || !folders.length) return assignments;

  let opName = "BookmarkFolderTimeline";
  let template = await resolveOperation(opName).catch(() => null);
  if (!template) {
    template = await resolveOperation("bookmarkFolderTimeline").catch(() => null);
    opName = "bookmarkFolderTimeline";
  }
  if (!template) return assignments;

  const auth = await getAuth();
  if (!auth) return assignments;

  for (const folder of folders) {
    let cursor = null;
    let prevCursor = null;
    while (true) {
      let vars;
      try {
        vars = template.variables ? JSON.parse(template.variables) : {};
      } catch {
        vars = {};
      }
      vars.bookmark_collection_id = folder.id;
      vars.count = perPage;
      if (cursor) vars.cursor = cursor;
      else delete vars.cursor;

      const url = new URL(template.base);
      url.searchParams.set("variables", JSON.stringify(vars));
      url.searchParams.set("features", template.features || JSON.stringify(FALLBACK_FEATURES));
      if (template.fieldToggles) url.searchParams.set("fieldToggles", template.fieldToggles);

      let json;
      try {
        json = await request(url.toString(), auth.headers, { signal, maxRetries: 2 });
      } catch {
        break;
      }
      const pageEntries = extractTweetEntries(json);
      for (const e of pageEntries) assignments[e.id] = folder.name;

      const next = extractCursor(json);
      if (!next || next === prevCursor || pageEntries.length === 0) break;
      prevCursor = cursor;
      cursor = next;
      await sleep(600);
    }
  }
  return assignments;
}
