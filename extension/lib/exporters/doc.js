import { escapeHtml, fmtDate, metricsLine } from "./util.js";
import { X_BOOKMARKS, exportBasename } from "../brand.js";

// Word-compatible HTML saved as .doc. Opens directly in Microsoft Word and can
// be uploaded to Google Docs ("Open with > Google Docs") which converts it to a
// native editable document. This avoids any heavy .docx (OOXML/zip) dependency
// while still producing a real word-processor document.

export const id = "doc";
export const label = "Word / Google Docs (.doc)";
export const ext = "doc";
export const mime = "application/msword";

function entry(r) {
  const name = escapeHtml((r.author && r.author.name) || "Unknown");
  const handle = r.author && r.author.handle ? "@" + escapeHtml(r.author.handle) : "";
  const meta = [fmtDate(r.createdAt), r.folder ? `Folder: ${r.folder}` : "", metricsLine(r.metrics)]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" \u00b7 ");
  const text = escapeHtml(r.text || "").replace(/\n/g, "<br>");
  const links =
    (r.links || []).length
      ? `<p style="font-size:10pt;color:#555;">Links: ${r.links
          .map((u) => `<a href="${escapeHtml(u)}">${escapeHtml(u)}</a>`)
          .join(", ")}</p>`
      : "";
  const quoted = r.quoted
    ? `<blockquote style="border-left:3px solid #ccc;margin:6pt 0;padding-left:10pt;color:#555;">Quoting @${escapeHtml(
        (r.quoted.author && r.quoted.author.handle) || ""
      )}: ${escapeHtml(r.quoted.text || "")}</blockquote>`
    : "";
  return `<div style="margin-bottom:14pt;">
  <p style="margin:0;"><b>${name}</b> <span style="color:#888;">${handle}</span></p>
  <p style="margin:0 0 4pt;font-size:9pt;color:#888;">${meta}</p>
  <p style="margin:0;">${text}</p>
  ${quoted}
  ${links}
  <p style="margin:2pt 0 0;font-size:9pt;"><a href="${escapeHtml(r.url)}">View on X</a></p>
</div>`;
}

export function render(records) {
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><title>${X_BOOKMARKS.label}</title></head>
<body style="font-family:Calibri,Arial,sans-serif;font-size:11pt;">
<h1 style="font-size:18pt;">${X_BOOKMARKS.label}</h1>
<p style="color:#888;">Exported ${escapeHtml(new Date().toISOString())} \u00b7 ${records.length} bookmarks</p>
<hr>
${records.map(entry).join("\n")}
</body></html>`;
}

export function filename() {
  return `${exportBasename()}.doc`;
}
