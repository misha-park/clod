/**
 * Shared settings file — the single source of truth for user settings.
 *
 * Both the overlay (renderer, via IPC) and the native "Clod Settings" app read
 * and write ~/Library/Application Support/Clod/settings.json. The main process
 * owns the file: it merges partial updates, writes atomically, and watches for
 * changes made by the settings app so it can push them to the renderer.
 *
 * A second file, state.json, is written only by Clod. It exposes values the
 * settings app cannot work out itself (Accessibility status, model labels).
 */
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'fs'

export type SettingsObject = Record<string, unknown>

const DIR = join(app.getPath('appData'), 'Clod')
const SETTINGS_PATH = join(DIR, 'settings.json')
const STATE_PATH = join(DIR, 'state.json')

function ensureDir(): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true })
}

function writeAtomic(path: string, data: SettingsObject): void {
  ensureDir()
  const tmp = `${path}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n')
  renameSync(tmp, path)
}

function readJson(path: string): SettingsObject | null {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8'))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Last content Clod wrote or loaded, as a string, to detect real changes. */
let lastKnown = ''
let current: SettingsObject = readJson(SETTINGS_PATH) ?? {}
lastKnown = JSON.stringify(current)

/** Whether settings.json existed before this launch (false → migrate from localStorage). */
export const settingsFileExisted = existsSync(SETTINGS_PATH)

export function getSettings(): SettingsObject {
  return current
}

/** Merge a partial update into the file. Returns true if anything changed. */
export function saveSettings(partial: SettingsObject): boolean {
  const merged = { ...(readJson(SETTINGS_PATH) ?? current), ...partial }
  const serialized = JSON.stringify(merged)
  if (serialized === lastKnown && existsSync(SETTINGS_PATH)) return false
  current = merged
  lastKnown = serialized
  writeAtomic(SETTINGS_PATH, merged)
  return true
}

/**
 * Poll the file for changes made by the settings app. Polling (rather than
 * fs.watch) survives the atomic rename the settings app also uses.
 */
export function watchSettings(onExternalChange: (settings: SettingsObject) => void): void {
  let lastMtime = existsSync(SETTINGS_PATH) ? statSync(SETTINGS_PATH).mtimeMs : 0
  setInterval(() => {
    if (!existsSync(SETTINGS_PATH)) return
    const mtime = statSync(SETTINGS_PATH).mtimeMs
    if (mtime === lastMtime) return
    lastMtime = mtime
    const next = readJson(SETTINGS_PATH)
    if (!next) return
    const serialized = JSON.stringify(next)
    if (serialized === lastKnown) return // our own write
    current = next
    lastKnown = serialized
    onExternalChange(next)
  }, 400)
}

let state: SettingsObject = readJson(STATE_PATH) ?? {}

/** Merge values into state.json for the settings app to read. */
export function publishState(partial: SettingsObject): void {
  const merged = { ...state, ...partial }
  if (JSON.stringify(merged) === JSON.stringify(state) && existsSync(STATE_PATH)) return
  state = merged
  try { writeAtomic(STATE_PATH, merged) } catch {}
}
