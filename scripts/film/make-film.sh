#!/bin/bash
# Records Clod's demo film from the real interface and writes:
#   docs/media/clod-film.mp4   (download page)
#   docs/media/clod-film.gif   (README)
#   docs/media/clod-film-poster.png
#
#   bash scripts/film/make-film.sh            # full film
#   PREVIEW="4,9,14" bash scripts/film/make-film.sh   # a few still frames, for checking
set -euo pipefail
cd "$(dirname "$0")/../.."

WORK="${TMPDIR:-/tmp}/clod-film"
rm -rf "$WORK" && mkdir -p "$WORK/set" "$WORK/frames"

echo "Building the interface…"
npx electron-vite build >/dev/null

# The film set: stage + the real interface, with the clock and the stand-in
# for Clod's main process loaded before the interface's own code.
cp scripts/film/stage.html scripts/film/clock.js "$WORK/set/"
cp docs/icon.png "$WORK/set/icon.png"
cp resources/trayTemplate@2x.png "$WORK/set/tray.png"
cp -R dist/renderer "$WORK/set/clod"
cp scripts/film/clock.js scripts/film/stub.js "$WORK/set/clod/"
python3 - "$WORK/set/clod/index.html" <<'PY'
import sys
p = sys.argv[1]; s = open(p).read()
s = s.replace('<head>', '<head>\n    <script src="./clock.js"></script>\n    <script src="./stub.js"></script>', 1)
open(p, 'w').write(s)
PY

echo "Recording…"
FILM_DIR="$WORK/set" OUT_DIR="$WORK/frames" PREVIEW="${PREVIEW:-}" npx electron scripts/film/record.cjs

if [ -n "${PREVIEW:-}" ]; then
  echo "Preview frames: $WORK/frames"
  exit 0
fi

echo "Encoding…"
xcrun swiftc -O -o "$WORK/encode" scripts/film/encode.swift
mkdir -p docs/media
"$WORK/encode" "$WORK/frames" docs/media
ls -la docs/media
