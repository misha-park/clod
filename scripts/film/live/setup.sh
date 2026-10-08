#!/bin/bash
# Gets a Mac ready to screen-record Clod's demo (see README in this folder):
# makes a demo Downloads folder full of made-up files, opens it in Finder,
# and restarts Clod in film mode, hidden until you double-tap Option.
set -euo pipefail

ROOT="$HOME/Clod Film"
DIR="$ROOT/Downloads"

# A fresh demo folder every take.
rm -rf "$ROOT" && mkdir -p "$DIR"
cd "$DIR"

# Small real images and PDFs (so Finder shows proper icons), padded to
# realistic sizes, plus a few other made-up files.
python3 - <<'PY'
import zlib, struct
def png(path, w, h, a, b):
    rows = b''.join(b'\x00' + bytes(sum(([int(a[i] + (b[i]-a[i]) * (x+y) / (w+h)) for i in range(3)] for x in range(w)), [])) for y in range(h))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(rows)) + chunk(b'IEND', b''))
png('IMG_2041.png', 96, 72, (214, 160, 118), (96, 128, 150))
png('IMG_2042.png', 96, 72, (120, 150, 110), (230, 210, 170))
png('Screenshot 2026-09-14.png', 120, 76, (240, 238, 232), (200, 196, 188))
def pdf(path, text):
    body = f'BT /F1 18 Tf 72 720 Td ({text}) Tj ET'.encode()
    objs = [b'<< /Type /Catalog /Pages 2 0 R >>', b'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
            b'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
            b'<< /Length %d >>\nstream\n' % len(body) + body + b'\nendstream', b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>']
    out, offs = b'%PDF-1.4\n', []
    for i, o in enumerate(objs, 1):
        offs.append(len(out)); out += b'%d 0 obj\n' % i + o + b'\nendobj\n'
    x = len(out)
    out += b'xref\n0 %d\n0000000000 65535 f \n' % (len(objs) + 1) + b''.join(b'%010d 00000 n \n' % o for o in offs)
    out += b'trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n' % (len(objs) + 1, x)
    open(path, 'wb').write(out)
pdf('invoice-march.pdf', 'Invoice - March')
pdf('notes.pdf', 'Notes')
PY
sips -s format jpeg IMG_2041.png --out IMG_2041.jpg >/dev/null && sips -s format jpeg IMG_2042.png --out IMG_2042.jpg >/dev/null && rm IMG_2041.png IMG_2042.png
cp invoice-march.pdf "invoice (1).pdf"; cp IMG_2041.jpg "IMG_2041 (1).jpg"; cp IMG_2042.jpg "IMG_2042 (1).jpg"
for f in budget-2026.xlsx cover-letter.docx VideoChat.dmg "VideoChat (1).dmg" PhotoEditor.dmg; do : > "$f"; done
pad() { truncate -s "$2" "$1"; }
pad invoice-march.pdf 182K; pad "invoice (1).pdf" 182K; pad notes.pdf 64K
pad IMG_2041.jpg 3100K; pad "IMG_2041 (1).jpg" 3100K; pad IMG_2042.jpg 2800K; pad "IMG_2042 (1).jpg" 2800K
pad "Screenshot 2026-09-14.png" 812K; pad budget-2026.xlsx 46K; pad cover-letter.docx 28K
pad VideoChat.dmg 94M; pad "VideoChat (1).dmg" 94M; pad PhotoEditor.dmg 211M
# Stagger the dates so the list looks lived-in.
i=0; for f in *; do touch -t "$(date -v-${i}H +%Y%m%d%H%M)" "$f"; i=$((i+5)); done

# Open it in Finder, in list view, on the left of the screen.
osascript <<OSA
tell application "Finder"
  activate
  set w to make new Finder window to (POSIX file "$DIR" as alias)
  set current view of w to list view
  set toolbar visible of w to true
  set bounds of w to {150, 170, 870, 760}
end tell
OSA

# Restart Clod in film mode (hidden until you double-tap Option).
osascript -e 'quit app "Clod"' 2>/dev/null || true
for _ in 1 2 3 4 5 6 7 8 9 10; do pgrep -x Clod >/dev/null || break; sleep 0.5; done
pkill -x Clod 2>/dev/null || true
open -a Clod --env CLOD_FILM=1 --env "CLOD_FILM_DIR=$DIR"
echo "Ready. Start recording, then double-tap Option."
