# Privacy Policy

Extractor is designed to be private by default. This applies to both
the bookmarklet and the browser extension.

## What it does

- Runs entirely inside your browser (as a bookmarklet on x.com, or as an
  extension).
- Reads the authorization token from your existing, logged-in x.com session in
  order to request your own bookmarks from x.com.
- The bookmarklet keeps everything in memory for that page session; the
  extension can store fetched bookmarks locally (in the browser's IndexedDB) so
  you can re-export in different formats.

## What it does NOT do

- It does **not** send your data, credentials, or bookmarks to any server
  operated by this project or any third party. The only network requests it
  makes are to `x.com` / `twitter.com` (and `abs.twimg.com` for the query-ID
  fallback), using your own session.
- It contains **no analytics, telemetry, tracking, or advertising**.
- It does **not** ask for, store, or transmit your password.

## Data storage and removal

- Auth headers are held in `chrome.storage.session` and are cleared when you
  close the browser.
- Fetched bookmarks are held in local IndexedDB until you click
  **Clear stored data** in the exporter, or remove the extension.

## Permissions

- `storage` — to cache the captured request templates and your fetched bookmarks
  locally.
- `webRequest` + host permissions for x.com/twitter.com — to read the auth
  headers from your own session traffic so you don't have to copy cookies.
- `downloads` — to save the export file you generate.

## Contact

This is an open-source project. Review the source code in this repository to
verify these claims, or open an issue with questions.
