import { fetchAllBookmarks, fetchFolders, fetchFolderAssignments } from "./lib/graphql.js";
import { putBookmarks, getAllBookmarks, clearBookmarks, countBookmarks, setMeta } from "./lib/db.js";
import { EXPORTERS, buildExport } from "./lib/exporters/index.js";

const $ = (id) => document.getElementById(id);
let records = [];
let folders = [];
let abortController = null;

function showError(msg) {
  const box = $("errorBox");
  if (!msg) {
    box.hidden = true;
    box.textContent = "";
    return;
  }
  box.hidden = false;
  box.textContent = msg;
}

function setStatus(connected, text) {
  $("statusDot").className = "dot " + (connected ? "ok" : "wait");
  $("statusText").textContent = text;
  $("fetchBtn").disabled = !connected;
  $("connectHint").style.display = connected ? "none" : "";
}

async function refreshStatus() {
  const status = await chrome.runtime.sendMessage({ type: "xbe:status" }).catch(() => null);
  if (status && status.hasAuth && status.hasBookmarksOp) {
    setStatus(true, "Connected to your X session. Ready to fetch.");
  } else if (status && status.hasAuth) {
    setStatus(false, "Auth detected, but visit your Bookmarks page once so we can learn the request.");
  } else {
    setStatus(false, "Not connected yet. Open x.com (logged in) and visit your Bookmarks.");
  }

  const stored = await countBookmarks();
  if (stored > 0) {
    $("loadPrevBtn").hidden = false;
    $("loadPrevBtn").textContent = `Use last fetched data (${stored})`;
  }
}

function populateFormats() {
  const sel = $("formatSel");
  sel.innerHTML = "";
  for (const e of EXPORTERS) {
    const opt = document.createElement("option");
    opt.value = e.id;
    opt.textContent = e.label;
    sel.appendChild(opt);
  }
}

function populateFolders() {
  const sel = $("folderSel");
  sel.innerHTML = '<option value="">All bookmarks</option>';
  const names = [...new Set(records.map((r) => r.folder).filter(Boolean))].sort();
  for (const name of names) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  }
}

function setProgress(text, indeterminate = true, pct = 0) {
  $("progress").hidden = false;
  $("progressText").textContent = text;
  const fill = $("barFill");
  if (indeterminate) {
    fill.classList.add("indeterminate");
  } else {
    fill.classList.remove("indeterminate");
    fill.style.width = `${Math.min(100, pct)}%`;
  }
}

function showExportStep() {
  $("exportStep").hidden = false;
  $("exportCount").textContent = `${records.length} bookmarks ready to export.`;
  populateFolders();
}

async function runFetch() {
  showError("");
  $("fetchBtn").disabled = true;
  abortController = new AbortController();
  const signal = abortController.signal;

  try {
    setProgress("Fetching bookmarks\u2026", true);
    records = await fetchAllBookmarks({
      signal,
      onProgress: ({ count, page }) =>
        setProgress(`Fetched ${count} bookmarks (page ${page})\u2026`, true)
    });

    if ($("foldersChk").checked) {
      setProgress("Looking up folders\u2026", true);
      folders = await fetchFolders({ signal });
      if (folders.length) {
        setProgress(`Mapping ${folders.length} folders\u2026`, true);
        const assignments = await fetchFolderAssignments({ folders, signal });
        for (const r of records) {
          if (assignments[r.id]) r.folder = assignments[r.id];
        }
      }
    }

    setProgress(`Saving ${records.length} bookmarks\u2026`, false, 100);
    await clearBookmarks();
    await putBookmarks(records);
    await setMeta("lastRun", { at: Date.now(), count: records.length });

    $("progress").hidden = true;
    showExportStep();
  } catch (e) {
    if (e && e.name === "AbortError") {
      setProgress("Cancelled.", false, 0);
    } else {
      showError(e && e.message ? e.message : String(e));
      $("progress").hidden = true;
    }
  } finally {
    $("fetchBtn").disabled = false;
  }
}

async function loadPrevious() {
  showError("");
  records = await getAllBookmarks();
  if (!records.length) {
    showError("No previously stored bookmarks found.");
    return;
  }
  showExportStep();
}

function download() {
  showError("");
  try {
    const format = $("formatSel").value;
    const folder = $("folderSel").value || null;
    const { blob, filename, count } = buildExport(records, format, { folder });
    if (count === 0) {
      showError("Nothing to export for this selection.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    $("exportCount").textContent = `Downloaded ${count} bookmarks as ${filename}.`;
  } catch (e) {
    showError(e && e.message ? e.message : String(e));
  }
}

async function clearAll() {
  await clearBookmarks();
  records = [];
  folders = [];
  $("exportStep").hidden = true;
  $("loadPrevBtn").hidden = true;
  showError("");
  $("exportCount").textContent = "Stored data cleared.";
}

$("fetchBtn").addEventListener("click", runFetch);
$("loadPrevBtn").addEventListener("click", loadPrevious);
$("downloadBtn").addEventListener("click", download);
$("clearBtn").addEventListener("click", clearAll);

populateFormats();
refreshStatus();
// Keep status fresh in case the user browses x.com in another tab.
setInterval(refreshStatus, 4000);
