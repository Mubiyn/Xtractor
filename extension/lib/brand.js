// Product branding and export naming (platform + data type).
import { timestampSlug } from "./exporters/util.js";

export const APP_NAME = "Extractor";
export const APP_TAGLINE =
  "Extract your social data — bookmarks, likes, posts, reposts — from any platform, in any format.";

/** Active extractors — add entries as new platforms/data types ship. */
export const EXTRACTORS = {
  xBookmarks: {
    platform: "X",
    platformKey: "x",
    dataType: "bookmarks",
    label: "X · Bookmarks",
    available: true,
  },
};

export const X_BOOKMARKS = EXTRACTORS.xBookmarks;

export function exportBasename(meta = X_BOOKMARKS) {
  return `extractor-${meta.platformKey}-${meta.dataType}-${timestampSlug()}`;
}
