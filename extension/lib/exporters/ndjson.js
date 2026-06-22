import { exportBasename } from "../brand.js";

export const id = "ndjson";
export const label = "NDJSON (one JSON record per line)";
export const ext = "ndjson";
export const mime = "application/x-ndjson";

export function render(records) {
  return records.map((r) => JSON.stringify(r)).join("\n");
}

export function filename() {
  return `${exportBasename()}.ndjson`;
}
