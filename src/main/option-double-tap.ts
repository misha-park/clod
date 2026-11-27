import { powerMonitor, systemPreferences } from 'electron'
import { uIOhook, UiohookKey } from 'uiohook-napi'
import { log as _log } from './logger'
import { createDoubleTapDetector } from './double-tap-detector'

function log(msg: string): void {
  _log('DoubleTap', msg)
}

// Left Option = 56, Right Option = 3640
const OPTION_KEYS = new Set<number>([UiohookKey.Alt, UiohookKey.AltRight])

export function registerOptionDoubleTap(onDoubleTap: () => void): void {
  const detector = createDoubleTapDetector({
    onDoubleTap: () => { log('Double-tap Option'); onDoubleTap() },
    isTargetKey: (keycode) => OPTION_KEYS.has(keycode),
    // TAP_MAX_MS = 250, DOUBLE_TAP_GAP_MS = 400 (detector defaults)
  })

  uIOhook.on('keydown', (e) => detector.keydown(e.keycode))
  uIOhook.on('keyup', (e) => detector.keyup(e.keycode))
  uIOhook.on('input', () => { lastInputAt = Date.now() })

  try {
    uIOhook.start()
    log('Key hook started — double-tap Option to toggle')
  } catch (err) {
    log(`Key hook failed to start: ${(err as Error).message}`)
  }
  watchHook()
}

let lastInputAt = Date.now()
let watching = false

/**
 * macOS can quietly switch the key hook off (after sleep, a screen lock, or
 * when the system was too busy to answer it in time), and then double-tap
 * Option did nothing until Clod was restarted. Start it again after waking or
 * unlocking, and whenever someone is clearly using the Mac but the hook has
 * heard nothing at all (it normally hears every key and mouse move) for a
 * minute.
 */
function watchHook(): void {
  if (watching) return
  watching = true
  const later = (why: string) => () => setTimeout(() => restartOptionDoubleTap(why), 2000)
  powerMonitor.on('resume', later('after waking'))
  powerMonitor.on('unlock-screen', later('after unlocking'))
  setInterval(() => {
    if (!systemPreferences.isTrustedAccessibilityClient(false)) return // it can't hear anything yet
    const quietFor = Date.now() - lastInputAt
    if (quietFor > 60_000 && powerMonitor.getSystemIdleTime() < 5) {
      restartOptionDoubleTap(`it had heard nothing for ${Math.round(quietFor / 1000)}s while the Mac was in use`)
    }
  }, 15_000).unref?.()
}

/**
 * Restart the key hook, e.g. once Accessibility has just been granted: a hook
 * started without the permission never receives keys, even after it's allowed.
 */
export function restartOptionDoubleTap(why = 'Accessibility was just allowed'): void {
  try { uIOhook.stop() } catch {}
  lastInputAt = Date.now()
  try {
    uIOhook.start()
    log(`Key hook restarted (${why})`)
  } catch (err) {
    log(`Key hook failed to restart: ${(err as Error).message}`)
  }
}

export function stopOptionDoubleTap(): void {
  try {
    uIOhook.stop()
  } catch {}
}
