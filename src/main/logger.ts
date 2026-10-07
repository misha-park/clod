import { appendFile, appendFileSync, closeSync, openSync, readSync, statSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const LOG_FILE = join(homedir(), '.clod-debug.log')
const FLUSH_INTERVAL_MS = 500
const MAX_BUFFER_SIZE = 64
/** The log is trimmed to its last KEEP_BYTES once it grows past MAX_LOG_BYTES. */
const MAX_LOG_BYTES = 2 * 1024 * 1024
const KEEP_BYTES = 512 * 1024
const TRIM_CHECK_MS = 60 * 60 * 1000

let buffer: string[] = []
let timer: ReturnType<typeof setInterval> | null = null
/** All chunks handed to async appendFile not yet confirmed written */
const inFlight = new Map<number, string>()
let nextChunkId = 1

function flush(): void {
  if (buffer.length === 0) return
  const chunk = buffer.join('')
  buffer = []
  const chunkId = nextChunkId++
  inFlight.set(chunkId, chunk)
  appendFile(LOG_FILE, chunk, () => { inFlight.delete(chunkId) })
}

function ensureTimer(): void {
  if (timer) return
  timer = setInterval(flush, FLUSH_INTERVAL_MS)
  if (timer && typeof timer === 'object' && 'unref' in timer) {
    timer.unref()
  }
}

/** The last `bytes` of the log, starting at a line boundary. */
export function readLogTail(bytes: number): string {
  try {
    const size = statSync(LOG_FILE).size
    const start = Math.max(0, size - bytes)
    const fd = openSync(LOG_FILE, 'r')
    try {
      const buf = Buffer.alloc(size - start)
      readSync(fd, buf, 0, buf.length, start)
      const text = buf.toString('utf-8')
      return start > 0 ? text.slice(text.indexOf('\n') + 1) : text
    } finally {
      closeSync(fd)
    }
  } catch {
    return ''
  }
}

/** Keep the log from growing without limit: drop all but its most recent part. */
function trimLog(): void {
  try {
    if (statSync(LOG_FILE).size <= MAX_LOG_BYTES) return
    flushLogs()
    writeFileSync(LOG_FILE, readLogTail(KEEP_BYTES))
  } catch {}
}

trimLog()
const trimTimer = setInterval(trimLog, TRIM_CHECK_MS)
if (typeof trimTimer === 'object' && 'unref' in trimTimer) trimTimer.unref()

export function log(tag: string, msg: string): void {
  buffer.push(`[${new Date().toISOString()}] [${tag}] ${msg}\n`)
  if (buffer.length >= MAX_BUFFER_SIZE) flush()
  ensureTimer()
}

/**
 * Synchronously drain all pending logs. Call on shutdown to guarantee
 * every buffered or in-flight line is persisted before the process exits.
 */
export function flushLogs(): void {
  if (timer) { clearInterval(timer); timer = null }
  // Re-write all in-flight chunks synchronously (async writes may not have landed)
  const pendingInflight = Array.from(inFlight.values()).join('')
  const pending = pendingInflight + buffer.join('')
  inFlight.clear()
  buffer = []
  if (pending) {
    try { appendFileSync(LOG_FILE, pending) } catch {}
  }
}

export { LOG_FILE }
