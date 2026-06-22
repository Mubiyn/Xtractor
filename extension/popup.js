function setStatus(connected, text) {
  const dot = document.getElementById("pDot");
  dot.className = "dot " + (connected ? "ok" : "wait");
  document.getElementById("pText").textContent = text;
}

chrome.runtime.sendMessage({ type: "xbe:status" }, (status) => {
  if (chrome.runtime.lastError || !status) {
    setStatus(false, "Open x.com and visit your Bookmarks.");
    return;
  }
  if (status.hasAuth && status.hasBookmarksOp) {
    setStatus(true, "Connected. Ready to export.");
  } else if (status.hasAuth) {
    setStatus(false, "Visit your Bookmarks page once.");
  } else {
    setStatus(false, "Open x.com (logged in) first.");
  }
});

document.getElementById("exportBtn").addEventListener("click", () => {
  const btn = document.getElementById("exportBtn");
  btn.disabled = true;
  btn.textContent = "Opening X…";
  chrome.runtime.sendMessage({ type: "xbe:export" }, (res) => {
    if (chrome.runtime.lastError || !res || !res.ok) {
      btn.disabled = false;
      btn.textContent = "Export now";
      return;
    }
    window.close();
  });
});

document.getElementById("openBtn").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});
