/**
 * First-run setup and account management, driven by the native settings app.
 *
 * Everything that has to run as Clod lives here: macOS only grants permissions
 * to the app that asks, and the claude CLI is launched by Clod. The settings
 * app sends commands over a Unix socket in Clod's support folder (readable only
 * by this user), and reads progress from the `setup` key in state.json.
 *
 * Commands are newline-delimited JSON: {"id": 1, "cmd": "refresh", ...}; each
 * gets one reply: {"id": 1, "ok": true} or {"id": 1, "ok": false, "error": "…"}.
 */
import { app, clipboard, shell, systemPreferences } from 'electron'
import { ChildProcess, execFile, spawn } from 'child_process'
import { createServer, Server, Socket } from 'net'
import { chmodSync, existsSync, rmSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { homedir, tmpdir } from 'os'
import { getCliEnv, getClaudeEnv, resetCliPath } from './cli-env'
import { clearCredential, CredentialKind, getStoredCredential, storeCredential } from './credentials'
import { getSettings, publishState } from './settings-file'
import { log as _log, LOG_FILE, readLogTail } from './logger'
import { downloadUpdate } from './updates'
import { buildReport, reportProblem } from './report'

function log(msg: string): void {
  _log('setup', msg)
}

const INSTALL_SCRIPT_URL = 'https://claude.ai/install.sh'
const SOCKET_PATH = join(app.getPath('appData'), 'Clod', 'control.sock')

type Permission = 'accessibility' | 'screen' | 'automation'

interface TaskState {
  kind: 'install' | 'login'
  state: 'running' | 'done' | 'failed'
  /** Last line of output, or the error */
  message: string
  /** Sign-in page, once the CLI has printed it */
  url?: string
  /** Signing in in a Terminal window instead of through Clod */
  terminal?: boolean
}

interface SetupState {
  cli: { installed: boolean; version: string | null }
  auth: {
    loggedIn: boolean
    method: string | null
    email: string | null
    orgName: string | null
    subscription: string | null
  }
  /** Credential pasted into Clod, if any (the value itself is never published) */
  credential: CredentialKind | null
  permissions: {
    accessibility: boolean
    screen: string
    /** 'granted' | 'denied' | 'unknown' (only learned by asking) */
    automation: string
  }
  task: TaskState | null
}

const state: SetupState = {
  cli: { installed: false, version: null },
  auth: { loggedIn: false, method: null, email: null, orgName: null, subscription: null },
  credential: null,
  permissions: { accessibility: false, screen: 'not-determined', automation: 'unknown' },
  task: null,
}

let loginProcess: ChildProcess | null = null
let onAuthChanged: () => void = () => {}

function publish(): void {
  publishState({ setup: JSON.parse(JSON.stringify(state)) })
}

function setTask(task: TaskState | null): void {
  state.task = task
  publish()
}

/** Run a command and resolve with its output (never rejects). */
function run(file: string, args: string[], env: NodeJS.ProcessEnv, timeout = 15000): Promise<{ ok: boolean; out: string }> {
  return new Promise((resolve) => {
    execFile(file, args, { env, timeout, encoding: 'utf-8' }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: `${stdout || ''}${stderr || ''}`.trim() })
    })
  })
}

// ─── Status ───

async function refreshCli(): Promise<void> {
  const { ok, out } = await run('/bin/sh', ['-c', 'command -v claude >/dev/null && claude -v'], getCliEnv())
  state.cli = { installed: ok, version: ok ? out.split(/\s/)[0] || out : null }
}

async function refreshAuth(): Promise<void> {
  state.credential = getStoredCredential()?.kind ?? null
  if (!state.cli.installed) {
    state.auth = { loggedIn: false, method: null, email: null, orgName: null, subscription: null }
    return
  }
  const { out } = await run('/bin/sh', ['-c', 'claude auth status --json'], getClaudeEnv())
  try {
    const s = JSON.parse(out.slice(out.indexOf('{')))
    state.auth = {
      loggedIn: !!s.loggedIn,
      method: typeof s.authMethod === 'string' ? s.authMethod : null,
      email: typeof s.email === 'string' ? s.email : null,
      orgName: typeof s.orgName === 'string' ? s.orgName : null,
      subscription: typeof s.subscriptionType === 'string' ? s.subscriptionType : null,
    }
  } catch {
    state.auth = { loggedIn: false, method: null, email: null, orgName: null, subscription: null }
  }
}

