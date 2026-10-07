# Clod

A floating window for [Claude Code](https://docs.claude.com/en/docs/claude-code) on your Mac. Double-tap **⌥ Option** in any app, ask Claude something, and carry on with what you were doing. Clod runs the real Claude Code in the background, so it can read and edit files, run commands and use your Claude Code setup, all from a small overlay.

Clod works on Macs with Apple silicon (M1 or newer).

## What you need

- **A paid Claude plan** (Pro, Max, Team or Enterprise), **or** an [Anthropic API account](https://console.anthropic.com), where you pay for what you use. Free Claude accounts can't use Claude Code.
- That's all. Clod installs Claude Code for you during setup.

## Install

1. Download **Clod-3.1.0.dmg** from the [latest release](https://github.com/misha-park/clod/releases/latest).
2. Open it and drag **Clod** onto **Applications**.
3. Open Clod from Applications. Clod isn't signed by Apple, so the first time macOS says it can't check it. Click **Done**.
4. Open **System Settings → Privacy & Security**, scroll to the bottom, click **Open Anyway** next to "Clod was blocked", and enter your Mac password. You only do this once.
5. Clod opens its setup window and walks you through the rest:
   - installing Claude Code
   - signing in to Claude in your browser
   - allowing the ⌥ Option shortcut (Accessibility)
   - optionally allowing screenshots and the Terminal button

Then double-tap **⌥ Option**, type a question and press **Return**.

## Using Clod

- **Double-tap ⌥ Option** (or press **⌘⇧K**) to show or hide Clod. You can change the shortcut in Settings.
- Clod lives in the **menu bar**, not the Dock.
- **Attach** files with the paperclip, **paste** images, or capture part of your screen with the **camera**.
- **Drag a folder** onto Clod to make Claude work in it.
- Open more **tabs** with **+**. Browse, search, pin and export **past conversations** with the clock. Type **?** and a word to search them all.
- Type **/** for commands, or start a message with **!** to run a Terminal command.
- Choose the **model** and **Ask** or **Auto** mode from the chips above the message bar. In Ask mode, Claude checks with you before changing files or running commands.

Settings (the cog, or **⌘,** from the menu bar icon) has a full guide under **How Clod works**, plus your account, permissions, appearance and shortcuts.

## Updating

Clod checks for new versions once a day. When there's one, Settings and the menu bar icon show **Clod x.y.z is available**. Download the new DMG and drag Clod into Applications to replace the old one. Your settings, conversations and permissions carry over.

## Uninstalling

Open Settings → **Help → Uninstall Clod…**. This removes Clod, its settings, its saved sign-in and its log. Claude Code and your conversations stay, since other apps may use them. To remove Claude Code too, delete `~/.local/bin/claude` and `~/.local/share/claude`.

## Privacy

- Clod has no tracking or analytics. The only thing it contacts by itself is GitHub, once a day, to check for updates.
- Your messages go to Anthropic through Claude Code, exactly as when you use Claude Code in Terminal.
- A pasted token or API key is stored encrypted with your Mac's Keychain and only given to Claude Code.
- Clod keeps a log on your Mac (`~/.clod-debug.log`) to help fix problems. Nothing is sent unless you copy it yourself (Settings → Help → Copy debug info).

## Troubleshooting

- **Double-tapping ⌥ Option does nothing:** check Settings → Permissions → Accessibility. If it says Allowed but still doesn't work, remove Clod from the Accessibility list in System Settings, add it again, then quit and reopen Clod.
- **"Clod isn't signed in to Claude":** click **Sign in** under the message, or go to Settings → Account.
- **Sign-in in the browser doesn't finish:** in setup or Settings → Account, choose **Sign in using Terminal**.
- **Anything else:** Settings → Help → **Copy debug info**, and include it when you report the problem in [Issues](https://github.com/misha-park/clod/issues).

More in [docs/TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md).

---

## For developers

Clod is Electron, electron-vite, React, TypeScript and zustand, with a native SwiftUI settings app (`native/settings`). It drives the `claude` CLI in stream-json mode, one process per tab. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Requirements:** Node.js 18+, the Xcode Command Line Tools (`xcode-select --install`), and Claude Code.

```bash
git clone https://github.com/misha-park/clod.git
cd clod
npm install
npm run dev
```

Renderer changes hot-reload; main-process changes restart the app.

| Command | What it does |
| --- | --- |
| `npm run dev` | Live-reload development build |
| `npm run typecheck` | TypeScript check |
| `npm test` | Unit tests |
| `npm run dist` | Build Clod.app into `release/` |
| `npm run dmg` | Build and package `release/Clod-<version>.dmg` |
| `npm run doctor` | Check your environment |

To build and install into `/Applications` in one go, double-click `commands/install-app.command`.

### Signing and permissions

macOS ties Accessibility and Screen Recording permissions to an app's signature. An ad-hoc signature changes on every build, so macOS forgets the permissions. Create a local signing certificate once and the build scripts use it automatically:

1. Open **Keychain Access → Certificate Assistant → Create a Certificate…**
2. Name: `Clod Local Signing` · Identity Type: **Self-Signed Root** · Certificate Type: **Code Signing**
3. Click **Create**.

Sign every release with the same certificate so people keep their permissions when they update. It's valid for a year; replacing it means everyone allows the permissions once more.

If permissions get stuck:

```bash
tccutil reset Accessibility com.clod.app && tccutil reset ScreenCapture com.clod.app
```

### Releasing

1. Bump `version` in `package.json` (and the two matching lines in `package-lock.json`).
2. `npm run dmg`
3. Create a GitHub release tagged `v<version>` and attach `release/Clod-<version>.dmg`. Clod's update check reads the latest release.

## Licence

MIT. Clod is based on [Clui CC](https://github.com/lcoutodemos/clui-cc) by Lucas Couto. See [LICENSE](LICENSE).
