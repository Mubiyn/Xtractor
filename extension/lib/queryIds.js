// Resolves X's rotating GraphQL query IDs (and feature/variable blobs).
//
// Primary strategy: read what background.js captured from the live web app -
// this is the most robust because it also gives us the exact feature flags.
// Fallback strategy: scrape the query ID out of x.com's JS bundles.

const BUNDLE_CACHE_KEY = "bundleQueryIds";
const BUNDLE_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export async function getCapturedOperation(operation) {
  const { operations } = await chrome.storage.local.get("operations");
  return (operations && operations[operation]) || null;
}

export async function getAuth() {
  const { auth } = await chrome.storage.session.get("auth");
  return auth || null;
}

// --- Fallback: scrape query IDs from the page's JS bundles ---------------

function extractQueryIds(jsText) {
  const ids = {};
  // Matches both `{queryId:"x",operationName:"Y"}` and the reversed order.
  const re =
    /\{queryId:"([^"]+)",operationName:"([^"]+)"|operationName:"([^"]+)",queryId:"([^"]+)"/g;
  let m;
  while ((m = re.exec(jsText)) !== null) {
    if (m[1] && m[2]) ids[m[2]] = m[1];
    else if (m[3] && m[4]) ids[m[3]] = m[4];
  }
  return ids;
}

async function scrapeBundleQueryIds() {
  const res = await fetch("https://x.com/i/bookmarks", {
    credentials: "include"
  });
  const html = await res.text();
  const scriptUrls = Array.from(
    html.matchAll(/https:\/\/abs\.twimg\.com\/responsive-web\/[^"']+\.js/g)
  ).map((m) => m[0]);

  const unique = [...new Set(scriptUrls)];
  const ids = {};
  // Bookmark query IDs typically live in the "main" and "bundle" chunks; scan
  // a bounded number to keep this fast.
  for (const url of unique.slice(0, 40)) {
    try {
      const jsRes = await fetch(url);
      const js = await jsRes.text();
      Object.assign(ids, extractQueryIds(js));
      if (ids.Bookmarks) break;
    } catch {
      /* ignore individual bundle failures */
    }
  }
  return ids;
}

export async function getBundleQueryId(operation) {
  const cached = await chrome.storage.local.get(BUNDLE_CACHE_KEY);
  const entry = cached[BUNDLE_CACHE_KEY];
  if (entry && Date.now() - entry.fetchedAt < BUNDLE_TTL_MS && entry.ids[operation]) {
    return entry.ids[operation];
  }
  const ids = await scrapeBundleQueryIds();
  if (Object.keys(ids).length) {
    await chrome.storage.local.set({
      [BUNDLE_CACHE_KEY]: { ids, fetchedAt: Date.now() }
    });
  }
  return ids[operation] || null;
}

// Returns a usable request template for an operation, preferring captured data.
export async function resolveOperation(operation) {
  const captured = await getCapturedOperation(operation);
  if (captured && captured.queryId) return { ...captured, source: "captured" };

  const queryId = await getBundleQueryId(operation);
  if (queryId) {
    return {
      queryId,
      base: `https://x.com/i/api/graphql/${queryId}/${operation}`,
      variables: null,
      features: null,
      fieldToggles: null,
      source: "bundle"
    };
  }
  return null;
}
