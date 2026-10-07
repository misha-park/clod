import { spawn, execSync, ChildProcess } from 'child_process'
import { EventEmitter } from 'events'
import { homedir } from 'os'
import { join } from 'path'
import { StreamParser } from '../stream-parser'
import { normalize } from './event-normalizer'
import { buildUserContent } from './message-content'
import { log as _log } from '../logger'
import { getCliEnv, getClaudeEnv } from '../cli-env'
import type { ClaudeEvent, RunOptions, EnrichedError } from '../../shared/types'

const MAX_RING_LINES = 100

/** Idle tab processes are shut down after this long, to free their memory. */
export const IDLE_PROCESS_TIMEOUT_MS = Number(process.env.CLOD_IDLE_PROCESS_TIMEOUT_MS) || 10 * 60 * 1000
const DEBUG = process.env.CLOD_DEBUG === '1'

// Appended to Claude's default system prompt so it knows it's running inside CLOD.
// Uses --append-system-prompt (additive) not --system-prompt (replacement).
const CLOD_SYSTEM_HINT = [
  'IMPORTANT: You are NOT running in a terminal. You are running inside CLOD,',
  'a desktop chat application with a rich UI that renders full markdown.',
  'CLOD is a GUI wrapper around Claude Code — the user sees your output in a',
  'styled conversation view, not a raw terminal.',
  '',
  'Because CLOD renders markdown natively, you MUST use rich formatting when it helps:',
  '- Always use clickable markdown links: [label](https://url) — they render as real buttons.',
  '- When the user asks for images, and public web images are appropriate, proactively find and render them in CLOD.',
  '- Workflow: WebSearch for relevant public pages -> WebFetch those pages -> extract real image URLs -> render with markdown ![alt](url).',
  '- Do not guess, fabricate, or construct image URLs from memory.',
  '- Only embed images when the URL is a real publicly accessible image URL found through tools or explicitly provided by the user.',
  '- If real image URLs cannot be obtained confidently, fall back to clickable links and briefly say so.',
  '- Do not ask whether CLOD can render images; assume it can.',
  '- Use tables, bold, headers, and bullet lists freely — they all render beautifully.',
  '- Use code blocks with language tags for syntax highlighting.',
  '',
  'You are still a software engineering assistant. Keep using your tools (Read, Edit, Bash, etc.)',
  'normally. But when presenting information, links, resources, or explanations to the user,',
  'take full advantage of the rich UI. The user expects a polished chat experience, not raw terminal text.',
].join('\n')

// Tools auto-approved via --allowedTools (never trigger the permission card).
// Includes routine internal agent mechanics (Agent, Task, TaskOutput, TodoWrite,
// Notebook) — prompting for these would make UX terrible without adding meaningful
// safety. This is a deliberate CLOD policy choice, not native Claude parity.
// If runtime evidence shows any of these create real user-facing approval moments,
// they should be moved to the hook matcher in permission-server.ts instead.
const SAFE_TOOLS = [
  'Read', 'Glob', 'Grep', 'LS',
  'TodoRead', 'TodoWrite',
  'Agent', 'Task', 'TaskOutput',
  'Notebook',
  'WebSearch', 'WebFetch',
]

// All tools to pre-approve when NO hook server is available (fallback path).
// Includes safe + dangerous tools so nothing is silently denied.
const DEFAULT_ALLOWED_TOOLS = [
  'Bash', 'Edit', 'Write', 'MultiEdit',
  ...SAFE_TOOLS,
]

function log(msg: string): void {
  _log('RunManager', msg)
}

export interface RunHandle {
  runId: string
  sessionId: string | null
  process: ChildProcess
  pid: number | null
  startedAt: number
  /** Ring buffer of last N stderr lines */
  stderrTail: string[]
  /** Ring buffer of last N stdout lines */
  stdoutTail: string[]
  /** Count of tool calls seen during this run */
  toolCallCount: number
  /** Whether any permission_request event was seen during this run */
  sawPermissionRequest: boolean
  /** Permission denials from result event */
  permissionDenials: Array<{ tool_name: string; tool_use_id: string }>
}

/**
 * A tab's long-lived `claude` process. Between messages it waits on stdin, so
 * the next message skips process startup. `handle.runId` is the request it is
 * currently serving (null while idle).
 */
