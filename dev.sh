#!/usr/bin/env bash
# Local dev helper: build, test, prepare extension, and/or deploy to Firebase.
#
# Usage:
#   ./dev.sh                 build + test (default)
#   ./dev.sh --extension     also generate icons and package the extension zip
#   ./dev.sh --deploy        also deploy the landing page to Firebase Hosting
#   ./dev.sh --extension --deploy
#
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

DO_EXTENSION=false
DO_DEPLOY=false

usage() {
  sed -n '2,8p' "$0" | sed 's/^# \{0,1\}//'
  exit 0
}

for arg in "$@"; do
  case "$arg" in
    --extension) DO_EXTENSION=true ;;
    --deploy) DO_DEPLOY=true ;;
    -h|--help) usage ;;
    *)
      echo "Unknown option: $arg" >&2
      echo "Run ./dev.sh --help" >&2
      exit 1
      ;;
  esac
done

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
step() { bold "→ $*"; }

step "Installing dependencies (if any)"
npm install

step "Building bookmarklet + extension inject"
npm run build

step "Running tests"
npm test

if [[ "$DO_EXTENSION" == true ]]; then
  step "Generating extension icons from assets/logo.svg"
  npm run icons

  step "Packaging extension zip"
  npm run package:extension

  EXT_PATH="$ROOT/extension"
  bold ""
  bold "Extension ready — load it in your browser:"
  echo "  1. Open chrome://extensions (or edge:// / brave://)"
  echo "  2. Enable Developer mode"
  echo "  3. Load unpacked → select:"
  echo "     $EXT_PATH"
  echo ""
  echo "  Zip for Chrome Web Store: dist/extractor-extension-*.zip"
  bold ""

  if [[ "$(uname -s)" == "Darwin" ]]; then
    open "$EXT_PATH" 2>/dev/null || true
  fi
fi

if [[ "$DO_DEPLOY" == true ]]; then
  step "Deploying to Firebase Hosting (project: xtractor-78c0f)"
  if ! npx --yes firebase-tools@latest deploy --only hosting; then
    echo "" >&2
    echo "Deploy failed. Log in first:" >&2
    echo "  npx --yes firebase-tools@latest login" >&2
    exit 1
  fi
  bold "Live at https://xtractor-78c0f.web.app"
fi

bold "Done."
