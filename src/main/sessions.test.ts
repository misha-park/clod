import { describe, it, expect, vi, beforeAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

// Point the module at a throwaway home and app-data directory.
const home = mkdtempSync(join(tmpdir(), 'clod-sessions-'))
vi.mock('os', async (orig) => ({ ...(await orig<typeof import('os')>()), homedir: () => home }))
vi.mock('electron', () => ({ app: { getPath: () => join(home, 'AppSupport') } }))

const { searchSessions, updateSessionMeta, readSessionMeta, transcriptPath, transcriptToMarkdown } = await import('./sessions')

const ID_A = '11111111-1111-4111-8111-111111111111'
const ID_B = '22222222-2222-4222-8222-222222222222'
const line = (o: object) => JSON.stringify({ uuid: 'u', ...o })

function writeTranscript(cwd: string, id: string, lines: object[]): void {
  const dir = join(home, '.claude', 'projects', cwd.replace(/\//g, '-'))
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, `${id}.jsonl`), lines.map(line).join('\n') + '\n')
}

beforeAll(() => {
  writeTranscript('/work/alpha', ID_A, [
    { type: 'user', cwd: '/work/alpha', timestamp: '2026-10-01T10:00:00Z', message: { content: 'How do I parse a Korsakoff dataset?' } },
    { type: 'assistant', cwd: '/work/alpha', timestamp: '2026-10-01T10:00:05Z',
      message: { content: [{ type: 'text', text: 'Start by loading it.' }, { type: 'tool_use', name: 'Read' }, { type: 'text', text: 'Done.' }] } },
  ])
  writeTranscript('/work/beta', ID_B, [
    { type: 'user', cwd: '/work/beta', timestamp: '2026-10-02T09:00:00Z', message: { content: 'Plan a holiday in Lisbon' } },
    { type: 'assistant', cwd: '/work/beta', timestamp: '2026-10-02T09:00:04Z', message: { content: [{ type: 'text', text: 'Here is a plan.' }] } },
  ])
})

describe('searchSessions', () => {
  it('lists recent sessions across all folders, newest first, with their folder', async () => {
    const r = await searchSessions('', null)
    expect(r.map((s) => s.sessionId)).toEqual([ID_B, ID_A])
    expect(r[0].projectPath).toBe('/work/beta')
    expect(r[1].firstMessage).toBe('How do I parse a Korsakoff dataset?')
  })

  it('matches conversation text case-insensitively and returns a snippet', async () => {
    const r = await searchSessions('korsakoff', null)
    expect(r).toHaveLength(1)
    expect(r[0].sessionId).toBe(ID_A)
    expect(r[0].snippet).toContain('Korsakoff')
  })

  it('limits search to one folder when given', async () => {
    expect(await searchSessions('plan', '/work/alpha')).toHaveLength(0)
    expect(await searchSessions('plan', '/work/beta')).toHaveLength(1)
  })

  it('matches a custom name even when the text does not', async () => {
    updateSessionMeta(ID_B, { title: 'Summer trip' })
    const r = await searchSessions('summer', null)
    expect(r.map((s) => s.sessionId)).toEqual([ID_B])
  })
})

describe('session names and pins', () => {
  it('stores, merges and clears metadata', () => {
    updateSessionMeta(ID_A, { pinned: true })
    updateSessionMeta(ID_A, { title: 'Dataset' })
    expect(readSessionMeta()[ID_A]).toEqual({ pinned: true, title: 'Dataset' })
    updateSessionMeta(ID_A, { pinned: false, title: '' })
    expect(readSessionMeta()[ID_A]).toBeUndefined()
  })

  it('rejects non-UUID session ids', () => {
    expect(updateSessionMeta('../../etc/passwd', { pinned: true })).toBe(false)
  })
})

describe('transcriptPath', () => {
  it('rejects path traversal and relative folders', () => {
    expect(transcriptPath('not-a-uuid', '/work/alpha')).toBeNull()
    expect(transcriptPath(ID_A, 'relative/dir')).toBeNull()
    expect(transcriptPath(ID_A, '/work/alpha')).toContain('-work-alpha')
  })
})

describe('transcriptToMarkdown', () => {
  it('keeps text and tool use in order under speaker headings', async () => {
    const md = await transcriptToMarkdown(transcriptPath(ID_A, '/work/alpha')!, 'Dataset', '/work/alpha')
    const body = md.slice(md.indexOf('## You'))
    expect(body).toBe([
      '## You', '', 'How do I parse a Korsakoff dataset?', '',
      '## Claude', '', 'Start by loading it.', '', '> _Used Read_', '', 'Done.', '',
    ].join('\n'))
    expect(md.startsWith('# Dataset')).toBe(true)
    // The transcript itself is never modified.
    expect(readFileSync(transcriptPath(ID_A, '/work/alpha')!, 'utf-8')).toContain('Korsakoff')
  })
})
