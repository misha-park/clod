#!/bin/bash
# Build the native "Clod Settings" app (SwiftUI) into dist-native/.
# electron-builder copies it into Clod.app/Contents/Helpers (see package.json).
# Needs only the Xcode Command Line Tools (swiftc), not Xcode itself.
set -euo pipefail
cd "$(dirname "$0")/.."

NAME="Clod Settings"
APP="dist-native/${NAME}.app"
SRC="native/settings"
VERSION="$(node -p "require('./package.json').version")"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"

echo "Compiling ${NAME}…"
xcrun swiftc -O -parse-as-library \
  -target arm64-apple-macos13.0 \
  -o "$APP/Contents/MacOS/${NAME}" \
  "$SRC"/*.swift

cp resources/icon.icns "$APP/Contents/Resources/AppIcon.icns"

cat > "$APP/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key><string>com.clod.settings</string>
  <key>CFBundleName</key><string>${NAME}</string>
  <key>CFBundleDisplayName</key><string>${NAME}</string>
  <key>CFBundleExecutable</key><string>${NAME}</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${VERSION}</string>
  <key>CFBundleVersion</key><string>${VERSION}</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>LSUIElement</key><true/>
  <key>NSHighResolutionCapable</key><true/>
</dict>
</plist>
PLIST

# Ad-hoc sign so it runs standalone; the installer re-signs the whole of Clod.app.
codesign --force --sign - "$APP" >/dev/null
echo "Built $APP"

# Helper for "Explain selection": reads the selected text via Accessibility.
echo "Compiling clod-selection…"
xcrun swiftc -O -target arm64-apple-macos13.0 -o dist-native/clod-selection native/selection/main.swift
codesign --force --sign - dist-native/clod-selection >/dev/null 2>&1 || true
echo "Built dist-native/clod-selection"
