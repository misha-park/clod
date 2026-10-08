/**
 * "Explain selection": select text in any app, press the shortcut (⌥⌘E by
 * default, set in Settings), and Clod asks Claude to explain it.
 *
 * The selection is read with the Accessibility API through a small helper
 * (clod-selection), which leaves the clipboard alone. Apps that don't share
 * their selection that way (Chrome, Electron apps…) get a simulated ⌘C
 * instead, after which the clipboard is put back as it was.
 */
import { app, clipboard, globalShortcut } from 'electron'
import { execFile } from 'child_process'
import { join } from 'path'
import { uIOhook, UiohookKey } from 'uiohook-napi'
import { log as _log } from './logger'

function log(msg: string): void {
  _log('explain', msg)
}

export const DEFAULT_EXPLAIN_SHORTCUT = 'Command+Alt+E'

const MODIFIERS: number[] = [UiohookKey.Meta, UiohookKey.MetaRight, UiohookKey.Alt, UiohookKey.AltRight,
  UiohookKey.Shift, UiohookKey.ShiftRight, UiohookKey.Ctrl, UiohookKey.CtrlRight]
const held = new Set<number>()
uIOhook.on('keydown', (e) => { if (MODIFIERS.includes(e.keycode)) held.add(e.keycode) })
uIOhook.on('keyup', (e) => held.delete(e.keycode))

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function helperPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, '..', 'Helpers', 'clod-selection')
    : join(app.getAppPath(), 'dist-native', 'clod-selection')
}

/** The selection via Accessibility, or null if the app doesn't share it. */
function readViaAccessibility(): Promise<string | null> {
  return new Promise((resolve) => {
    execFile(helperPath(), { timeout: 1500, encoding: 'utf-8', maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      resolve(!err && stdout.trim() ? stdout : null)
    })
  })
}

/** The selection via a simulated ⌘C, restoring the clipboard afterwards. */
async function readViaCopy(): Promise<string | null> {
  // The shortcut's own keys are usually still held; ⌘⌥C would do something else.
  for (let i = 0; i < 16 && held.size > 0; i++) await sleep(50)
  for (const key of held) { try { uIOhook.keyToggle(key, 'up') } catch {} }

  const saved = {
    text: clipboard.readText(),
    html: clipboard.readHTML(),
    rtf: clipboard.readRTF(),
    image: clipboard.readImage(),
  }
  const marker = `clod-selection-${Date.now()}`
  clipboard.writeText(marker)
  try { uIOhook.keyTap(UiohookKey.C, [UiohookKey.Meta]) } catch { return null }

  let text: string | null = null
  for (let i = 0; i < 15; i++) {
    await sleep(40)
    const now = clipboard.readText()
    if (now !== marker) { text = now; break }
  }

  clipboard.clear()
  const restore: Electron.Data = {}
  if (saved.text) restore.text = saved.text
  if (saved.html) restore.html = saved.html
  if (saved.rtf) restore.rtf = saved.rtf
  if (!saved.image.isEmpty()) restore.image = saved.image
  if (Object.keys(restore).length) clipboard.write(restore)

  return text && text.trim() ? text : null
}

export async function readSelectedText(): Promise<string | null> {
  return (await readViaAccessibility()) ?? (await readViaCopy())
}

let registered: string | null = null

/** (Re)register the shortcut. An empty accelerator turns the feature off. */
export function registerExplainShortcut(accelerator: string, onSelection: (text: string | null) => void): void {
  if (registered === accelerator) return
  if (registered) { try { globalShortcut.unregister(registered) } catch {} }
  registered = null
  if (!accelerator) { log('Explain selection shortcut turned off'); return }
  try {
    const ok = globalShortcut.register(accelerator, () => {
      readSelectedText().then(onSelection, () => onSelection(null))
    })
    if (ok) { registered = accelerator; log(`Explain selection shortcut: ${accelerator}`) }
    else log(`Couldn't register ${accelerator} (another app may be using it)`)
  } catch (err) {
    log(`Invalid explain shortcut ${accelerator}: ${(err as Error).message}`)
  }
}
