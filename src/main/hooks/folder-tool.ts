/**
 * The "request_folder" tool: lets Claude ask the user for a folder they
 * mentioned (by name or path) instead of hunting through the disk.
 *
 * Claude Code runs a tiny MCP server (FOLDER_MCP_SCRIPT, started with Clod's
 * own binary in Node mode). Its one tool posts the request to Clod's local
 * permission server, which shows a card in the conversation listing matching
 * folders. The user picks one, chooses another, or says no, and the answer
 * goes back to Claude as the tool's result.
 */
import { execFile } from 'child_process'
import { existsSync, statSync } from 'fs'
import { homedir } from 'os'
import { basename, isAbsolute, join, resolve } from 'path'

export const FOLDER_TOOL_NAME = 'mcp__clod__request_folder'

/** Folders a request can offer, best match first. */
export interface FolderMatch {
  path: string
  name: string
}

const MAX_MATCHES = 6
const SKIP = /\/(Library|\.Trash|node_modules|\.git)(\/|$)|\/\.[^/]+(\/|$)|\.app(\/|$)/

/** Expand ~ and make a path absolute; null if it isn't an existing folder. */
export function existingFolder(raw: string): string | null {
  const expanded = raw.startsWith('~') ? join(homedir(), raw.slice(1)) : raw
  const full = isAbsolute(expanded) ? expanded : resolve(homedir(), expanded)
  try { return statSync(full).isDirectory() ? full : null } catch { return null }
}

/** Rank: exact name first, then names starting with the query, then shallower paths. */
export function rankFolders(paths: string[], query: string): FolderMatch[] {
  const q = query.toLowerCase()
  const score = (p: string) => {
    const name = basename(p).toLowerCase()
    const exact = name === q ? 0 : name.startsWith(q) ? 1 : 2
    return exact * 100 + p.split('/').length
  }
  return [...new Set(paths)]
    .filter((p) => !SKIP.test(p))
    .sort((a, b) => score(a) - score(b) || a.localeCompare(b))
    .slice(0, MAX_MATCHES)
    .map((p) => ({ path: p, name: basename(p) }))
}

/** Find folders under the home folder whose name contains `query`, using Spotlight. */
export function searchFolders(query: string): Promise<FolderMatch[]> {
  const q = query.replace(/["\\*]/g, '').trim()
  if (!q) return Promise.resolve([])
  const predicate = `kMDItemContentType == "public.folder" && kMDItemFSName == "*${q}*"cd`
  return new Promise((done) => {
    execFile('/usr/bin/mdfind', ['-onlyin', homedir(), predicate], { timeout: 4000, maxBuffer: 2 * 1024 * 1024 }, (_err, stdout) => {
      const paths = String(stdout || '').split('\n').map((s) => s.trim()).filter((p) => p && existsSync(p))
      done(rankFolders(paths, q))
    })
  })
}

/** The folders to offer for a request: the given path if it exists, otherwise a search by name. */
export async function foldersFor(request: { name?: string; path?: string }): Promise<FolderMatch[]> {
  if (request.path) {
    const found = existingFolder(request.path)
    if (found) return [{ path: found, name: basename(found) }]
  }
  const name = request.name || (request.path ? basename(request.path) : '')
  return name ? searchFolders(name) : []
}

/**
 * The MCP server Claude Code starts for each Clod run (stdio, JSON-RPC).
 * CLOD_FOLDER_URL is the run's private address on Clod's permission server.
 */
export const FOLDER_MCP_SCRIPT = String.raw`
const http = require('http')
const URL_ = process.env.CLOD_FOLDER_URL
const tool = {
  name: 'request_folder',
  description: 'Ask the user to let you work in a folder. Use this whenever the user mentions a folder by name ' +
    '(for example "my tax folder") or you need a folder outside your working folder. Clod finds matching folders ' +
    'and shows the user a card to pick one, so do not search the disk for folders yourself. Returns the folder\'s ' +
    'full path once the user allows it, or says that they declined.',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'The folder name, or part of it, as the user described it.' },
      path: { type: 'string', description: 'The folder path, if you know it.' },
      reason: { type: 'string', description: 'One short sentence, shown to the user, saying why you need the folder.' },
    },
    required: ['reason'],
  },
}
const send = (msg) => process.stdout.write(JSON.stringify(msg) + '\n')
function ask(args) {
  return new Promise((resolve) => {
    const body = JSON.stringify(args || {})
    const u = new URL(URL_)
    const req = http.request({ hostname: u.hostname, port: u.port, path: u.pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let data = ''
      res.on('data', (c) => { data += c })
      res.on('end', () => { try { resolve(JSON.parse(data)) } catch { resolve({ path: null, message: 'Clod did not answer.' }) } })
    })
    req.on('error', () => resolve({ path: null, message: 'Clod is not reachable.' }))
    req.end(body)
  })
}
let buffer = ''
process.stdin.on('data', async (chunk) => {
  buffer += chunk
  let i
  while ((i = buffer.indexOf('\n')) >= 0) {
    const line = buffer.slice(0, i).trim()
    buffer = buffer.slice(i + 1)
    if (!line) continue
    let msg
    try { msg = JSON.parse(line) } catch { continue }
    if (msg.id === undefined) continue // notifications need no reply
    if (msg.method === 'initialize') {
      send({ jsonrpc: '2.0', id: msg.id, result: { protocolVersion: (msg.params && msg.params.protocolVersion) || '2025-06-18',
        capabilities: { tools: {} }, serverInfo: { name: 'clod', version: '1.0.0' } } })
    } else if (msg.method === 'tools/list') {
      send({ jsonrpc: '2.0', id: msg.id, result: { tools: [tool] } })
    } else if (msg.method === 'tools/call') {
      const answer = await ask(msg.params && msg.params.arguments)
      const text = answer.path
        ? 'The user allowed this folder: ' + answer.path + (answer.message ? '\n' + answer.message : '')
        : (answer.message || 'The user declined. Ask them which folder they meant, or carry on without it.')
      send({ jsonrpc: '2.0', id: msg.id, result: { content: [{ type: 'text', text }], isError: !answer.path } })
    } else if (msg.method === 'ping') {
      send({ jsonrpc: '2.0', id: msg.id, result: {} })
    } else {
      send({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } })
    }
  }
})
`
