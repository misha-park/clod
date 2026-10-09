/**
 * Tab groups: the rules for where grouped and pinned tabs sit in the strip.
 * Kept free of React and the store so they can be tested on their own.
 */
import type { TabGroup, TabGroupColor, TabState } from '../shared/types'

export const GROUP_COLORS: TabGroupColor[] = ['grey', 'blue', 'green', 'yellow', 'orange', 'red', 'purple']

/** A colour the existing groups aren't using yet, if there is one. */
export function nextGroupColor(groups: TabGroup[]): TabGroupColor {
  const used = new Set(groups.map((g) => g.color))
  return GROUP_COLORS.slice(1).find((c) => !used.has(c)) ?? GROUP_COLORS[1 + (groups.length % (GROUP_COLORS.length - 1))]
}

/** Whether a tab can't be closed: it's pinned, or in a pinned group. */
export function isTabLocked(tab: TabState, groups: TabGroup[]): boolean {
  return !!tab.pinned || (!!tab.groupId && !!groups.find((g) => g.id === tab.groupId)?.pinned)
}

/**
 * Put tabs in strip order: a group's tabs together (where its first tab was),
 * and pinned tabs and pinned groups first. Groups with no tabs left are dropped,
 * and tabs pointing at a missing group leave it.
 */
export function arrangeTabs(tabs: TabState[], groups: TabGroup[]): { tabs: TabState[]; groups: TabGroup[] } {
  const known = new Map(groups.map((g) => [g.id, g]))
  const clean = tabs.map((t) => (t.groupId && !known.has(t.groupId) ? { ...t, groupId: undefined } : t))
  const units: Array<{ pinned: boolean; tabs: TabState[] }> = []
  const placed = new Set<string>()
  for (const t of clean) {
    if (!t.groupId) { units.push({ pinned: !!t.pinned, tabs: [t] }); continue }
    if (placed.has(t.groupId)) continue
    placed.add(t.groupId)
    units.push({ pinned: !!known.get(t.groupId)!.pinned, tabs: clean.filter((x) => x.groupId === t.groupId) })
  }
  const ordered = [...units.filter((u) => u.pinned), ...units.filter((u) => !u.pinned)].flatMap((u) => u.tabs)
  return { tabs: ordered, groups: groups.filter((g) => placed.has(g.id)) }
}
