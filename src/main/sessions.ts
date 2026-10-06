/**
 * Session search, naming, pinning and export for the Recent Sessions popover.
 *
 * Transcripts are the claude CLI's own files (~/.claude/projects/<encoded
 * cwd>/<sessionId>.jsonl) and are never modified here. Clod's additions —
 * custom names and pins — live in ~/Library/Application Support/Clod/sessions.json.
 */
import { app } from 'electron'
import { join, basename } from 'path'
import { homedir } from 'os'
import { createReadStream, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'fs'
import { createInterface } from 'readline'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROJECTS_DIR = join(homedir(), '.claude', 'projects')
const META_DIR = join(app.getPath('appData'), 'Clod')
const META_PATH = join(META_DIR, 'sessions.json')

// ─── Names and pins ───

export interface SessionUserMeta { title?: string; pinned?: boolean }

export function readSessionMeta(): Record<string, SessionUserMeta> {
  try {
    const parsed = JSON.parse(readFileSync(META_PATH, 'utf-8'))
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function updateSessionMeta(sessionId: string, patch: SessionUserMeta): boolean {
  if (!UUID_RE.test(sessionId)) return false
  const all = readSessionMeta()
  const next: SessionUserMeta = { ...all[sessionId], ...patch }
  if (!next.title) delete next.title
  if (!next.pinned) delete next.pinned
  if (Object.keys(next).length) all[sessionId] = next
  else delete all[sessionId]
  if (!existsSync(META_DIR)) mkdirSync(META_DIR, { recursive: true })
  const tmp = `${META_PATH}.${process.pid}.tmp`
  writeFileSync(tmp, JSON.stringify(all, null, 2) + '\n')
  renameSync(tmp, META_PATH)
  return true
}

// ─── Transcript access ───

/** Path of a transcript, or null if the arguments are invalid. */
export function transcriptPath(sessionId: string, projectPath: string): string | null {
  if (!UUID_RE.test(sessionId)) return null
  if (/[\0\r\n]/.test(projectPath) || !projectPath.startsWith('/')) return null
  return join(PROJECTS_DIR, projectPath.replace(/\//g, '-'), `${sessionId}.jsonl`)
}

/** User/assistant text of one transcript line, or null. */
function lineText(obj: any): { role: 'user' | 'assistant'; text: string } | null {
  if (obj.type !== 'user' && obj.type !== 'assistant') return null
  const content = obj.message?.content
  let text = ''
  if (typeof content === 'string') text = content
  else if (Array.isArray(content)) {
    text = content.filter((b: any) => b?.type === 'text' && b.text).map((b: any) => b.text).join('\n')
  }
  return text ? { role: obj.type, text } : null
}

export interface SessionSearchResult {
  sessionId: string
  projectPath: string
  firstMessage: string | null
  slug: string | null
  lastTimestamp: string
  size: number
  snippet: string | null
}

function snippetAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 40)
  const end = Math.min(text.length, index + length + 60)
  return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '')
}

/**
 * Scan one transcript for metadata and (optionally) a query match. Lines are
 * only JSON-parsed when they could matter, so large transcripts stay fast.
 */
async function scanTranscript(filePath: string, query: string): Promise<SessionSearchResult | null> {
  const stat = statSync(filePath)
  if (stat.size < 100) return null
  const q = query.toLowerCase()
  let firstMessage: string | null = null
  let slug: string | null = null
  let cwd: string | null = null
  let lastTimestamp: string | null = null
  let snippet: string | null = null
  let valid = false

  await new Promise<void>((resolve) => {
    const rl = createInterface({ input: createReadStream(filePath) })
    rl.on('line', (line: string) => {
      const needsParse = !valid || !cwd || !firstMessage || (q && !snippet && line.toLowerCase().includes(q))
      const tsMatch = /"timestamp":"([^"]+)"/.exec(line)
      if (tsMatch) lastTimestamp = tsMatch[1]
      if (!needsParse) return
      try {
        const obj = JSON.parse(line)
        if (obj.type && obj.uuid && obj.timestamp) valid = true
        if (obj.slug && !slug) slug = obj.slug
        if (obj.cwd && !cwd) cwd = obj.cwd
        const t = lineText(obj)
        if (t?.role === 'user' && !firstMessage) firstMessage = t.text.substring(0, 100)
        if (q && t && !snippet) {
          const i = t.text.toLowerCase().indexOf(q)
          if (i !== -1) snippet = snippetAround(t.text, i, q.length)
        }
      } catch {}
    })
    rl.on('close', () => resolve())
  })

  if (!valid || !cwd) return null
  return {
    sessionId: basename(filePath, '.jsonl'),
    projectPath: cwd,
    firstMessage,
    slug,
    lastTimestamp: lastTimestamp || stat.mtime.toISOString(),
    size: stat.size,
    snippet,
  }
}

/**
 * Search transcripts in one folder or all folders. An empty query lists the
 * most recent sessions. Matches custom names, and user/assistant text.
 */
export async function searchSessions(query: string, projectPath: string | null): Promise<SessionSearchResult[]> {
  const q = query.trim()
  const dirs = projectPath
    ? [join(PROJECTS_DIR, projectPath.replace(/\//g, '-'))]
    : (existsSync(PROJECTS_DIR) ? readdirSync(PROJECTS_DIR).map((d) => join(PROJECTS_DIR, d)) : [])
  const meta = readSessionMeta()
  const results: SessionSearchResult[] = []

  for (const dir of dirs) {
    if (!existsSync(dir)) continue
    let files: string[]
    try { files = readdirSync(dir).filter((f) => f.endsWith('.jsonl') && UUID_RE.test(f.slice(0, -6))) } catch { continue }
    for (const file of files) {
      const id = file.slice(0, -6)
      const titleHit = !!q && !!meta[id]?.title?.toLowerCase().includes(q.toLowerCase())
      const r = await scanTranscript(join(dir, file), titleHit ? '' : q)
      if (!r) continue
      if (q && !titleHit && !r.snippet) continue
      results.push(r)
    }
  }
  results.sort((a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime())
  return results.slice(0, 40)
}

// ─── Export ───

/** Render a transcript as Markdown. */
export async function transcriptToMarkdown(filePath: string, title: string, projectPath: string): Promise<string> {
  const parts: string[] = [`# ${title}`, '', `_Exported from Clod · ${new Date().toLocaleString()} · ${projectPath}_`, '']
  let lastRole: string | null = null
  await new Promise<void>((resolve) => {
    const rl = createInterface({ input: createReadStream(filePath) })
    rl.on('line', (line: string) => {
      try {
        const obj = JSON.parse(line)
        if (obj.type !== 'user' && obj.type !== 'assistant') return
        const content = obj.message?.content
        // Keep text and tool use in their original order within a message.
        const blocks: Array<{ text?: string; tool?: string }> = typeof content === 'string'
          ? [{ text: content }]
          : Array.isArray(content)
            ? content.map((b: any) => b?.type === 'text' ? { text: b.text } : b?.type === 'tool_use' ? { tool: b.name } : {})
            : []
        for (const b of blocks) {
          if (!b.text && !b.tool) continue
          if (obj.type !== lastRole) {
            parts.push(obj.type === 'user' ? '## You' : '## Claude', '')
            lastRole = obj.type
          }
          parts.push(b.text ? b.text : `> _Used ${b.tool}_`, '')
        }
      } catch {}
    })
    rl.on('close', () => resolve())
  })
  return parts.join('\n')
}
