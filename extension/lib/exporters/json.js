import { exportBasename } from "../brand.js";

export const id = "json";
export const label = "JSON (structured, full data)";
export const ext = "json";
export const mime = "application/json";

export function render(records) {
  return JSON.stringify(
    { exportedAt: new Date().toISOString(), count: records.length, bookmarks: records },
    null,
    2
  );
}

export function filename() {
  return `${exportBasename()}.json`;
}