function refreshPermissions(): void {
  if (process.platform !== 'darwin') return
  state.permissions.accessibility = systemPreferences.isTrustedAccessibilityClient(false)
  state.permissions.screen = systemPreferences.getMediaAccessStatus('screen')
}

/** Re-check permissions (they change in System Settings without telling Clod). */
export function refreshPermissionState(): void {
  const before = JSON.stringify(state.permissions)
  refreshPermissions()
  if (JSON.stringify(state.permissions) !== before) publish()
}

export async function refreshSetupState(): Promise<void> {
  await refreshCli()
  await refreshAuth()
  refreshPermissions()
  publish()
}

/** True when Claude Code is installed and signed in (used to decide whether to show setup). */
export function isSetUp(): boolean {
  return state.cli.installed && state.auth.loggedIn
}

// ─── Installing Claude Code ───

function installCli(): void {
  if (state.task?.state === 'running') throw new Error('Something else is still running.')
  setTask({ kind: 'install', state: 'running', message: 'Downloading Claude Code…' })
  log('Installing Claude Code')
  // The official installer: downloads the native build into ~/.local/bin.
  const child = spawn('/bin/bash', ['-c', `curl -fsSL ${INSTALL_SCRIPT_URL} | bash`], { env: getCliEnv() })
  let lastLine = ''
  const onData = (chunk: Buffer) => {
    // Strip terminal colour codes; show the latest meaningful line.
    const lines = chunk.toString().replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').split(/[\r\n]+/).map((l) => l.trim()).filter(Boolean)
    if (lines.length) {
      lastLine = lines[lines.length - 1]
      setTask({ kind: 'install', state: 'running', message: lastLine })
    }
  }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  child.on('close', async (code) => {
    resetCliPath()
    await refreshCli()
    const ok = code === 0 && state.cli.installed
    log(`Install finished (exit ${code}, installed ${state.cli.installed})`)
    await refreshAuth()
    setTask({
      kind: 'install',
      state: ok ? 'done' : 'failed',
      message: ok ? `Installed Claude Code ${state.cli.version ?? ''}`.trim()
        : `The install didn't finish. ${lastLine || 'Check your internet connection and try again.'}`,
    })
  })
}

// ─── Signing in ───

function login(method: 'claudeai' | 'console'): void {
  if (!state.cli.installed) throw new Error('Install Claude Code first.')
  if (loginProcess) cancelLogin()
  setTask({ kind: 'login', state: 'running', message: 'Opening your browser…' })
  log(`Signing in (${method})`)
  const args = ['auth', 'login', ...(method === 'console' ? ['--console'] : [])]
  // getCliEnv, not getClaudeEnv: a pasted credential must not stand in for the login itself.
  const child = spawn('claude', args, { env: getCliEnv(), stdio: ['pipe', 'pipe', 'pipe'] })
  loginProcess = child
  let output = ''
  const onData = (chunk: Buffer) => {
    output += chunk.toString()
    const url = output.match(/https:\/\/\S+/)?.[0]
    if (url && state.task?.kind === 'login' && !state.task.url) {
      setTask({ kind: 'login', state: 'running', message: 'Finish signing in in your browser.', url })
    }
  }
  child.stdout?.on('data', onData)
  child.stderr?.on('data', onData)
  child.on('close', async (code) => {
    if (loginProcess !== child) return // cancelled or replaced
    loginProcess = null
    await refreshAuth()
    const ok = code === 0 && state.auth.loggedIn
    log(`Sign-in finished (exit ${code}, signed in ${state.auth.loggedIn})`)
    if (ok) onAuthChanged()
    const lastLine = output.trim().split('\n').pop() ?? ''
    setTask({
      kind: 'login',
      state: ok ? 'done' : 'failed',
      message: ok ? 'Signed in.' : `Sign-in didn't finish. ${lastLine}`.trim(),
    })
  })
}

let terminalPoll: ReturnType<typeof setInterval> | null = null

/**
 * Fallback: sign in in a Terminal window, where `claude auth login` is known
 * to work. A .command file opens in Terminal without needing the Automation
 * permission. Clod checks every few seconds until the sign-in shows up.
 */
