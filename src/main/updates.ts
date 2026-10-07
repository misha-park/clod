/**
 * Checks GitHub once a day for a newer Clod release. Clod isn't signed with
 * an Apple Developer ID, so it can't update itself; instead the settings app
 * and the menu bar show "Clod x.y.z is available" with a link to download it.
 */
import { app, net } from 'electron'
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
  url: string
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
    const release = await res.json() as { tag_name?: string; html_url?: string; draft?: boolean; prerelease?: boolean }
    if (!release.tag_name || release.draft || release.prerelease) return
    const current = app.getVersion()
    if (isNewer(release.tag_name, current)) {
      available = { version: release.tag_name.replace(/^v/i, ''), url: release.html_url || 'https://github.com/misha-park/clod/releases' }
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

/** Check now and then daily. onFoundCb runs whenever a newer version is found. */
export function startUpdateChecks(onFoundCb: (update: AvailableUpdate) => void): void {
  onFound = onFoundCb
  setTimeout(check, 10_000) // after startup settles
  const timer = setInterval(check, CHECK_EVERY_MS)
  timer.unref?.()
}
