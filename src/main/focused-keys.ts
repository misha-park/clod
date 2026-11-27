/**
 * ⌘ keys while the overlay is in front.
 *
 * Clod's window is a non-activating panel: it takes the keyboard without
 * making Clod the active app, so the app behind keeps its hover state and
 * menu bar. The catch is that macOS gives that app's menu first claim on ⌘
 * keys: ⌘V pasted into the window behind Clod, ⌘C copied from it, and ⌘W
 * would close it. Plain typing was unaffected.
 *
 * So while Clod's window has the keyboard, the edit keys and Clod's own
 * shortcuts are claimed as system hotkeys, which macOS handles before any
 * app's menu, and given back the moment Clod loses focus.
 */
import { BrowserWindow, globalShortcut, WebContents } from 'electron'
import { log as _log } from './logger'

function log(msg: string): void {
  _log('Keys', msg)
}

const EDIT_KEYS: Array<[string, (wc: WebContents) => void]> = [
  ['Command+Z', (wc) => wc.undo()],
  ['Command+Shift+Z', (wc) => wc.redo()],
  ['Command+X', (wc) => wc.cut()],
  ['Command+C', (wc) => wc.copy()],
  ['Command+V', (wc) => wc.paste()],
  ['Command+Shift+V', (wc) => wc.pasteAndMatchStyle()],
  ['Command+A', (wc) => wc.selectAll()],
]

/**
 * @param appKeys Clod's own shortcuts as [accelerator, action], read each
 *   time the window gains focus so changes made in Settings apply.
 */
export function claimKeysWhileFocused(win: BrowserWindow, appKeys: () => Array<[string, () => void]>): void {
  if (process.platform !== 'darwin') return // elsewhere the focused window gets its keys
  let held: string[] = []

  const release = (): void => {
    for (const accel of held) { try { globalShortcut.unregister(accel) } catch {} }
    held = []
  }

  const claim = (): void => {
    release()
    const wc = win.webContents
    const keys: Array<[string, () => void]> = [
      ...EDIT_KEYS.map(([accel, run]): [string, () => void] => [accel, () => run(wc)]),
      ...appKeys(),
    ]
    const failed: string[] = []
    for (const [accel, run] of keys) {
      if (!accel || held.includes(accel)) continue
      // Already taken, e.g. by Clod's own show/hide shortcut: leave it be.
      if (globalShortcut.isRegistered(accel)) continue
      try {
        if (globalShortcut.register(accel, run)) held.push(accel)
        else failed.push(accel)
      } catch { failed.push(accel) }
    }
    if (failed.length) log(`Couldn't claim ${failed.join(', ')}`)
  }

  win.on('focus', claim)
  win.on('blur', release)
  win.on('hide', release)
  win.on('closed', release)
}
