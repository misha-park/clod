# Troubleshooting

If setup fails, run this first:

```bash
npm run doctor
```

This checks your local environment and prints pass/fail status without changing your system.

## Install Fails with "gyp" or "make" Errors

Install Xcode Command Line Tools, then retry:

```bash
xcode-select --install
```

```bash
npm install
```

## Install Fails with `fatal error: 'functional' file not found`

C++ headers are missing/broken, usually due to Xcode CLT issues.

Check toolchain first:

```bash
xcode-select -p
```

```bash
xcrun --sdk macosx --show-sdk-path
```

If either command fails (or the error persists), reinstall CLT:

```bash
sudo rm -rf /Library/Developer/CommandLineTools
```

```bash
xcode-select --install
```

Then retry:

```bash
npm install
```

If CLT is installed but the error still appears on newer macOS versions, compile explicitly against the SDK include path:

```bash
SDK=$(xcrun --sdk macosx --show-sdk-path)
clang++ -std=c++17 -isysroot "$SDK" -I"$SDK/usr/include/c++/v1" -x c++ - -o /dev/null <<'EOF'
#include <functional>
int main() { return 0; }
EOF
```

## App Launches but No Claude Response

Verify Claude CLI is installed and authenticated:

```bash
claude --version
```

```bash
claude
```

## Double-tap `⌥` Does Not Toggle

The double-tap hotkey needs Accessibility permission:

- System Settings → Privacy & Security → Accessibility (shown as "Device Control and Data Access" on newer macOS)

If Clod is listed and switched on but the hotkey still fails, the entry is stale (it belongs to an older signature). Reset it, approve the prompt on next launch, then quit and reopen Clod:

```bash
tccutil reset Accessibility com.clod.app
```

Fallback shortcut, which always works: `Cmd+Shift+K`. See "Keeping permissions across reinstalls" in the README to stop this recurring.

## Packaged App Won't Open (Security Warning)

The `.app` built by `npm run dist` is unsigned. macOS Gatekeeper blocks unsigned apps by default.

To allow it:

1. Open **System Settings → Privacy & Security**
2. Scroll to the security section
3. Click **Open Anyway** next to the Clod message

You only need to do this once. This is a local build, not App Store distribution.

## Install Fails at Build Step

Run the steps manually to see the detailed error:

```bash
./commands/setup.command
```

```bash
npm run dist
```

If `npm run dist` fails, try a clean reinstall:

```bash
rm -rf node_modules
```

```bash
npm install
```

```bash
npm run dist
```

## Marketplace Shows "Failed to Load"

Expected when offline. Marketplace needs internet access; core app features continue to work.

## Window Is Invisible / No UI

Try:

- Double-tap `⌥`
- `Cmd+Shift+K`
- Confirm app is running from the menu bar tray
