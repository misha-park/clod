/**
 * Short tab titles: after a conversation's first answer, a small, fast model
 * (Haiku) names it in a few words, instead of the tab showing the start of the
 * first message. Runs without tools or saved history, so it's quick and cheap.
 */
import { execFile } from 'child_process'
import { getClaudeEnv } from '../cli-env'
import { cleanTitle } from '../../shared/title'

const MAX_INPUT = 1500

/** Ask Claude for a 2–5 word title for a conversation; null if that fails. */
export function suggestTitle(claudeBinary: string, prompt: string, reply: string): Promise<string | null> {
  const ask = 'Write a 2-5 word title for this conversation, like a tab name. Reply with the title only: no quotes, no full stop.\n\n'
    + `User: ${prompt.slice(0, MAX_INPUT)}\n\nAssistant: ${reply.slice(0, MAX_INPUT)}`
  const args = ['-p', '--model', 'haiku', '--no-session-persistence', '--tools', '', '--strict-mcp-config', '--setting-sources', '', ask]
  return new Promise((resolve) => {
    const child = execFile(claudeBinary, args, { env: getClaudeEnv(), timeout: 30000, maxBuffer: 64 * 1024 }, (err, stdout) => {
      resolve(err ? null : cleanTitle(String(stdout)))
    })
    child.stdin?.end()
  })
}
