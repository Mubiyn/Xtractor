// Service worker: passively captures the auth headers and GraphQL request
// templates that x.com's own web app uses while you browse. Nothing is sent
// anywhere - everything is stored locally in extension storage.

const GRAPHQL_RE = /\/i\/api\/graphql\/([^/]+)\/([^/?]+)/;

// Operations we care about for bookmark export. Capturing the real request the
// page makes means we never hardcode the rotating query IDs or feature flags.
const TRACKED_OPS = new Set([
  "Bookmarks",
  "BookmarkFoldersSlice",
  "BookmarkFolderTimeline",
  "bookmarkFolderTimeline"
]);

// Request headers worth replaying. We deliberately skip cookie/host/etc. -
// cookies are attached automatically via credentials:"include".
const HEADER_ALLOWLIST = new Set([
  "authorization",
  "x-csrf-token",
  "x-twitter-active-user",
  "x-twitter-auth-type",
  "x-twitter-client-language",
  "x-client-transaction-id",
  "content-type"
]);

function parseUrl(url) {
  const m = url.match(GRAPHQL_RE);
  if (!m) return null;
  const u = new URL(url);
  return {
    queryId: m[1],
    operation: m[2],
    base: `${u.origin}${u.pathname}`,
    variables: u.searchParams.get("variables"),
    features: u.searchParams.get("features"),
    fieldToggles: u.searchParams.get("fieldToggles")
  };
}

function collectHeaders(requestHeaders) {
  const out = {};
  for (const h of requestHeaders || []) {
    const name = h.name.toLowerCase();
    if (HEADER_ALLOWLIST.has(name) && h.value) out[name] = h.value;
  }
  return out;
}

async function onBeforeSendHeaders(details) {
  const info = parseUrl(details.url);
  if (!info || !TRACKED_OPS.has(info.operation)) return;

  const headers = collectHeaders(details.requestHeaders);

  // Auth (bearer + csrf + common client headers) is shared across operations.
  if (headers.authorization && headers["x-csrf-token"]) {
    await chrome.storage.session.set({
      auth: { headers, capturedAt: Date.now() }
    });
  }

  // Per-operation template: queryId + the exact feature/variable blobs the app
  // used. We replay these with a modified cursor.
  const { operations = {} } = await chrome.storage.local.get("operations");
  operations[info.operation] = {
    queryId: info.queryId,
    base: info.base,
    variables: info.variables,
    features: info.features,
    fieldToggles: info.fieldToggles,
    capturedAt: Date.now()
  };
  await chrome.storage.local.set({ operations });
}

chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    // Fire-and-forget; listener itself is non-blocking (observational only).
    onBeforeSendHeaders(details).catch((e) => console.warn("[xbe] capture", e));
  },
  {
    urls: [
      "https://x.com/i/api/graphql/*",
      "https://*.x.com/i/api/graphql/*",
      "https://twitter.com/i/api/graphql/*",
      "https://*.twitter.com/i/api/graphql/*"
    ]
  },
  ["requestHeaders", "extraHeaders"]
);

// Let UI pages query readiness without poking storage layout directly.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "xbe:status") {
    Promise.all([
      chrome.storage.session.get("auth"),
      chrome.storage.local.get("operations")
    ]).then(([{ auth }, { operations }]) => {
      sendResponse({
        hasAuth: Boolean(auth && auth.headers && auth.headers.authorization),
        hasBookmarksOp: Boolean(operations && operations.Bookmarks),
        operations: operations || {},
        authCapturedAt: auth ? auth.capturedAt : null
      });
    });
    return true; // async response
  }

  if (msg && msg.type === "xbe:export") {
    openBookmarksAndExport()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => {
        console.warn("[xbe] export", e);
        sendResponse({ ok: false, error: String(e && e.message ? e.message : e) });
      });
    return true;
  }

  return false;
});

function waitForTabComplete(tabId, timeoutMs = 45000) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs;
    function poll() {
      chrome.tabs.get(tabId, (tab) => {
        if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
        if (tab.status === "complete") return resolve(tab);
        if (Date.now() > deadline) return reject(new Error("Timed out waiting for x.com"));
        setTimeout(poll, 300);
      });
    }
    poll();
  });
}

function sendRunInPage(tabId) {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, { type: "xbe:run-in-page" }, (res) => {
      if (chrome.runtime.lastError) return reject(chrome.runtime.lastError);
      resolve(res);
    });
  });
}

async function openBookmarksAndExport() {
  const patterns = ["*://x.com/*", "*://*.x.com/*", "*://twitter.com/*", "*://*.twitter.com/*"];
  const tabs = await chrome.tabs.query({ url: patterns });
  let tab = tabs.find((t) => t.url && /\/i\/bookmarks/.test(t.url));

  if (!tab) {
    tab = await chrome.tabs.create({ url: "https://x.com/i/bookmarks", active: true });
    await waitForTabComplete(tab.id);
    // x.com is a SPA; give it a moment after the load event.
    await new Promise((r) => setTimeout(r, 2500));
  } else {
    await chrome.tabs.update(tab.id, { active: true });
    await waitForTabComplete(tab.id);
  }

  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await sendRunInPage(tab.id);
      return;
    } catch (e) {
      if (attempt >= 5) throw e;
      await new Promise((r) => setTimeout(r, 800));
    }
  }
}
