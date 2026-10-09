import { describe, it, expect } from 'vitest'
import { answerGroupTool, groupContext, groupFolders, shareGroupFolders } from './groupTools'
import type { Message, TabGroup, TabState } from '../shared/types'

const msg = (role: Message['role'], content: string) => ({ id: content, role, content, timestamp: 0 }) as Message
const tab = (id: string, extra: Partial<TabState> = {}) =>
  ({ id, title: id, messages: [], workingDirectory: '~', hasChosenDirectory: false, additionalDirs: [], ...extra }) as TabState
const group: TabGroup = { id: 'g', name: 'Thesis', color: 'blue', collapsed: false, pinned: false, note: 'British English.' }
const tabs = [
  tab('Intro', { groupId: 'g', messages: [msg('user', 'draft the intro'), msg('assistant', 'Here it is')] }),
  tab('Methods', { groupId: 'g', messages: [msg('user', 'we used a t-test'), msg('assistant', 'Noted')], hasChosenDirectory: true, workingDirectory: '/data', additionalDirs: ['/refs'] }),
  tab('Elsewhere'),
]

describe('group tools', () => {
  it('lists the other chats in the group', () => {
    const r = answerGroupTool('list_group_chats', {}, 'Intro', tabs, [group])
    expect(r.text).toContain('1. Methods (1 message from the user)')
    expect(r.text).not.toContain('Elsewhere')
  })

  it('reads a chat by number or title', () => {
    expect(answerGroupTool('read_group_chat', { chat: '1' }, 'Intro', tabs, [group]).text).toContain('User: we used a t-test')
    expect(answerGroupTool('read_group_chat', { chat: 'meth' }, 'Intro', tabs, [group]).text).toContain('Claude: Noted')
    expect(answerGroupTool('read_group_chat', { chat: 'nope' }, 'Intro', tabs, [group]).isError).toBe(true)
  })

  it('appends to or replaces the note', () => {
    expect(answerGroupTool('update_group_note', { note: 'Cite with APA.' }, 'Intro', tabs, [group]).note).toBe('British English.\nCite with APA.')
    expect(answerGroupTool('update_group_note', { note: 'Only this.', mode: 'replace' }, 'Intro', tabs, [group]).note).toBe('Only this.')
  })

  it('refuses outside a group', () => {
    expect(answerGroupTool('list_group_chats', {}, 'Elsewhere', tabs, [group]).isError).toBe(true)
  })
})

describe('groupContext', () => {
  it('includes the note', () => expect(groupContext(group)).toContain('British English.'))
  it('is empty without a group', () => expect(groupContext(undefined)).toBeUndefined())
})

describe('groupFolders', () => {
  it('collects every chosen and added folder once', () => expect(groupFolders(tabs.slice(0, 2))).toEqual(['/data', '/refs']))
})

describe('shareGroupFolders', () => {
  it('gives each chat in a group the others’ folders', () => {
    const out = shareGroupFolders([
      tab('a', { groupId: 'g', hasChosenDirectory: true, workingDirectory: '/a' }),
      tab('b', { groupId: 'g', additionalDirs: ['/b'] }),
      tab('c', { additionalDirs: ['/c'] }),
    ])
    expect(out[0].additionalDirs).toEqual(['/b'])
    expect(out[1].additionalDirs).toEqual(['/a', '/b'])
    expect(out[2].additionalDirs).toEqual(['/c'])
  })
})