interface TabProcess {
  procId: string
  tabId: string
  /** Options that must match for the process to be reused */
  configKey: string
  handle: RunHandle
  currentRequestId: string | null
  idleTimer: ReturnType<typeof setTimeout> | null
}

/**
 * RunManager: runs `claude -p` with stream-json I/O, parses NDJSON, emits
 * normalized events, handles cancel, and keeps diagnostic ring buffers.
 *
 * Each tab keeps one process alive between messages (stdin stays open) and
 * reuses it while its configuration matches; idle processes exit after
 * IDLE_PROCESS_TIMEOUT_MS. A fresh process resumes the session with --resume.
 *
 * Events emitted:
 *  - 'normalized' (runId, NormalizedEvent)
 *  - 'raw' (runId, ClaudeEvent)  — for logging/debugging
 *  - 'complete' (runId, sessionId) — run finished successfully; process stays alive
 *  - 'exit' (runId, code, signal, sessionId) — process ended during a run
 *  - 'error' (runId, Error)
 *  - 'process-ended' (procId) — a tab process has gone (any reason)
 */
export class RunManager extends EventEmitter {
  /** requestId → handle of the process currently serving it */
  private activeRuns = new Map<string, RunHandle>()
  /** tabId → its live process */
  private tabProcs = new Map<string, TabProcess>()
  /** Holds recently-finished runs so diagnostics survive past process exit */
  private _finishedRuns = new Map<string, RunHandle>()
  private claudeBinary: string

  constructor() {
    super()
    this.claudeBinary = this._findClaudeBinary()
    log(`Claude binary: ${this.claudeBinary}`)
  }

  private _findClaudeBinary(): string {
    const candidates = [
      join(homedir(), '.local/bin/claude'), // Claude Code's own installer
      '/usr/local/bin/claude',
      '/opt/homebrew/bin/claude',
      join(homedir(), '.npm-global/bin/claude'),
    ]

    for (const c of candidates) {
      try {
        execSync(`test -x "${c}"`, { stdio: 'ignore' })
        return c
      } catch {}
    }

    try {
      return execSync('/bin/zsh -ilc "whence -p claude"', { encoding: 'utf-8', env: getCliEnv() }).trim()
    } catch {}

    try {
      return execSync('/bin/bash -lc "which claude"', { encoding: 'utf-8', env: getCliEnv() }).trim()
    } catch {}

    return 'claude'
  }

  private _getEnv(): NodeJS.ProcessEnv {
    const env = getClaudeEnv()
    const binDir = this.claudeBinary.substring(0, this.claudeBinary.lastIndexOf('/'))
    if (env.PATH && !env.PATH.includes(binDir)) {
      env.PATH = `${binDir}:${env.PATH}`
    }

    return env
  }

  /** Settings that must be identical for a process to serve another message. */
  private _configKey(options: RunOptions): string {
    return JSON.stringify({
      cwd: options.projectPath,
      model: options.model || null,
      permissionMode: options.permissionMode || null,
      addDirs: options.addDirs || [],
      allowedTools: options.allowedTools || [],
      maxTurns: options.maxTurns || null,
      maxBudgetUsd: options.maxBudgetUsd || null,
      systemPrompt: options.systemPrompt || null,
    })
  }

  /** Whether the tab's live process can take this message (same config, same session, idle). */
  canReuse(tabId: string, options: RunOptions): boolean {
    const proc = this.tabProcs.get(tabId)
    return !!proc
      && proc.currentRequestId === null
      && proc.handle.process.exitCode === null
      && !!proc.handle.process.stdin && !proc.handle.process.stdin.destroyed
      && proc.configKey === this._configKey(options)
      && !!options.sessionId && proc.handle.sessionId === options.sessionId
  }

  /**
   * Start a run for a tab: reuse its idle process when possible, otherwise
   * replace it with a new one. Returns the handle and the serving process id.
   */
  startRun(requestId: string, options: RunOptions, tabId: string): { handle: RunHandle; procId: string; reused: boolean } {
    if (this.canReuse(tabId, options)) {
      const proc = this.tabProcs.get(tabId)!
      if (proc.idleTimer) { clearTimeout(proc.idleTimer); proc.idleTimer = null }
      this._beginRequest(proc, requestId)
      log(`Reusing PID ${proc.handle.pid} for run ${requestId}`)
      this._writePrompt(proc.handle, options)
      return { handle: proc.handle, procId: proc.procId, reused: true }
    }
    // Config or session changed (or no live process): replace it.
    this.endTab(tabId)
    const proc = this._spawn(requestId, options, tabId)
    return { handle: proc.handle, procId: proc.procId, reused: false }
  }

