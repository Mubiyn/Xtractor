import { fmtDate, metricsLine } from "./util.js";
import { X_BOOKMARKS, exportBasename } from "../brand.js";

export const id = "markdown";
export const label = "Markdown (Obsidian / Notion / GitHub)";
export const ext = "md";
export const mime = "text/markdown";

function quotedBlock(q) {
  if (!q) return "";
  const who = q.author && q.author.handle ? `@${q.author.handle}` : "unknown";
  const text = (q.text || "").split("\n").map((l) => `> ${l}`).join("\n");
  return `\n> **Quoting ${who}** ([link](${q.url}))\n${text}\n`;
}

function entry(r) {
  const who = r.author && r.author.name ? r.author.name : "Unknown";
  const handle = r.author && r.author.handle ? `@${r.author.handle}` : "";
  const lines = [];
  lines.push(`## ${who} ${handle}`.trim());
  if (r.folder) lines.push(`*Folder: ${r.folder}*`);
  if (r.createdAt) lines.push(`*${fmtDate(r.createdAt)}*`);
  lines.push("");
  lines.push(r.text || "");
  lines.push(quotedBlock(r.quoted));
  const media = (r.media || []).map((m) => m.url).filter(Boolean);
  if (media.length) {
    lines.push("");
    lines.push(media.map((u) => `![media](${u})`).join("\n"));
  }
  const links = r.links || [];
  if (links.length) {
    lines.push("");
    lines.push("Links: " + links.map((u) => `<${u}>`).join(", "));
  }
  const m = metricsLine(r.metrics);
  lines.push("");
  lines.push(`[View on X](${r.url})${m ? ` \u00b7 ${m}` : ""}`);
  return lines.filter((l) => l !== undefined).join("\n");
}

export function render(records) {
  const header = `# ${X_BOOKMARKS.label}\n\nExported ${new Date().toISOString()} \u00b7 ${records.length} bookmarks\n\n---\n`;
  return header + records.map(entry).join("\n\n---\n\n") + "\n";
}

export function filename() {
  return `${exportBasename()}.md`;
}
