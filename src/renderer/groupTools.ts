/**
 * Tab groups as shared context: the note every chat in a group sees, the
 * folders they share, and the answers to Claude's group tools
 * (list_group_chats, read_group_chat, update_group_note). Pure functions,
 * so they can be tested without the store.
 */
import type { TabGroup, TabState } from '../shared/types'

const MAX_NOTE = 4000
const MAX_TRANSCRIPT = 40_000

/** What Claude is told about the group a chat is in (added to its instructions). */
export function groupContext(group: TabGroup | undefined): string | undefined {
  if (!group) return undefined
  const name = group.name ? `"${group.name}"` : 'an unnamed group'
  return [
    `This chat is in a Clod tab group, ${name}, alongside other chats the user is working on.`,
    group.note?.trim()
      ? `The group note, shared by every chat in the group (follow it):\n<group_note>\n${group.note.trim()}\n</group_note>`
      : 'The group has no note yet.',
    'When the user refers to another chat or tab in the group, use list_group_chats and read_group_chat to look at it.',
    'When the user asks you to remember, note or change something for the whole group, use update_group_note.',
  ].join('\n')
}

/** Every folder the group's chats can reach (their main folders and added ones). */
export function groupFolders(members: TabState[]): string[] {
  const all = members.flatMap((t) => [...(t.hasChosenDirectory && t.workingDirectory !== '~' ? [t.workingDirectory] : []), ...t.additionalDirs])
  return [...new Set(all)]
}

/** A chat as plain text, most recent part kept if it's long. */
export function transcript(tab: TabState, max = MAX_TRANSCRIPT): string {
  const text = tab.messages
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim())
    .map((m) => `${m.role === 'user' ? 'User' : 'Claude'}: ${m.content.trim()}`)
    .join('\n\n')
  return text.length > max ? `[Earlier part left out]\n…${text.slice(-max)}` : text
}

export interface GroupToolResult {
  text: string
  isError?: boolean
  /** For update_group_note: the group's new note */
  note?: string
}

/** Answer one of Claude's group tools, asked from the chat `tabId`. */
export function answerGroupTool(
  tool: string, args: Record<string, unknown>, tabId: string, tabs: TabState[], groups: TabGroup[],
): GroupToolResult {
  const tab = tabs.find((t) => t.id === tabId)
  const group = tab?.groupId ? groups.find((g) => g.id === tab.groupId) : undefined
  if (!tab || !group) return { text: "This chat isn't in a tab group, so there are no other chats or group note.", isError: true }
  const others = tabs.filter((t) => t.groupId === group.id && t.id !== tabId)

  if (tool === 'list_group_chats') {
    if (others.length === 0) return { text: 'There are no other chats in this group yet.' }
    const lines = others.map((t, i) => {
      const said = t.messages.filter((m) => m.role === 'user').length
      return `${i + 1}. ${t.title}${said === 0 ? ' (empty)' : ` (${said} message${said === 1 ? '' : 's'} from the user)`}`
    })
    return { text: `Other chats in the group${group.name ? ` "${group.name}"` : ''}:\n${lines.join('\n')}` }
  }

  if (tool === 'read_group_chat') {
    const want = String(args.chat ?? '').trim()
    const n = /^\d+$/.test(want) ? Number(want) : NaN
    const found = Number.isInteger(n) ? others[n - 1] : others.find((t) => t.title.toLowerCase().includes(want.toLowerCase()))
    if (!want || !found) return { text: `No chat in the group matches "${want}". Use list_group_chats to see them.`, isError: true }
    const text = transcript(found)
    return { text: text ? `Chat "${found.title}":\n\n${text}` : `Chat "${found.title}" is empty.` }
  }

  if (tool === 'update_group_note') {
    const add = String(args.note ?? '').trim()
    if (!add) return { text: 'The note was empty, so nothing changed.', isError: true }
    const replace = args.mode === 'replace'
    const note = (replace || !group.note?.trim() ? add : `${group.note.trim()}\n${add}`).slice(0, MAX_NOTE)
    return { text: `Group note updated. It now reads:\n${note}`, note }
  }

  return { text: 'Unknown tool.', isError: true }
}

/**
 * Give every chat in each group all of the group's folders (as added
 * folders, apart from a chat's own main folder). Tabs not in a group are
 * returned as they are.
 */
export function shareGroupFolders(tabs: TabState[]): TabState[] {
  const byGroup = new Map<string, string[]>()
  for (const t of tabs) {
    if (t.groupId && !byGroup.has(t.groupId)) byGroup.set(t.groupId, groupFolders(tabs.filter((x) => x.groupId === t.groupId)))
  }
  return tabs.map((t) => {
    const folders = t.groupId ? byGroup.get(t.groupId) : undefined
    if (!folders) return t
    const own = t.hasChosenDirectory ? t.workingDirectory : null
    const dirs = folders.filter((d) => d !== own)
    const same = dirs.length === t.additionalDirs.length && dirs.every((d, i) => d === t.additionalDirs[i])
    return same ? t : { ...t, additionalDirs: dirs }
  })
}