  private _beginRequest(proc: TabProcess, requestId: string): void {
    const h = proc.handle
    proc.currentRequestId = requestId
    h.runId = requestId
    h.startedAt = Date.now()
    h.toolCallCount = 0
    h.sawPermissionRequest = false
    h.permissionDenials = []
    this.activeRuns.set(requestId, h)
  }

  private _writePrompt(handle: RunHandle, options: RunOptions): void {
    const userMessage = JSON.stringify({
      type: 'user',
      message: { role: 'user', content: buildUserContent(options.prompt, options.images) },
    })
    handle.process.stdin!.write(userMessage + '\n')
  }

  /** Shut down a tab's process (tab closed, folder or session changed). */
  endTab(tabId: string): void {
    const proc = this.tabProcs.get(tabId)
    if (!proc) return
    if (proc.idleTimer) { clearTimeout(proc.idleTimer); proc.idleTimer = null }
    this.tabProcs.delete(tabId)
    log(`Ending process for tab ${tabId.substring(0, 8)}… (PID ${proc.handle.pid})`)
    if (proc.currentRequestId) {
      this.cancel(proc.currentRequestId)
    } else {
      try { proc.handle.process.stdin?.end() } catch {}
      // Fallback if it doesn't exit on EOF.
      setTimeout(() => {
        if (proc.handle.process.exitCode === null) proc.handle.process.kill('SIGTERM')
      }, 5000)
    }
  }

  /** Shut down tab processes that are not running a request, so the next message starts a fresh one. */
  endIdle(): void {
    for (const [tabId, proc] of Array.from(this.tabProcs.entries())) {
      if (!proc.currentRequestId) this.endTab(tabId)
    }
  }

  /** Shut down every tab process (app quit). */
  endAll(): void {
    for (const tabId of Array.from(this.tabProcs.keys())) this.endTab(tabId)
  }

  private _spawn(requestId: string, options: RunOptions, tabId: string): TabProcess {
    const cwd = options.projectPath === '~' ? homedir() : options.projectPath

    const args: string[] = [
      '-p',
      '--input-format', 'stream-json',
      '--output-format', 'stream-json',
      '--verbose',
      '--include-partial-messages',
    ]

    // Auto mode: bypass all approvals at the CLI level — this non-interactive
    // transport can't show a prompt, so 'default' would deny tools like Write.
    // Ask mode: 'default' + the PreToolUse hook handles per-tool approvals.
    args.push('--permission-mode', options.permissionMode === 'auto' ? 'bypassPermissions' : 'default')

    if (options.sessionId) {
      args.push('--resume', options.sessionId)
    }
    if (options.model) {
      args.push('--model', options.model)
    }
    if (options.addDirs && options.addDirs.length > 0) {
      for (const dir of options.addDirs) {
        args.push('--add-dir', dir)
      }
    }

    if (options.hookSettingsPath) {
      // CLOD-scoped hook settings: the PreToolUse HTTP hook handles permissions
      // for dangerous tools (Bash, Edit, Write, MultiEdit).
      // Auto-approve safe tools so they don't trigger the permission card.
      args.push('--settings', options.hookSettingsPath)
      const safeAllowed = [
        ...SAFE_TOOLS,
        ...(options.allowedTools || []),
      ]
      args.push('--allowedTools', safeAllowed.join(','))
    } else {
      // Fallback: no hook server available.
      // Pre-approve common tools so they run without being silently denied.
      const allAllowed = [
        ...DEFAULT_ALLOWED_TOOLS,
        ...(options.allowedTools || []),
      ]
      args.push('--allowedTools', allAllowed.join(','))
    }
    if (options.maxTurns) {
      args.push('--max-turns', String(options.maxTurns))
    }
    if (options.maxBudgetUsd) {
      args.push('--max-budget-usd', String(options.maxBudgetUsd))
    }
    if (options.systemPrompt) {
      args.push('--system-prompt', options.systemPrompt)
    }
    // Always tell Claude it's inside CLOD (additive, doesn't replace base prompt)
    args.push('--append-system-prompt', CLOD_SYSTEM_HINT)

    // Claude Code may have been installed (by Clod's setup) since launch.
    if (!this.claudeBinary.includes('/')) this.claudeBinary = this._findClaudeBinary()

    if (DEBUG) {
      log(`Starting run ${requestId}: ${this.claudeBinary} ${args.join(' ')}`)
      log(`Prompt: ${options.prompt.substring(0, 200)}`)
    } else {
      log(`Starting run ${requestId}`)
    }

    const child = spawn(this.claudeBinary, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd,
      env: this._getEnv(),
    })

