import { useEffect, useState } from 'react'
import { X } from '@phosphor-icons/react'
import { useColors, useThemeStore } from '../theme'
import { loadInitialSettings, persistSettings } from '../settings-sync'

/** Shown until the shortcut has been used this many times (or the tip is closed). */
const USES_TO_LEARN = 2

/** "Command+Shift+K" → "⌘⇧K" */
function prettyAccelerator(accel: string): string {
  const keys: Record<string, string> = { Command: '⌘', CommandOrControl: '⌘', Cmd: '⌘', Shift: '⇧', Alt: '⌥', Option: '⌥', Control: '⌃', Ctrl: '⌃' }
  return accel.split('+').map((k) => keys[k] ?? k).join('')
}

/**
 * First-run reminder of how to show and hide Clod. It retires itself once the
 * user has used the shortcut a couple of times, so it never becomes clutter.
 */
export function HotkeyTip() {
  const colors = useColors()
  const hotkeyMode = useThemeStore((s) => s.hotkeyMode)
  const hotkeyAccelerator = useThemeStore((s) => s.hotkeyAccelerator)
  const [done, setDone] = useState(() => loadInitialSettings('').hotkeyTipDone === true)

  useEffect(() => {
    if (done) return
    let uses = 0
    return window.clod.onHotkeyUsed(() => {
      uses += 1
      if (uses >= USES_TO_LEARN) retire()
    })
  }, [done])

  const retire = () => {
    setDone(true)
    persistSettings({ hotkeyTipDone: true })
  }

  if (done) return null
  const shortcut = hotkeyMode === 'accelerator' && hotkeyAccelerator
    ? <>Press <b>{prettyAccelerator(hotkeyAccelerator)}</b></>
    : <>Double-tap <b>⌥ Option</b></>

  return (
    <div
      className="flex items-center gap-2 text-[12px] px-3 py-1.5 rounded-full"
      style={{ background: colors.surfaceHover, color: colors.textSecondary }}
    >
      <span>{shortcut} to show or hide Clod from any app.</span>
      <button onClick={retire} aria-label="Dismiss tip" className="flex" style={{ color: colors.textTertiary }}>
        <X size={11} />
      </button>
    </div>
  )
}
