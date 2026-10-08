#!/bin/bash
# After recording: quits Clod's film mode, reopens Clod normally, and removes
# the demo folder.
osascript -e 'quit app "Clod"' 2>/dev/null || true
for _ in 1 2 3 4 5 6 7 8 9 10; do pgrep -x Clod >/dev/null || break; sleep 0.5; done
pkill -x Clod 2>/dev/null || true
open -a Clod
osascript -e 'tell application "Finder" to close (every window whose name is "Downloads" and target is (POSIX file "'"$HOME"'/Clod Film/Downloads" as alias))' 2>/dev/null || true
rm -rf "$HOME/Clod Film"
echo "Clod is back to normal."
