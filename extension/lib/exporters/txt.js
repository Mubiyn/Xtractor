import { fmtDate, metricsLine } from "./util.js";
import { X_BOOKMARKS, exportBasename } from "../brand.js";

export const id = "txt";
export const label = "Plain text (.txt)";
export const ext = "txt";
export const mime = "text/plain";

function entry(r, i) {
  const who = r.author && r.author.handle ? `@${r.author.handle}` : "unknown";
  const name = r.author && r.author.name ? r.author.name : "";
  const parts = [];
  parts.push(`#${i + 1} ${name} (${who})`);
  if (r.folder) parts.push(`Folder: ${r.folder}`);
  if (r.createdAt) parts.push(fmtDate(r.createdAt));
  parts.push("");
  parts.push(r.text || "");
  if (r.quoted) {
    parts.push("");
    parts.push(`  > Quoting @${r.quoted.author && r.quoted.author.handle}: ${r.quoted.text || ""}`);
  }
  const links = r.links || [];
  if (links.length) parts.push(`Links: ${links.join(", ")}`);
  const m = metricsLine(r.metrics);
  if (m) parts.push(m);
  parts.push(`URL: ${r.url}`);
  return parts.join("\n");
}

export function render(records) {
  const header = `${X_BOOKMARKS.label.toUpperCase()}\nExported ${new Date().toISOString()} - ${records.length} bookmarks\n${"=".repeat(60)}\n`;
  return header + records.map(entry).join("\n\n" + "-".repeat(60) + "\n\n") + "\n";
}

export function filename() {
  return `${exportBasename()}.txt`;
}
