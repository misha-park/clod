# Release checklist

Go through this before every release. It takes about 20 minutes. The new-user part needs a separate macOS user account (System Settings → Users & Groups → Add User), so you start without Claude Code, a Claude sign-in or any permissions.

## 1. Prepare

- [ ] Bump `version` in `package.json`, and the two matching `"version"` lines at the top of `package-lock.json`.
- [ ] `npm run typecheck` and `npm test` pass.
- [ ] `npm run dmg` finishes and says **Signed with "Clod Local Signing"**. If it doesn't, people will lose their permissions when they update.
- [ ] Copy `release/Clod-<version>.dmg` to `/Users/Shared`, then mark it as downloaded so the test account sees the first-open warning:
  ```bash
  xattr -w com.apple.quarantine "0081;$(printf %x $(date +%s));Safari;" /Users/Shared/Clod-<version>.dmg
  ```

## 2. Install as a new user (test account)

- [ ] The DMG window shows Clod, Applications and the "Opening Clod for the first time" steps.
- [ ] Drag Clod to Applications. Opening it shows macOS's warning; **Open Anyway** in Privacy & Security works.
- [ ] The setup window opens on its own.
- [ ] **Install Claude Code** finishes and ticks.
- [ ] **Sign in with Claude** opens the browser; after approving (and pasting a code, if one is shown) the step ticks.
- [ ] **Sign in using Terminal** also works (try it on a second run).
- [ ] **Choose a folder**: both "Use this folder" and "Choose another…" work.
- [ ] **Allow the shortcut**: after turning Clod on in System Settings, the step ticks and double-tap ⌥ Option works without restarting.
- [ ] **Allow screenshots** and **Allow Terminal** work, and **Skip for now** works.
- [ ] **Finish and restart Clod** restarts it; the overlay shows the "Double-tap ⌥ Option" tip, which goes away after using the shortcut twice.

## 3. Use it

- [ ] Send a message; the thinking animation shows and the reply streams in.
- [ ] In Ask mode, a permission card appears before Claude edits a file.
- [ ] Attach a file, paste an image, and take a screenshot with the camera button.
- [ ] Drag a folder onto Clod; the folder chip changes.
- [ ] Open a second tab, then find the first conversation under the clock button and with `?` search.
- [ ] Hover each top button: its label appears. Copy shows "Conversation copied".
- [ ] Turn Wi-Fi off and send a message: "Clod couldn't reach Claude…" appears; turn it on and Retry works.
- [ ] Quit from the menu bar while Claude is replying: Clod asks first.
- [ ] Switch to light theme in Settings → Appearance and check the overlay reads well.

## 4. Settings

- [ ] Every sidebar page opens and looks right.
- [ ] Account shows the signed-in account; Sign out and Sign in again work.
- [ ] Help → **Copy debug info** copies text without your email address.

## 5. Update and uninstall (test account)

- [ ] Install the previous release, then drag the new one over it: Clod opens as the new version and permissions still work.
- [ ] Help → **Uninstall Clod…** removes it; it no longer opens at login.

## 6. Publish

- [ ] Push `main` and a tag: `git tag v<version> && git push origin main v<version>`
- [ ] Create the GitHub release with the DMG attached:
  ```bash
  gh release create v<version> release/Clod-<version>.dmg --verify-tag --title "Clod <version>" --notes "…"
  ```
- [ ] Download the DMG from the release page in a browser and check it opens.
- [ ] On your own Mac, an older Clod shows "Clod <version> is available" within a day (Settings → Help).
- [ ] Delete the test account when you're done.
