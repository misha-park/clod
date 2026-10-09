import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { MagnifyingGlass, PushPin } from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { useColors } from '../theme'
import { GROUP_HEX } from './TabStrip'
import type { TabState } from '../../shared/types'

/** A line of the conversation that contains the search, for showing why a tab matched. */
function matchingLine(tab: TabState, q: string): string | null {
  for (const m of tab.messages) {
    if (m.role !== 'user' && m.role !== 'assistant') continue
    const i = m.content.toLowerCase().indexOf(q)
    if (i < 0) continue
    const start = Math.max(0, i - 30)
    return (start > 0 ? '…' : '') + m.content.slice(start, i + q.length + 50).replace(/\s+/g, ' ').trim()
  }
  return null
}

/** Find a tab by its title, its group's name or what was said in it (⌘K). */
export function TabSearch() {
  const tabs = useSessionStore((s) => s.tabs)
  const groups = useSessionStore((s) => s.groups)
  const setOpen = useSessionStore((s) => s.setTabSearchOpen)
  const selectTab = useSessionStore((s) => s.selectTab)
  const colors = useColors()
  const [query, setQuery] = useState('')
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    return tabs
      .map((tab) => {
        const group = groups.find((g) => g.id === tab.groupId)
        if (!q) return { tab, group, line: null as string | null, score: 0 }
        if (tab.title.toLowerCase().includes(q)) return { tab, group, line: null, score: 0 }
        if (group?.name.toLowerCase().includes(q)) return { tab, group, line: null, score: 1 }
        const line = matchingLine(tab, q)
        return line ? { tab, group, line, score: 2 } : null
      })
      .filter((r): r is NonNullable<typeof r> => !!r)
      .sort((a, b) => a.score - b.score)
  }, [query, tabs, groups])

  useEffect(() => { setIndex(0) }, [query])

  const choose = (tabId: string) => {
    selectTab(tabId)
    // Opening a tab in a hidden group shows the group.
    const s = useSessionStore.getState()
    const gid = s.tabs.find((t) => t.id === tabId)?.groupId
    if (gid && s.groups.find((g) => g.id === gid)?.collapsed) s.toggleGroupCollapsed(gid)
    setOpen(false)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.12 }}
      className="absolute left-3 right-3 z-40 overflow-hidden"
      style={{ top: 44, background: colors.containerBg, border: `1px solid ${colors.containerBorder}`, borderRadius: 16, boxShadow: colors.cardShadow }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false) }
        if (e.key === 'ArrowDown') { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)) }
        if (e.key === 'ArrowUp') { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)) }
        if (e.key === 'Enter' && results[index]) { e.preventDefault(); choose(results[index].tab.id) }
      }}
    >
      <div className="flex items-center gap-2 px-3.5 py-2.5" style={{ borderBottom: `1px solid ${colors.containerBorder}` }}>
        <MagnifyingGlass size={13} style={{ color: colors.textTertiary }} />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onBlur={(e) => { if (!e.currentTarget.parentElement?.parentElement?.contains(e.relatedTarget as Node | null)) setOpen(false) }}
          placeholder="Search tabs"
          className="flex-1 bg-transparent outline-none text-[13px]"
          style={{ color: colors.textPrimary }}
        />
      </div>
      <div className="max-h-[260px] overflow-y-auto py-1">
        {results.length === 0 && (
          <div className="px-3.5 py-2 text-[12px]" style={{ color: colors.textTertiary }}>No tabs match</div>
        )}
        {results.map(({ tab, group, line }, i) => (
          <button
            key={tab.id}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => choose(tab.id)}
            onMouseEnter={() => setIndex(i)}
            className="w-full text-left px-3.5 py-1.5 flex flex-col"
            style={{ background: i === index ? colors.surfaceHover : 'transparent' }}
          >
            <span className="flex items-center gap-2 text-[12.5px] min-w-0" style={{ color: colors.textPrimary }}>
              {group && <span className="w-[7px] h-[7px] rounded-full flex-shrink-0" style={{ background: GROUP_HEX[group.color] }} />}
              <span className="truncate">{tab.title}</span>
              {group?.name && <span className="text-[11px] flex-shrink-0" style={{ color: colors.textTertiary }}>{group.name}</span>}
              {tab.pinned && <PushPin size={10} weight="fill" style={{ color: colors.textTertiary }} />}
            </span>
            {line && <span className="text-[11px] truncate" style={{ color: colors.textTertiary }}>{line}</span>}
          </button>
        ))}
      </div>
    </motion.div>
  )
}
