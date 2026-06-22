# Extractor

**Product name:** Extractor  
**GitHub repo:** [`extractor`](https://github.com/YOUR_USERNAME/extractor)  
**Tagline:** Extract your social data — bookmarks, likes, posts, reposts — from any platform, in any format. Free, local-only.

Extractor pulls **your** data out of social platforms and into files you own: **JSON, NDJSON, CSV, Markdown, HTML, plain text, or Word / Google Docs**. It runs entirely in your browser — no servers, no sign-up, no API keys.

We ship **one extractor module at a time**. Today:

| Status | Platform | Data |
| --- | --- | --- |
| **Available** | X (Twitter) | Bookmarks (with Premium folders) |
| Coming soon | X | Likes, reposts, your posts |
| Coming soon | Bluesky | Bookmarks, likes, feeds |
| Coming soon | Reddit | Saved posts, comments |
| Coming soon | More | [Open an issue](https://github.com/YOUR_USERNAME/extractor/issues) |

> X has no built-in bookmark export. The official archive excludes bookmarks, and the paid API caps at ~800 with no folder support. Extractor uses the same internal endpoints x.com calls while you browse, so it can export your **whole** collection with folders.

---

## Quick start (dev script)

```bash
./dev.sh                  # build + test
./dev.sh --extension      # + generate icons, package extension zip, print load steps
./dev.sh --deploy         # + deploy landing page to Firebase (requires firebase login)
./dev.sh --extension --deploy
```

Same as `npm run dev` with optional flags.

## X bookmarks — the bookmarklet (recommended)

A **bookmarklet** is a normal-looking bookmark that runs a tiny script when you click it. Setup takes a few seconds and needs no install.

1. Open the [landing page](https://xtractor-78c0f.web.app) (or `index.html` locally).
2. **Drag the blue "Extractor" button onto your bookmarks bar.**
   (Press <kbd>Ctrl/⌘ + Shift + B</kbd> to show the bar.)
3. Go to **[x.com/i/bookmarks](https://x.com/i/bookmarks)** while logged in and let the page load.
4. **Click the bookmarklet.** A panel appears, fetches everything, and shows format buttons — click one to download.

That's it. One click to export, every time.

### Why does it have to run on x.com?

A regular website **cannot** read your X bookmarks — your login lives in cookies locked to `x.com`. Anything that exports your bookmarks must run inside an x.com tab, which is what the bookmarklet does when you click it there.

---

## Export formats

| Format | Best for |
| --- | --- |
| JSON | Full structured data, scripting, backups |
| NDJSON | Streaming / data pipelines (one record per line) |
| CSV | Excel, Google Sheets, Numbers |
| Markdown | Obsidian, Notion, GitHub |
| HTML | A browsable webpage with media |
| Plain text | Universal, lightweight |
| Word / Google Docs (.doc) | Word, Google Docs, Pages |

Exported files are named `extractor-x-bookmarks-<timestamp>.<ext>` so you can tell the platform and data type at a glance.

Each X bookmark record includes: tweet id, URL, author, date, full text (long-form notes included), folder, engagement metrics, media URLs, external links, and quoted tweets.

### Get it into Google Docs

Pick **Word / Google Docs (.doc)**, upload to Google Drive, then **Open with → Google Docs**. The HTML format works the same way.

---

## Browser extension

The [`extension/`](extension/) folder is a Manifest V3 extension — the most reliable way to run Extractor on X, especially for large collections or when bookmarklets are blocked by CSP.

> **Chrome Web Store:** coming soon. Load unpacked locally for now.

### Load locally (Chrome, Edge, Brave)

```bash
npm run build
```

1. `chrome://extensions` → **Developer mode** → **Load unpacked** → select `extension/`
2. Go to [x.com/i/bookmarks](https://x.com/i/bookmarks) → extension icon → **Export now**

```bash
npm run package:extension   # -> dist/extractor-extension-v1.0.0.zip
```

## Host the web app

Static landing page on Firebase Hosting — see [HOSTING.md](HOSTING.md). Auto-deploy on push to `main` after adding the `FIREBASE_SERVICE_ACCOUNT` secret.

---

## How it works (X bookmarks)

```
You're on x.com/i/bookmarks  ─►  click Extractor bookmarklet
        │
        ▼
read the live "Bookmarks" GraphQL request from the Performance API
        │
        ▼
replay it with your session cookies, paging until done
        │
        ▼
normalize tweets  ─►  pick a format  ─►  download
```

- **No cookie copying.** Reads `ct0` and the web app bearer token from your session.
- **Rotating query IDs.** X rotates internal GraphQL IDs; Extractor reads the live request you just made.
- **Folders.** Premium folder tags when folder endpoints were captured.

## Privacy & security

Everything runs locally. The only network requests are to the platform you're extracting from (today: `x.com`). See [PRIVACY.md](PRIVACY.md).

## Caveats

- Uses **unofficial** platform endpoints with your own session — not officially supported; platforms may change them.
- Large collections may hit rate limits; the tool backs off and retries.
- Media URLs are included; files are not downloaded in v1.

---

## For developers

```
index.html                    landing page + platform roadmap
bookmarklet/src.js            X · Bookmarks bookmarklet source
extension/lib/brand.js        product name + export filename helpers
build.cjs                     minify bookmarklet, inject into index.html
extension/                    MV3 extension (more platforms over time)
```

```bash
node build.cjs       # or: npm run build
npm test
npm run package:extension
npm run serve        # http://localhost:8765
```

Adding a new platform: implement an extractor module, register it in `extension/lib/brand.js` (`EXTRACTORS`), add a landing-page card, and ship.

## License

[MIT](LICENSE). Contributions welcome.
