#!/bin/bash
# Build Clod.app and package it as a disk image for sharing: release/Clod-<version>.dmg
#
# The app is signed with the "Clod Local Signing" certificate when it exists
# (see README.md). Without an Apple Developer ID, macOS still warns on first
# open, which the DMG window explains, but a fixed certificate means people
# keep their permissions when they install an update.
#
# The artwork is resources/dmg/background.html; after editing it, re-render
# background.png (660x480) and background@2x.png and combine them with:
#   tiffutil -cathidpicheck background.png background@2x.png -out background.tiff
set -euo pipefail
cd "$(dirname "$0")/.."

VERSION="$(node -p "require('./package.json').version")"
APP="release/mac-arm64/Clod.app"
DMG="release/Clod-${VERSION}.dmg"

echo "Building Clod ${VERSION}…"
npm run dist

SIGN_CN="Clod Local Signing"
SIGN_ID="$(security find-identity -p codesigning 2>/dev/null | awk -v cn="\"$SIGN_CN\"" 'index($0, cn) { print $2; exit }')"
if [ -n "$SIGN_ID" ]; then
  codesign --force --sign "$SIGN_ID" --options runtime \
    --entitlements resources/entitlements.mac.plist "$APP"
  echo "Signed with \"$SIGN_CN\"."
else
  echo "No \"$SIGN_CN\" certificate found: the app keeps its ad-hoc signature, so"
  echo "people will have to allow its permissions again after every update."
fi

echo "Packaging ${DMG}…"
# identity=null: package the app as signed above, without re-signing it.
npx electron-builder --mac dmg --arm64 --prepackaged "$APP" -c.mac.identity=null
codesign --verify --deep --strict "$APP"

echo
echo "Done: ${DMG}"
