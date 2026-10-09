/**
 * Removing one exchange (a prompt and Claude's answer) from the middle of a
 * conversation, so Claude forgets it too.
 *
 * Claude Code keeps each conversation as a JSONL transcript whose messages are
 * chained by parentUuid. We write a copy under a new session id with the
 * exchange cut out of the chain (the next prompt is re-linked to what came
 * before it); the original transcript is left untouched, like a fork.
 */
import { randomUUID } from 'crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Find a session's transcript in any project folder. */
export function findTranscript(sessionId: string, root = join(homedir(), '.claude', 'projects')): string | null {
  if (!UUID_RE.test(sessionId) || !existsSync(root)) return null
  for (const dir of readdirSync(root)) {
    const file = join(root, dir, `${sessionId}.jsonl`)
    if (existsSync(file)) return file
  }
  return null
}

/** A prompt the user typed (not a tool result or an injected note). */
function isPrompt(e: any): boolean {
  if (e.type !== 'user' || e.isMeta || e.isSidechain) return false
  const c = e.message?.content
  if (typeof c === 'string') return true
  return Array.isArray(c) && c.some((b: any) => b.type === 'text') && !c.some((b: any) => b.type === 'tool_result')
}

/**
 * The transcript lines without the exchange that follows `after` (the last
 * assistant message before the prompt, or null for the first prompt).
 * Throws if the transcript doesn't look as expected.
 */
export function removeExchange(lines: string[], after: string | null, newSessionId: string): string[] {
  const entries = lines.map((l) => { try { return JSON.parse(l) } catch { return null } })
  const byId = new Map<string, any>()
  for (const e of entries) if (e?.uuid) byId.set(e.uuid, e)

  // The main thread, oldest first: walk back from the last message.
  const leaf = [...entries].reverse().find((e) => e?.uuid && !e.isSidechain)
  if (!leaf) throw new Error('empty transcript')
  const chain: any[] = []
  const seen = new Set<string>()
  for (let e = leaf; e && !seen.has(e.uuid); e = e.parentUuid ? byId.get(e.parentUuid) : null) {
    seen.add(e.uuid)
    chain.unshift(e)
  }

  const start = after === null ? 0 : chain.findIndex((e) => e.uuid === after) + 1
  if (after !== null && start === 0) throw new Error('message not found')
  const from = chain.findIndex((e, i) => i >= start && isPrompt(e))
  if (from < 0) throw new Error('prompt not found')
  const to = chain.findIndex((e, i) => i > from && isPrompt(e))
  if (to < 0) throw new Error('nothing after this exchange')

  const removed = new Set(chain.slice(from, to).map((e) => e.uuid))
  const relink = { id: chain[to].uuid, parent: chain[from].parentUuid ?? null }
  const out: string[] = []
  entries.forEach((e, i) => {
    if (!e) { if (lines[i].trim()) out.push(lines[i]); return }
    if (e.uuid && removed.has(e.uuid)) return
    const copy = { ...e }
    if ('sessionId' in copy) copy.sessionId = newSessionId
    if (copy.uuid === relink.id) copy.parentUuid = relink.parent
    out.push(JSON.stringify(copy))
  })
  return out
}

/** Write a copy of the conversation without one exchange; returns the copy's session id. */
export function forkWithoutExchange(sessionId: string, after: string | null): string {
  const file = findTranscript(sessionId)
  if (!file) throw new Error('conversation not found')
  const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.trim())
  const newId = randomUUID()
  const out = removeExchange(lines, after, newId)
  writeFileSync(join(file, '..', `${newId}.jsonl`), out.join('\n') + '\n')
  return newId
}
