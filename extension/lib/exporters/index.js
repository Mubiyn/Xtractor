import * as json from "./json.js";
import * as ndjson from "./ndjson.js";
import * as csv from "./csv.js";
import * as markdown from "./markdown.js";
import * as html from "./html.js";
import * as txt from "./txt.js";
import * as doc from "./doc.js";

export const EXPORTERS = [json, ndjson, csv, markdown, html, txt, doc];

export function getExporter(id) {
  return EXPORTERS.find((e) => e.id === id) || null;
}

// Produces a Blob + filename for the chosen format. Optionally filter by folder.
export function buildExport(records, formatId, { folder = null } = {}) {
  const exporter = getExporter(formatId);
  if (!exporter) throw new Error(`Unknown format: ${formatId}`);
  const rows = folder ? records.filter((r) => r.folder === folder) : records;
  const content = exporter.render(rows);
  return {
    blob: new Blob([content], { type: `${exporter.mime};charset=utf-8` }),
    filename: exporter.filename(),
    count: rows.length
  };
}