    log(`Spawned PID: ${child.pid}`)

    const handle: RunHandle = {
      runId: requestId,
      sessionId: options.sessionId || null,
      process: child,
      pid: child.pid || null,
      startedAt: Date.now(),
      stderrTail: [],
      stdoutTail: [],
      toolCallCount: 0,
      sawPermissionRequest: false,
      permissionDenials: [],
    }
    const proc: TabProcess = {
      procId: crypto.randomUUID(),
      tabId,
      configKey: this._configKey(options),
      handle,
      currentRequestId: null,
      idleTimer: null,
    }
    this.tabProcs.set(tabId, proc)
    this._beginRequest(proc, requestId)
    // The request currently being served — events are attributed to it.
    const current = () => proc.currentRequestId

    // ─── stdout → NDJSON parser → normalizer → events ───
    const parser = StreamParser.fromStream(child.stdout!)

    parser.on('event', (raw: ClaudeEvent) => {
      // Track session ID
      if (raw.type === 'system' && 'subtype' in raw && raw.subtype === 'init') {
        handle.sessionId = (raw as any).session_id
      }

      const requestId = current()
      if (!requestId) return // stray output while idle

      // Track permission_request events
      if (raw.type === 'permission_request' || (raw.type === 'system' && 'subtype' in raw && (raw as any).subtype === 'permission_request')) {
        handle.sawPermissionRequest = true
        log(`Permission request seen [${requestId}]`)
      }

      // Extract permission_denials from result event
      if (raw.type === 'result') {
        const denials = (raw as any).permission_denials
        if (Array.isArray(denials) && denials.length > 0) {
          handle.permissionDenials = denials.map((d: any) => ({
            tool_name: d.tool_name || '',
            tool_use_id: d.tool_use_id || '',
          }))
          log(`Permission denials [${requestId}]: ${JSON.stringify(handle.permissionDenials)}`)
        }
      }

      // Ring buffer stdout lines (raw JSON for diagnostics)
      this._ringPush(handle.stdoutTail, JSON.stringify(raw).substring(0, 300))

      // Emit raw event for debugging
      this.emit('raw', requestId, raw)

      // Normalize and emit canonical events
      const normalized = normalize(raw)
      for (const evt of normalized) {
        if (evt.type === 'tool_call') handle.toolCallCount++
        this.emit('normalized', requestId, evt)
      }

      // After the result, keep the process for the tab's next message — unless
      // the run failed, in which case close stdin so it exits and the exit path
      // reports the error with diagnostics, as before.
      if (raw.type === 'result') {
        log(`Run complete [${requestId}]: sawPermissionRequest=${handle.sawPermissionRequest}, denials=${handle.permissionDenials.length}`)
        if ((raw as any).is_error || this.tabProcs.get(tabId) !== proc) {
          try { child.stdin?.end() } catch {}
          return
        }
        proc.currentRequestId = null
        this.activeRuns.delete(requestId)
        this._finishedRuns.set(requestId, { ...handle })
        setTimeout(() => this._finishedRuns.delete(requestId), 5000)
        proc.idleTimer = setTimeout(() => {
          log(`Tab process idle for ${IDLE_PROCESS_TIMEOUT_MS / 60000} min — shutting down (PID ${handle.pid})`)
          this.endTab(tabId)
        }, IDLE_PROCESS_TIMEOUT_MS)
        this.emit('complete', requestId, handle.sessionId)
      }
    })

    parser.on('parse-error', (line: string) => {
      log(`Parse error [${current() ?? 'idle'}]: ${line.substring(0, 200)}`)
      this._ringPush(handle.stderrTail, `[parse-error] ${line.substring(0, 200)}`)
    })

