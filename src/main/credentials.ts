/**
 * A sign-in credential pasted into Clod: a long-lived Claude token (from
 * `claude setup-token`) or an Anthropic API key. It is the alternative to the
 * Claude CLI's own login, which Clod uses when nothing is stored here.
 *
 * The value is encrypted with Electron's safeStorage (a key kept in the macOS
 * Keychain) and never written to settings.json or state.json.
 */
import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'

export type CredentialKind = 'oauthToken' | 'apiKey'

interface Credential {
  kind: CredentialKind
  value: string
}

const DIR = join(app.getPath('appData'), 'Clod')
const PATH = join(DIR, 'credential.bin')

let cached: Credential | null | undefined

export function getStoredCredential(): Credential | null {
  if (cached !== undefined) return cached
  let found: Credential | null = null
  try {
    if (existsSync(PATH) && safeStorage.isEncryptionAvailable()) {
      const parsed = JSON.parse(safeStorage.decryptString(readFileSync(PATH)))
      if ((parsed.kind === 'oauthToken' || parsed.kind === 'apiKey') && typeof parsed.value === 'string') {
        found = parsed
      }
    }
  } catch {}
  cached = found
  return found
}

export function storeCredential(kind: CredentialKind, value: string): void {
  const trimmed = value.trim()
  if (!trimmed) throw new Error('Nothing was pasted.')
  if (!safeStorage.isEncryptionAvailable()) throw new Error('The Keychain is not available, so Clod cannot store this safely.')
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true })
  writeFileSync(PATH, safeStorage.encryptString(JSON.stringify({ kind, value: trimmed })), { mode: 0o600 })
  cached = { kind, value: trimmed }
}

export function clearCredential(): void {
  try { rmSync(PATH, { force: true }) } catch {}
  cached = null
}

/** Environment variables that make the claude CLI use the stored credential. */
export function credentialEnv(): Record<string, string> {
  const credential = getStoredCredential()
  if (!credential) return {}
  return credential.kind === 'oauthToken'
    ? { CLAUDE_CODE_OAUTH_TOKEN: credential.value }
    : { ANTHROPIC_API_KEY: credential.value }
}
