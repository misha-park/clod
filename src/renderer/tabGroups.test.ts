import { describe, it, expect } from 'vitest'
import { arrangeTabs, isTabLocked, nextGroupColor } from './tabGroups'
import type { TabGroup, TabState } from '../shared/types'

const tab = (id: string, extra: Partial<TabState> = {}) => ({ id, ...extra }) as TabState
const group = (id: string, extra: Partial<TabGroup> = {}): TabGroup => ({ id, name: id, color: 'blue', collapsed: false, pinned: false, ...extra })
const ids = (tabs: TabState[]) => tabs.map((t) => t.id).join(' ')

describe('arrangeTabs', () => {
  it('keeps a group together where its first tab was', () => {
    const { tabs } = arrangeTabs([tab('a', { groupId: 'g' }), tab('b'), tab('c', { groupId: 'g' })], [group('g')])
    expect(ids(tabs)).toBe('a c b')
  })

  it('puts pinned tabs and pinned groups first, in order', () => {
    const { tabs } = arrangeTabs(
      [tab('a'), tab('b', { groupId: 'g' }), tab('c', { pinned: true }), tab('d', { groupId: 'g' })],
      [group('g', { pinned: true })],
    )
    expect(ids(tabs)).toBe('b d c a')
  })

  it('drops empty groups and leaves missing ones', () => {
    const out = arrangeTabs([tab('a', { groupId: 'gone' })], [group('g')])
    expect(out.groups).toEqual([])
    expect(out.tabs[0].groupId).toBeUndefined()
  })
})

describe('isTabLocked', () => {
  it('locks pinned tabs and tabs in pinned groups', () => {
    const groups = [group('p', { pinned: true }), group('u')]
    expect(isTabLocked(tab('a', { pinned: true }), groups)).toBe(true)
    expect(isTabLocked(tab('b', { groupId: 'p' }), groups)).toBe(true)
    expect(isTabLocked(tab('c', { groupId: 'u' }), groups)).toBe(false)
  })
})

describe('nextGroupColor', () => {
  it('picks an unused colour', () => {
    expect(nextGroupColor([group('a', { color: 'blue' })])).toBe('green')
  })
})
