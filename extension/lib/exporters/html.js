import { escapeHtml, fmtDate, metricsLine } from "./util.js";
import { X_BOOKMARKS, exportBasename } from "../brand.js";

export const id = "html";
export const label = "HTML (styled webpage)";
export const ext = "html";
export const mime = "text/html";

function linkify(text) {
  return escapeHtml(text).replace(
    /(https?:\/\/[^\s]+)/g,
    '<a href="$1" target="_blank" rel="noopener">$1</a>'
  );
}

function media(r) {
  const items = (r.media || []).filter((m) => m.url);
  if (!items.length) return "";
  const tags = items
    .map((m) =>
      m.type === "video" || m.type === "animated_gif"
        ? `<video controls poster="${escapeHtml(m.thumbnail || "")}" src="${escapeHtml(m.url)}"></video>`
        : `<img loading="lazy" src="${escapeHtml(m.url)}" alt="media">`
    )
    .join("");
  return `<div class="media">${tags}</div>`;
}

function quoted(q) {
  if (!q) return "";
  const who = q.author && q.author.handle ? `@${escapeHtml(q.author.handle)}` : "unknown";
  return `<blockquote class="quoted"><div class="qhead">Quoting ${who}</div><div>${linkify(q.text || "")}</div></blockquote>`;
}

function card(r) {
  const name = escapeHtml((r.author && r.author.name) || "Unknown");
  const handle = r.author && r.author.handle ? "@" + escapeHtml(r.author.handle) : "";
  const folder = r.folder ? `<span class="folder">${escapeHtml(r.folder)}</span>` : "";
  return `<article class="card">
  <header><span class="name">${name}</span> <span class="handle">${handle}</span> ${folder}
  <time>${escapeHtml(fmtDate(r.createdAt))}</time></header>
  <div class="text">${linkify(r.text || "")}</div>
  ${quoted(r.quoted)}
  ${media(r)}
  <footer><a href="${escapeHtml(r.url)}" target="_blank" rel="noopener">View on X</a> <span class="metrics">${escapeHtml(metricsLine(r.metrics))}</span></footer>
</article>`;
}

export function render(records) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${X_BOOKMARKS.label} (${records.length})</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.5 -apple-system, system-ui, sans-serif; max-width: 720px; margin: 0 auto; padding: 24px; }
  h1 { font-size: 22px; }
  .meta { color: #666; margin-bottom: 24px; }
  .card { border: 1px solid #8884; border-radius: 12px; padding: 16px; margin: 0 0 16px; }
  .card header { font-size: 14px; margin-bottom: 8px; }
  .name { font-weight: 600; }
  .handle, time, .metrics { color: #888; }
  .folder { background: #8882; border-radius: 6px; padding: 1px 8px; font-size: 12px; }
  .text { white-space: pre-wrap; word-wrap: break-word; }
  .quoted { border-left: 3px solid #8884; margin: 12px 0; padding: 8px 12px; color: #aaa; }
  .qhead { font-size: 13px; margin-bottom: 4px; }
  .media { display: grid; gap: 8px; margin-top: 12px; }
  .media img, .media video { width: 100%; border-radius: 10px; }
  footer { margin-top: 12px; font-size: 14px; display: flex; gap: 12px; }
  a { color: #1d9bf0; text-decoration: none; }
</style></head>
<body>
<h1>${X_BOOKMARKS.label}</h1>
<div class="meta">Exported ${escapeHtml(new Date().toISOString())} \u00b7 ${records.length} bookmarks</div>
${records.map(card).join("\n")}
</body></html>`;
}

export function filename() {
  return `${exportBasename()}.html`;
}
