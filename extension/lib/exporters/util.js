// Shared helpers for export formatters.

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function fmtDate(s) {
  if (!s) return "";
  const d = new Date(s);
  return isNaN(d) ? String(s) : d.toISOString();
}

export function metricsLine(m) {
  if (!m) return "";
  const parts = [];
  if (m.likes != null) parts.push(`${m.likes} likes`);
  if (m.reposts != null) parts.push(`${m.reposts} reposts`);
  if (m.replies != null) parts.push(`${m.replies} replies`);
  if (m.views != null) parts.push(`${m.views} views`);
  return parts.join(" \u00b7 ");
}

export function timestampSlug() {
  return new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
}
