#!/bin/bash
# ──────────────────────────────────────────────────────
#  Clod — Install App
#
#  Double-click this file in Finder to:
#   1. Set up dependencies
#   2. Build a standalone macOS app
#   3. Copy it to /Applications
#   4. Clean temporary build files
#   5. Launch it
# ──────────────────────────────────────────────────────
set -e

# Resolve to repo root (one level up from commands/)
cd "$(dirname "$0")/.."

APP_NAME="Clod"
DEST="/Applications/${APP_NAME}.app"

step() { echo; echo "═══ $1 ═══"; echo; }

# ── 1. Setup ──

step "Step 1/5 — Setting up environment and dependencies"

if ! bash ./commands/setup.command; then
  echo
  echo "Setup failed. Fix the issues above, then double-click this file again."
  echo
  exit 1
fi

# ── 2. Build ──

step "Step 2/5 — Building ${APP_NAME}.app"

if ! npm run dist; then
  echo
  echo "Build failed."
  echo
  echo "  Try these steps one at a time:"
  echo "    rm -rf node_modules"
  echo "    npm install"
  echo "    npm run dist"
  echo
  echo "  If it still fails, see docs/TROUBLESHOOTING.md"
  echo
  exit 1
fi

# ── 3. Detect and copy ──

step "Step 3/5 — Installing to /Applications"

APP_SOURCE=""
if [ -d "release/mac-arm64/${APP_NAME}.app" ]; then
  APP_SOURCE="release/mac-arm64/${APP_NAME}.app"
elif [ -d "release/mac/${APP_NAME}.app" ]; then
  APP_SOURCE="release/mac/${APP_NAME}.app"
fi

if [ -z "$APP_SOURCE" ]; then
  echo "Could not find the built app."
  echo
  echo "  Expected one of:"
  echo "    release/mac-arm64/${APP_NAME}.app  (Apple Silicon)"
  echo "    release/mac/${APP_NAME}.app        (Intel)"
  echo
  echo "  Check what was built:"
  echo "    ls release/"
  echo
  exit 1
fi

echo "Found: $APP_SOURCE"

# Re-sign with the local "Clod Local Signing" certificate when it exists. An
# ad-hoc signature changes on every build, which makes macOS forget Clod's
# Accessibility / Screen Recording grants; a fixed certificate keeps them.
# See "Keeping permissions across reinstalls" in README.md.
SIGN_CN="Clod Local Signing"
SIGN_ID="$(security find-identity -p codesigning 2>/dev/null | awk -v cn="\"$SIGN_CN\"" 'index($0, cn) { print $2; exit }')"
if [ -n "$SIGN_ID" ]; then
  if codesign --force --sign "$SIGN_ID" --options runtime \
       --entitlements resources/entitlements.mac.plist "$APP_SOURCE"; then
    echo "Signed with \"$SIGN_CN\" — permissions will carry over."
  else
    echo "Signing with \"$SIGN_CN\" failed — keeping the ad-hoc signature."
  fi
else
  echo "No \"$SIGN_CN\" certificate found — keeping the ad-hoc signature."
  echo "macOS will ask for permissions again after this install (see README.md)."
fi

# Quit the running Clod and its settings window first; otherwise the old
# copy keeps running and "open" below just brings it to the front.
if pgrep -x "${APP_NAME}" >/dev/null || pgrep -x "${APP_NAME} Settings" >/dev/null; then
  echo "Quitting the running ${APP_NAME}..."
  osascript -e "quit app \"${APP_NAME}\"" >/dev/null 2>&1 || true
  pkill -x "${APP_NAME} Settings" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    pgrep -x "${APP_NAME}" >/dev/null || break
    sleep 0.5
  done
  pkill -x "${APP_NAME}" 2>/dev/null || true
fi

if [ -d "$DEST" ]; then
  echo "Replacing existing ${APP_NAME} in /Applications..."
  rm -rf "$DEST"
fi

cp -R "$APP_SOURCE" "$DEST"
echo "Copied to $DEST"

# ── 4. Cleanup ──

step "Step 4/5 — Cleaning temporary build files"

if [ "${KEEP_BUILD_ARTIFACTS:-0}" = "1" ]; then
  echo "Keeping build artifacts (KEEP_BUILD_ARTIFACTS=1)."
else
  rm -rf ./dist ./release
  echo "Removed: dist/ and release/"
fi

# ── 5. Launch ──

step "Step 5/5 — Launching ${APP_NAME}"

open "$DEST"

echo "Done! ${APP_NAME} is running."
echo
echo "  Show/hide the overlay:  double-tap ⌥ Option  (or ⌘⇧K)"
echo "  Quit:                   Click the menu bar icon > Quit"
echo
echo "  First launch: if macOS shows a security warning, go to"
echo "  System Settings > Privacy & Security > Open Anyway"
echo "  You only need to do this once."
echo
