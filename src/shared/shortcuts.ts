/**
 * Clod's in-window keyboard shortcuts (they work while Clod is open and in
 * front). Each can be changed in Settings → Keyboard Shortcuts; changes are
 * saved as settings.shortcuts = { [id]: accelerator }, '' to turn one off.
 * Accelerators use Electron's format, e.g. "Command+Shift+T".
 */
export const APP_SHORTCUTS = [
  { id: 'newTab', label: 'New tab', default: 'Command+T' },
  { id: 'closeTab', label: 'Close tab', default: 'Command+W' },
  { id: 'reopenTab', label: 'Reopen closed tab', default: 'Command+Shift+T' },
  { id: 'searchTabs', label: 'Search tabs', default: 'Command+K' },
  { id: 'openSettings', label: 'Settings', default: 'Command+,' },
] as const

export type AppShortcutId = typeof APP_SHORTCUTS[number]['id']

/** The accelerator for each shortcut, with any saved changes applied. */
export function resolveShortcuts(saved: unknown): Record<AppShortcutId, string> {
  const custom = saved && typeof saved === 'object' ? saved as Record<string, unknown> : {}
  return Object.fromEntries(APP_SHORTCUTS.map((s) =>
    [s.id, typeof custom[s.id] === 'string' ? custom[s.id] as string : s.default])) as Record<AppShortcutId, string>
}

export interface KeyInput { key: string; meta: boolean; control: boolean; alt: boolean; shift: boolean }

/** Whether a key press is this accelerator ('' never matches). */
export function matchesAccelerator(accelerator: string, input: KeyInput): boolean {
  if (!accelerator) return false
  const parts = accelerator.split('+')
  // "Command++" would be the plus key; take the last part as the key.
  const key = accelerator.endsWith('++') ? '+' : parts[parts.length - 1]
  const mods = new Set(parts.slice(0, accelerator.endsWith('++') ? -2 : -1).map((m) => m.toLowerCase()))
  const want = {
    meta: mods.has('command') || mods.has('cmd') || mods.has('commandorcontrol') || mods.has('cmdorctrl'),
    control: mods.has('control') || mods.has('ctrl'),
    alt: mods.has('alt') || mods.has('option'),
    shift: mods.has('shift'),
  }
  if (want.meta !== input.meta || want.control !== input.control || want.alt !== input.alt || want.shift !== input.shift) return false
  const named: Record<string, string> = { space: ' ', enter: 'Enter', tab: 'Tab', backspace: 'Backspace', delete: 'Delete', left: 'ArrowLeft', right: 'ArrowRight', up: 'ArrowUp', down: 'ArrowDown' }
  const expected = named[key.toLowerCase()] ?? key
  return expected.toLowerCase() === input.key.toLowerCase()
}

/** "Command+Shift+T" → "⌘⇧T", for hints. */
export function shortcutSymbols(accelerator: string): string {
  const map: Record<string, string> = { Command: '⌘', Cmd: '⌘', CommandOrControl: '⌘', Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Enter: '↩', Tab: '⇥', Backspace: '⌫', Left: '←', Right: '→', Up: '↑', Down: '↓' }
  return accelerator.split('+').map((p) => map[p] ?? p).join('')
}
