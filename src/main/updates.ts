/**
 * Checks GitHub once a day for a newer Clod release. Clod isn't signed with
 * an Apple Developer ID, so it can't update itself; instead the settings app
 * and the menu bar show "Clod x.y.z is available". Downloading it saves the new
 * DMG to Downloads, opens it, and quits Clod so it can be replaced.
 */
import { app, net, shell } from 'electron'
import { createWriteStream } from 'fs'
import { join } from 'path'
import { publishState } from './settings-file'
import { log as _log } from './logger'
import { isNewer } from '../shared/version'

function log(msg: string): void {
  _log('updates', msg)
}

const RELEASES_API = 'https://api.github.com/repos/misha-park/clod/releases/latest'
const CHECK_EVERY_MS = 24 * 60 * 60 * 1000

export interface AvailableUpdate {
  version: string
  /** The release page */
  url: string
  /** The DMG itself, when the release has one */
  dmgUrl?: string
}

let available: AvailableUpdate | null = null
let onFound: (update: AvailableUpdate) => void = () => {}

export function getAvailableUpdate(): AvailableUpdate | null {
  return available
}

async function check(): Promise<void> {
  try {
    const res = await net.fetch(RELEASES_API, { headers: { Accept: 'application/vnd.github+json' } })
    if (!res.ok) return // no releases yet, or GitHub unreachable
    const release = await res.json() as {
      tag_name?: string; html_url?: string; draft?: boolean; prerelease?: boolean
      assets?: Array<{ name: string; browser_download_url: string }>
    }
    if (!release.tag_name || release.draft || release.prerelease) return
    const current = app.getVersion()
    if (isNewer(release.tag_name, current)) {
      available = {
        version: release.tag_name.replace(/^v/i, ''),
        url: release.html_url || 'https://github.com/misha-park/clod/releases',
        dmgUrl: release.assets?.find((a) => a.name.endsWith('.dmg'))?.browser_download_url,
      }
      log(`Update available: ${available.version} (running ${current})`)
      onFound(available)
    } else {
      available = null
    }
    publishState({ update: available })
  } catch (err) {
    log(`Update check failed: ${(err as Error).message}`)
  }
}

let downloading = false

/**
 * Download the new DMG into Downloads (showing progress in the settings app),
 * open it, and quit so the new Clod can be dragged over this one.
 */
export async function downloadUpdate(): Promise<void> {
  if (!available) throw new Error('No update to download.')
  if (!available.dmgUrl) { shell.openExternal(available.url); return }
  if (downloading) return
  downloading = true
  const update = available
  const publishProgress = (extra: Record<string, unknown>) => publishState({ update: { ...update, ...extra } })
  try {
    log(`Downloading ${update.dmgUrl}`)
    publishProgress({ progress: 0 })
    const res = await net.fetch(update.dmgUrl!)
    if (!res.ok || !res.body) throw new Error(`The download failed (${res.status}).`)
    const total = Number(res.headers.get('content-length')) || 0
    const file = join(app.getPath('downloads'), `Clod-${update.version}.dmg`)
    const out = createWriteStream(file)
    const reader = res.body.getReader()
    let received = 0, lastShown = 0
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.length
      if (!out.write(Buffer.from(value))) await new Promise<void>((r) => out.once('drain', () => r()))
      const progress = total ? received / total : 0
      if (progress - lastShown >= 0.02) { lastShown = progress; publishProgress({ progress }) }
    }
    await new Promise<void>((resolve, reject) => { out.on('error', reject); out.end(() => resolve()) })
    log(`Downloaded to ${file}`)
    publishProgress({ progress: 1, downloaded: file })
    const err = await shell.openPath(file)
    if (err) throw new Error(err)
    // Clod has to be closed before the new copy can replace it.
    setTimeout(() => app.quit(), 1500)
  } catch (err) {
    log(`Update download failed: ${(err as Error).message}`)
    publishProgress({ error: (err as Error).message })
    throw err
  } finally {
    downloading = false
  }
}

/** Check now and then daily. onFoundCb runs whenever a newer version is found. */
export function startUpdateChecks(onFoundCb: (update: AvailableUpdate) => void): void {
  onFound = onFoundCb
  setTimeout(check, 10_000) // after startup settles
  const timer = setInterval(check, CHECK_EVERY_MS)
  timer.unref?.()
}
