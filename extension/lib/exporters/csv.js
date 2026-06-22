import { fmtDate } from "./util.js";
import { exportBasename } from "../brand.js";

export const id = "csv";
export const label = "CSV (spreadsheet / Excel / Google Sheets)";
export const ext = "csv";
export const mime = "text/csv";

const COLUMNS = [
  "id",
  "url",
  "author_name",
  "author_handle",
  "created_at",
  "text",
  "folder",
  "likes",
  "reposts",
  "replies",
  "views",
  "media_urls",
  "links"
];

function cell(value) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function row(r) {
  return [
    r.id,
    r.url,
    r.author && r.author.name,
    r.author && r.author.handle,
    fmtDate(r.createdAt),
    r.text,
    r.folder || "",
    r.metrics && r.metrics.likes,
    r.metrics && r.metrics.reposts,
    r.metrics && r.metrics.replies,
    r.metrics && r.metrics.views,
    (r.media || []).map((m) => m.url).filter(Boolean).join(" "),
    (r.links || []).join(" ")
  ]
    .map(cell)
    .join(",");
}

export function render(records) {
  // BOM so Excel detects UTF-8.
  return "\uFEFF" + [COLUMNS.join(","), ...records.map(row)].join("\r\n");
}

export function filename() {
  return `${exportBasename()}.csv`;
}
