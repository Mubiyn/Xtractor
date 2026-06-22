// Runs on x.com: auto-export when opened with #xbe-auto, or when the background
// worker / bookmarklet bridge asks us to inject the in-page exporter.

function xbeInjectRunner() {
  if (document.getElementById("xbe-injected")) return;
  const s = document.createElement("script");
  s.id = "xbe-injected";
  s.src = chrome.runtime.getURL("inject/xbe-page.js");
  s.onerror = () => console.warn("[xbe] failed to load in-page runner");
  (document.head || document.documentElement).appendChild(s);
}

function xbeMaybeAutoRun() {
  if (location.hash === "#xbe-auto" || location.hash.indexOf("xbe-auto") !== -1) {
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    xbeInjectRunner();
  }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg && msg.type === "xbe:run-in-page") {
    xbeInjectRunner();
    sendResponse({ ok: true });
    return false;
  }
  return false;
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", xbeMaybeAutoRun);
} else {
  xbeMaybeAutoRun();
}
