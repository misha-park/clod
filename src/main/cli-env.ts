import { execSync } from 'child_process'
import { homedir } from 'os'
import { join } from 'path'
import { credentialEnv } from './credentials'

let cachedPath: string | null = null

function appendPathEntries(target: string[], seen: Set<string>, rawPath: string | undefined): void {
  if (!rawPath) return
  for (const entry of rawPath.split(':')) {
    const p = entry.trim()
    if (!p || seen.has(p)) continue
    seen.add(p)
    target.push(p)
  }
}

function getCliPath(): string {
  if (cachedPath) return cachedPath

  const ordered: string[] = []
  const seen = new Set<string>()

  // Start from current process PATH.
  appendPathEntries(ordered, seen, process.env.PATH)

  // Add common binary locations used on macOS: Claude Code's own installer
  // (~/.local/bin, which a fresh install may not have added to the shell yet),
  // Homebrew and the system.
  appendPathEntries(ordered, seen, `${join(homedir(), '.local', 'bin')}:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`)

  // Try interactive login shell first so nvm/asdf/etc. PATH hooks are loaded.
  const pathCommands = [
    '/bin/zsh -ilc "echo $PATH"',
    '/bin/zsh -lc "echo $PATH"',
    '/bin/bash -lc "echo $PATH"',
  ]

  for (const cmd of pathCommands) {
    try {
      const discovered = execSync(cmd, { encoding: 'utf-8', timeout: 3000 }).trim()
      appendPathEntries(ordered, seen, discovered)
    } catch {
      // Keep trying fallbacks.
    }
  }

  cachedPath = ordered.join(':')
  return cachedPath
}

/** Forget the discovered PATH, e.g. after Claude Code has just been installed. */
export function resetCliPath(): void {
  cachedPath = null
}

export function getCliEnv(extraEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...extraEnv,
    PATH: getCliPath(),
  }
  delete env.CLAUDECODE
  return env
}


/**
 * Environment for running the claude CLI itself: getCliEnv plus the credential
 * pasted into Clod, if any. Kept separate so the token or API key is not
 * passed to the user's own shell commands.
 */
export function getClaudeEnv(extraEnv?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return getCliEnv({ ...extraEnv, ...credentialEnv() })
}
