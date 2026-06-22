// Relays bookmarklet export requests to the extension background worker.
// Lets the bookmarklet start an export from any page when the extension is installed.
document.addEventListener("xbe-export-request", () => {
  chrome.runtime.sendMessage({ type: "xbe:export" }, (res) => {
    const handled = Boolean(res && res.ok);
    document.dispatchEvent(new CustomEvent("xbe-export-ack", { detail: { handled } }));
  });
});
