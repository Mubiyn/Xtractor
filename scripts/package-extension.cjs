// Packages the extension/ folder into dist/x-bookmarks-exporter-extension.zip,
// ready to upload to the Chrome Web Store (or load unpacked). Uses the system
// `zip` tool so there are no npm dependencies. Run: node scripts/package-extension.cjs

const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const extDir = path.join(root, "extension");
const distDir = path.join(root, "dist");
const manifestPath = path.join(extDir, "manifest.json");

if (!fs.existsSync(manifestPath)) {
  console.error("extension/manifest.json not found.");
  process.exit(1);
}

// Ensure the in-page inject script is up to date.
execFileSync("node", ["build.cjs"], { cwd: root, stdio: "inherit" });

const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
fs.mkdirSync(distDir, { recursive: true });

const zipName = `extractor-extension-v${manifest.version}.zip`;
const zipPath = path.join(distDir, zipName);
if (fs.existsSync(zipPath)) fs.rmSync(zipPath);

// Zip the contents of extension/ (so manifest.json sits at the zip root, which
// the Chrome Web Store requires), excluding junk files.
execFileSync(
  "zip",
  ["-r", "-X", zipPath, ".", "-x", "*.DS_Store", "-x", "__MACOSX*", "-x", "scripts/*"],
  { cwd: extDir, stdio: "inherit" }
);

const sizeKb = (fs.statSync(zipPath).size / 1024).toFixed(1);
console.log(`\nPackaged extension v${manifest.version} -> ${path.relative(root, zipPath)} (${sizeKb} KB)`);
console.log("Upload this .zip at https://chrome.google.com/webstore/devconsole");