    // ─── stderr ring buffer ───
    child.stderr?.setEncoding('utf-8')
    child.stderr?.on('data', (data: string) => {
      const lines = data.split('\n').filter((l: string) => l.trim())
      for (const line of lines) {
        this._ringPush(handle.stderrTail, line)
      }
      log(`Stderr [${current() ?? 'idle'}]: ${data.trim().substring(0, 500)}`)
    })

    // ─── Process lifecycle ───
    // Snapshot diagnostics BEFORE deleting the handle so callers can still read them.
    const detach = () => {
      if (proc.idleTimer) { clearTimeout(proc.idleTimer); proc.idleTimer = null }
      if (this.tabProcs.get(tabId) === proc) this.tabProcs.delete(tabId)
      this.emit('process-ended', proc.procId)
    }

    child.on('close', (code, signal) => {
      const requestId = current()
      log(`Process closed [${requestId ?? 'idle'}]: PID ${handle.pid} code=${code} signal=${signal}`)
      detach()
      if (!requestId) return // idle shutdown — no run to report
      proc.currentRequestId = null
      // Move handle to finished map so getEnrichedError still works after exit
      this._finishedRuns.set(requestId, handle)
      this.activeRuns.delete(requestId)
      this.emit('exit', requestId, code, signal, handle.sessionId)
      // Clean up finished run after a short delay (gives callers time to read diagnostics)
      setTimeout(() => this._finishedRuns.delete(requestId), 5000)
    })

    child.on('error', (err) => {
      const requestId = current()
      log(`Process error [${requestId ?? 'idle'}]: ${err.message}`)
      detach()
      if (!requestId) return
      proc.currentRequestId = null
      this._finishedRuns.set(requestId, handle)
      this.activeRuns.delete(requestId)
      this.emit('error', requestId, err)
      setTimeout(() => this._finishedRuns.delete(requestId), 5000)
    })

    // ─── Write prompt to stdin (stream-json format, kept open for the next message) ───
    this._writePrompt(handle, options)
    return proc
  }

  /**
   * Write a message to a running process's stdin (for follow-up prompts, etc.)
   */
  writeToStdin(requestId: string, message: object): boolean {
    const handle = this.activeRuns.get(requestId)
    if (!handle) return false
    if (!handle.process.stdin || handle.process.stdin.destroyed) return false

    const json = JSON.stringify(message)
    log(`Writing to stdin [${requestId}]: ${json.substring(0, 200)}`)
    handle.process.stdin.write(json + '\n')
    return true
  }

  /**
   * Cancel a running process: SIGINT, then SIGKILL after 5s.
   */
  cancel(requestId: string): boolean {
    const handle = this.activeRuns.get(requestId)
    if (!handle) return false

    log(`Cancelling run ${requestId}`)
    handle.process.kill('SIGINT')

    // Fallback: SIGKILL if process hasn't exited after 5s.
    // Only check exitCode — process.killed is set true by the SIGINT call above,
    // so checking !killed would prevent the fallback from ever firing.
    setTimeout(() => {
      if (handle.process.exitCode === null) {
        log(`Force killing run ${requestId} (SIGINT did not terminate)`)
        handle.process.kill('SIGKILL')
      }
    }, 5000)

    return true
  }

  /**
   * Get an enriched error object for a failed run.
   */
  getEnrichedError(requestId: string, exitCode: number | null): EnrichedError {
    const handle = this.activeRuns.get(requestId) || this._finishedRuns.get(requestId)
    return {
      message: `Run failed with exit code ${exitCode}`,
      stderrTail: handle?.stderrTail.slice(-20) || [],
      stdoutTail: handle?.stdoutTail.slice(-20) || [],
      exitCode,
      elapsedMs: handle ? Date.now() - handle.startedAt : 0,
      toolCallCount: handle?.toolCallCount || 0,
      sawPermissionRequest: handle?.sawPermissionRequest || false,
      permissionDenials: handle?.permissionDenials || [],
    }
  }

  isRunning(requestId: string): boolean {
    return this.activeRuns.has(requestId)
  }

  private _ringPush(buffer: string[], line: string): void {
    buffer.push(line)
    if (buffer.length > MAX_RING_LINES) {
      buffer.shift()
    }
  }
}
