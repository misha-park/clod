/**
 * Bridges the renderer's settings stores to the shared settings file owned by
 * the main process (also edited by the native "Clod Settings" app).
 */

import { create } from 'zustand'
import { resolveShortcuts, shortcutSymbols, type AppShortcutId } from '../shared/shortcuts'

type Settings = Record<string, unknown>

// Loaded synchronously so the stores can initialise at module load, as they
// did when they read localStorage.
const initial: { settings: Settings; existed: boolean } =
  (() => {
    try { return window.clod.getSettingsSync() } catch { return { settings: {}, existed: true } }
  })()

/**
 * Settings for a store at startup. On the first launch with the shared file,
 * fall back to the values the store previously kept in localStorage, so
 * existing preferences carry over.
 */
export function loadInitialSettings(legacyLocalStorageKey: string): Settings {
  if (!initial.existed) {
    try {
      const raw = localStorage.getItem(legacyLocalStorageKey)
      if (raw) return { ...JSON.parse(raw), ...initial.settings }
    } catch {}
  }
  return initial.settings
}

/** Merge values into the shared settings file. */
export function persistSettings(partial: Settings): void {
  try { window.clod.saveSettings(partial) } catch {}
}

/** Called with the full settings object when the settings app changes it. */
export function onExternalSettingsChange(cb: (settings: Settings) => void): void {
  try { window.clod.onSettingsChanged(cb) } catch {}
}

// ─── Keyboard shortcuts (for showing them in hints) ───


const useShortcutStore = create<{ shortcuts: Record<AppShortcutId, string> }>(() => ({
  shortcuts: resolveShortcuts(initial.settings.shortcuts),
}))
onExternalSettingsChange((s) => useShortcutStore.setState({ shortcuts: resolveShortcuts(s.shortcuts) }))

/** A shortcut as symbols ("⌘T"), or '' when it's turned off. */
export function useShortcutLabel(id: AppShortcutId): string {
  const accel = useShortcutStore((s) => s.shortcuts[id])
  return accel ? shortcutSymbols(accel) : ''
}