function loginInTerminal(method: 'claudeai' | 'console'): void {
  if (!state.cli.installed) throw new Error('Install Claude Code first.')
  if (loginProcess) cancelLogin()
  const file = join(tmpdir(), 'Clod sign-in.command')
  writeFileSync(file, `#!/bin/bash
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
echo "Signing in to Claude Code for Clod…"
echo
claude auth login${method === 'console' ? ' --console' : ''}
echo
echo "All done. You can close this window and go back to Clod."
`, { mode: 0o700 })
  execFile('/usr/bin/open', ['-a', 'Terminal', file])
  log(`Signing in in Terminal (${method})`)
  setTask({ kind: 'login', state: 'running', message: 'Finish signing in in the Terminal window.', terminal: true })

  if (terminalPoll) clearInterval(terminalPoll)
  const started = Date.now()
  terminalPoll = setInterval(async () => {
    if (state.task?.kind !== 'login' || !state.task.terminal || Date.now() - started > 15 * 60 * 1000) {
      clearInterval(terminalPoll!)
      terminalPoll = null
      return
    }
    await refreshAuth()
    if (state.auth.loggedIn) {
      clearInterval(terminalPoll!)
      terminalPoll = null
      onAuthChanged()
      setTask({ kind: 'login', state: 'done', message: 'Signed in.' })
    }
  }, 3000)
}

/** The code shown in the browser after signing in, for the CLI's "Paste code here" prompt. */
function submitCode(code: string): void {
  if (!loginProcess?.stdin) throw new Error('Start signing in first.')
  loginProcess.stdin.write(`${code.trim()}\n`)
  setTask({ kind: 'login', state: 'running', message: 'Checking the code…', url: state.task?.url })
}

function cancelLogin(): void {
  if (terminalPoll) { clearInterval(terminalPoll); terminalPoll = null }
  const child = loginProcess
  loginProcess = null
  child?.kill('SIGTERM')
  setTask(null)
}

async function logout(): Promise<void> {
  await run('/bin/sh', ['-c', 'claude auth logout'], getCliEnv())
  await refreshAuth()
  onAuthChanged()
  publish()
}

// ─── Permissions ───

function requestPermission(name: Permission): void {
  if (process.platform !== 'darwin') return
  if (name === 'accessibility') {
    systemPreferences.isTrustedAccessibilityClient(true) // shows the system prompt
  } else if (name === 'screen') {
    // A silent capture makes macOS ask for Screen Recording on Clod's behalf,
    // using the same route as the screenshot button. The image is thrown away.
    const file = join(tmpdir(), `clod-permission-${process.pid}.png`)
    execFile('/usr/sbin/screencapture', ['-x', file], () => {
      try { rmSync(file, { force: true }) } catch {}
      refreshPermissions()
      publish()
    })
  } else {
    // Ask Terminal for its window count: the first Apple event to Terminal
    // makes macOS ask whether Clod may control it. Quit Terminal again if it
    // wasn't open before.
    const script = `set wasRunning to application "Terminal" is running
tell application "Terminal" to count windows
if not wasRunning then tell application "Terminal" to quit`
    execFile('/usr/bin/osascript', ['-e', script], (err) => {
      state.permissions.automation = !err ? 'granted' : /-1743|Not authori[sz]ed/i.test(String(err.message)) ? 'denied' : 'unknown'
      publish()
    })
  }
}

const PRIVACY_PANES: Record<Permission, string> = {
  accessibility: 'Privacy_Accessibility',
  screen: 'Privacy_ScreenCapture',
  automation: 'Privacy_Automation',
}

function openPrivacyPane(name: Permission): void {
  shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${PRIVACY_PANES[name]}`)
}

// ─── Debug info and uninstalling ───

/** Settings worth including in a bug report (no prompts, paths or keys). */
const DEBUG_SETTING_KEYS = ['themeMode', 'expandedUI', 'windowPosition', 'hotkeyMode', 'permissionMode',
  'preferredModel', 'historyLayout', 'thinkingAnimation', 'openAtLogin', 'setupCompleted']

/** Versions, setup status and non-private settings, for bug reports. */
export function describeSetup(): string {
  const settings = getSettings()
  const p = state.permissions
  return [
    `Clod ${app.getVersion()} · macOS ${process.getSystemVersion()} · ${process.arch}`,
    `Claude Code: ${state.cli.installed ? state.cli.version : 'not installed'}`,
    `Signed in: ${state.auth.loggedIn ? `yes (${state.auth.method ?? '?'}${state.auth.subscription ? `, ${state.auth.subscription}` : ''})` : 'no'}` +
      (state.credential ? ` · pasted ${state.credential}` : ''),
    `Permissions: accessibility ${p.accessibility ? 'allowed' : 'not allowed'} · screen ${p.screen} · terminal ${p.automation}`,
    `Settings: ${DEBUG_SETTING_KEYS.map((k) => `${k}=${JSON.stringify(settings[k])}`).join(' ')}`,
  ].join('\n')
}

/** Copy the full bug report (setup, recent problems and the log). */
function copyDebugInfo(): void {
  clipboard.writeText(buildReport())
  log('Copied debug info')
}

/**
 * Remove Clod: its login item, settings, stored credential and log, then move
 * the app to the Bin and quit. Claude Code itself is left installed.
 */
function uninstall(): void {
  log('Uninstalling Clod')
  app.setLoginItemSettings({ openAtLogin: false })
  clearCredential()
  stopSetupServer()
  // …/Clod.app/Contents/MacOS/Clod → …/Clod.app
  const bundle = dirname(dirname(dirname(app.getPath('exe'))))
  const trash = bundle.endsWith('.app') && app.isPackaged ? shell.trashItem(bundle) : Promise.resolve()
  trash.catch(() => {}).finally(() => {
    for (const path of [join(app.getPath('appData'), 'Clod'), LOG_FILE, join(homedir(), '.clod-debug.log')]) {
      try { rmSync(path, { recursive: true, force: true }) } catch {}
    }
    app.exit(0)
  })
}

// ─── Control socket ───

async function handle(msg: Record<string, any>): Promise<void> {
  switch (msg.cmd) {
    case 'refresh': return refreshSetupState()
    case 'installCli': return installCli()
    case 'login': return login(msg.method === 'console' ? 'console' : 'claudeai')
    case 'loginInTerminal': return loginInTerminal(msg.method === 'console' ? 'console' : 'claudeai')
    case 'submitCode': return submitCode(String(msg.code ?? ''))
    case 'cancelLogin': return cancelLogin()
    case 'logout': return logout()
    case 'setCredential': {
      if (msg.kind !== 'oauthToken' && msg.kind !== 'apiKey') throw new Error('Unknown credential type.')
      storeCredential(msg.kind, String(msg.value ?? ''))
      log(`Stored a pasted ${msg.kind}`)
      await refreshAuth()
      onAuthChanged()
      return publish()
    }
    case 'clearCredential': {
      clearCredential()
      log('Removed the pasted credential')
      await refreshAuth()
      onAuthChanged()
      return publish()
    }
    case 'requestPermission':
      if (!['accessibility', 'screen', 'automation'].includes(msg.name)) throw new Error('Unknown permission.')
      return requestPermission(msg.name)
    case 'openPrivacyPane':
      if (!PRIVACY_PANES[msg.name as Permission]) throw new Error('Unknown permission.')
      return openPrivacyPane(msg.name)
    case 'copyDebugInfo': return copyDebugInfo()
    case 'downloadUpdate': return downloadUpdate()
    case 'reportProblem': return reportProblem()
    case 'uninstall':
      // Reply first; the app is gone a moment later.
      setTimeout(uninstall, 300)
      return
    case 'relaunch':
      app.relaunch()
      app.exit(0)
      return
    default:
      throw new Error(`Unknown command: ${msg.cmd}`)
  }
}

function serve(socket: Socket): void {
  let buffer = ''
  socket.on('data', (chunk) => {
    buffer += chunk.toString()
    let newline: number
    while ((newline = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, newline)
      buffer = buffer.slice(newline + 1)
      let msg: Record<string, any>
      try { msg = JSON.parse(line) } catch { continue }
      handle(msg).then(
        () => socket.write(JSON.stringify({ id: msg.id, ok: true }) + '\n'),
        (err: Error) => socket.write(JSON.stringify({ id: msg.id, ok: false, error: err.message }) + '\n'),
      )
    }
  })
  socket.on('error', () => {})
}

let server: Server | null = null

/** Start listening for the settings app. onAuthChangedCb runs after any sign-in change. */
export function startSetupServer(onAuthChangedCb: () => void): Promise<void> {
  onAuthChanged = onAuthChangedCb
  try { if (existsSync(SOCKET_PATH)) rmSync(SOCKET_PATH) } catch {}
  server = createServer(serve)
  server.on('error', (err) => log(`Control socket error: ${err.message}`))
  server.listen(SOCKET_PATH, () => {
    try { chmodSync(SOCKET_PATH, 0o600) } catch {}
    log(`Listening on ${SOCKET_PATH}`)
  })
  return refreshSetupState().catch(() => {})
}

export function stopSetupServer(): void {
  loginProcess?.kill('SIGTERM')
  server?.close()
  try { rmSync(SOCKET_PATH, { force: true }) } catch {}
}
