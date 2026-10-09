import React, { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Copy, Check, ArrowsOutLineHorizontal, Terminal, PushPin, MagnifyingGlass } from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { HistoryButton } from './history/HistoryButton'
import { SettingsButton } from './SettingsButton'
import { ButtonHint } from './ButtonHint'
import { useColors, useThemeStore } from '../theme'
import type { TabStatus, TabState, TabGroup, TabGroupColor, MenuItemSpec } from '../../shared/types'
import { GROUP_COLORS, isTabLocked } from '../tabGroups'
import { useShortcutLabel } from '../settings-sync'

/** Group colours: muted, readable on both the light and dark themes. */
export const GROUP_HEX: Record<TabGroupColor, string> = {
  grey: '#8a8780', blue: '#6b8fc7', green: '#6fa27a', yellow: '#c4a24a',
  orange: '#d0844f', red: '#c96a5e', purple: '#9a7cc4',
}
const colorName = (c: TabGroupColor) => c[0].toUpperCase() + c.slice(1)

/** Drag data types for moving tabs and groups within the strip. */
const TAB_DRAG = 'application/x-clod-tab'
const GROUP_DRAG = 'application/x-clod-group'

/** A tab's height (1px border + 4px padding + 18px line, twice over); the group label matches it. */
const TAB_HEIGHT = 28

/** The thin line between two tabs. */
function TabDivider() {
  const colors = useColors()
  return <span aria-hidden className="flex-shrink-0 self-center" style={{ width: 1, height: 12, margin: '0 -2px', background: colors.textTertiary, opacity: 0.25 }} />
}

/** The group's label: click to collapse, double-click to rename, right-click for more. */
function GroupChip({ group, onMenu, ...drag }: {
  group: TabGroup
  onMenu: () => void
  onDragStart: (e: React.DragEvent) => void
  onDragEnd: () => void
  onDragOver: (e: React.DragEvent) => void
  onDrop: (e: React.DragEvent) => void
}) {
  const editing = useSessionStore((s) => s.editingGroupId === group.id)
  const setEditingGroup = useSessionStore((s) => s.setEditingGroup)
  const renameGroup = useSessionStore((s) => s.renameGroup)
  const toggleGroupCollapsed = useSessionStore((s) => s.toggleGroupCollapsed)
  const [draft, setDraft] = useState(group.name)
  useEffect(() => { if (editing) setDraft(group.name) }, [editing]) // eslint-disable-line react-hooks/exhaustive-deps
  const hex = GROUP_HEX[group.color]
  const finish = (save: boolean) => {
    if (save) renameGroup(group.id, draft)
    setEditingGroup(null)
    // A new group: once it's named, ask what the group is for.
    const s = useSessionStore.getState()
    if (s.groupNotePromptId === group.id) s.setNoteEditor(group.id)
  }

  return (
    <div
      onClick={() => { if (!editing) toggleGroupCollapsed(group.id) }}
      onDoubleClick={(e) => { e.stopPropagation(); setEditingGroup(group.id) }}
      onContextMenu={(e) => { e.preventDefault(); onMenu() }}
      role="button"
      draggable={!editing}
      {...drag}
      // Same height as the tabs beside it (it stretches to them), so it sits
      // evenly inside the group's outline.
      className="flex items-center gap-1.5 flex-shrink-0 cursor-pointer select-none"
      style={{ background: hex, color: '#fff', borderRadius: 9999, padding: '0 10px', minHeight: TAB_HEIGHT, fontSize: 11.5, fontWeight: 600, maxWidth: 140 }}
      title={(group.collapsed ? 'Show this group' : 'Hide this group (double-click to rename)') + (group.note ? `\n\nGroup note: ${group.note}` : '')}
    >
      {group.pinned && <PushPin size={9} weight="fill" className="flex-shrink-0" />}
      {editing ? (
        <input
          autoFocus
          value={draft}
          placeholder="Name"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') finish(true)
            if (e.key === 'Escape') { e.stopPropagation(); finish(false) }
          }}
          onBlur={() => finish(true)}
          onClick={(e) => e.stopPropagation()}
          className="bg-transparent outline-none placeholder-white/60"
          style={{ color: '#fff', width: Math.max(40, draft.length * 7 + 8), fontWeight: 600 }}
        />
      ) : (
        group.name ? <span className="truncate">{group.name}</span> : (!group.pinned && <span className="w-[6px] h-[6px] rounded-full bg-white/80" />)
      )}
    </div>
  )
}

function StatusDot({ status, hasUnread, hasPermission }: { status: TabStatus; hasUnread: boolean; hasPermission: boolean }) {
  const colors = useColors()
  let bg: string = colors.statusIdle
  let pulse = false
  let glow = false

  if (status === 'dead' || status === 'failed') {
    bg = colors.statusError
  } else if (hasPermission) {
    bg = colors.statusPermission
    glow = true
  } else if (status === 'connecting' || status === 'running') {
    bg = colors.statusRunning
    pulse = true
  } else if (hasUnread) {
    bg = colors.statusComplete
  }

  return (
    <span
      className={`w-[6px] h-[6px] rounded-full flex-shrink-0 ${pulse ? 'animate-pulse-dot' : ''}`}
      style={{
        background: bg,
        ...(glow ? { boxShadow: `0 0 6px 2px ${colors.statusPermissionGlow}` } : {}),
      }}
    />
  )
}

/** Round icon button used in the tab bar's button group. */
export const GROUP_BUTTON_CLASS = 'flex-shrink-0 w-[26px] h-[26px] flex items-center justify-center rounded-full transition-colors'

/** Opens the tab search (same as ⌘K). */
function SearchTabsButton() {
  const colors = useColors()
  const open = useSessionStore((s) => s.tabSearchOpen)
  const shortcut = useShortcutLabel('searchTabs')
  return (
    <ButtonHint label={shortcut ? `Search tabs (${shortcut})` : 'Search tabs'}>
      <button
        // Keep focus off the button so the search box keeps it.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => useSessionStore.getState().setTabSearchOpen(!open)}
        className={GROUP_BUTTON_CLASS}
        style={{ color: open ? colors.accent : colors.textTertiary }}
        aria-label="Search tabs"
      >
        <MagnifyingGlass size={13} />
      </button>
    </ButtonHint>
  )
}

/** Opens the active tab's session in Terminal (`claude --resume`). */
function OpenInCliButton() {
  const colors = useColors()
  const tab = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  return (
    <ButtonHint label="Open in CLI">
      <button
        onClick={() => { if (tab) window.clod.openInTerminal(tab.claudeSessionId, tab.workingDirectory) }}
        className={GROUP_BUTTON_CLASS}
        style={{ color: colors.textTertiary }}
        aria-label="Open in CLI"
      >
        <Terminal size={13} />
      </button>
    </ButtonHint>
  )
}

/** Copies the active conversation (as plain "You:/Claude:" text) to the clipboard
 *  so it can be pasted into the Claude app, with a brief tick confirmation. */
function CopyConversationButton() {
  const colors = useColors()
  const [copied, setCopied] = useState(false)
  const messages = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeTabId)?.messages)

  const transcript = (messages ?? [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content.trim())
    .map((m) => `${m.role === 'user' ? 'You' : 'Claude'}: ${m.content.trim()}`)
    .join('\n\n')
  const hasContent = transcript.length > 0

  const handleCopy = () => {
    if (!hasContent) return
    try { window.clod.copyToClipboard(transcript) } catch {}
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }

  return (
    <ButtonHint label={hasContent ? 'Copy conversation' : 'Nothing to copy yet'} flash={copied ? 'Conversation copied' : null}>
    <button
      onClick={handleCopy}
      disabled={!hasContent}
      className={GROUP_BUTTON_CLASS}
      style={{ color: copied ? colors.accent : colors.textTertiary, opacity: hasContent ? 1 : 0.4 }}
      aria-label="Copy conversation"
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span key="check" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.15 }} className="flex">
            <Check size={13} weight="bold" />
          </motion.span>
        ) : (
          <motion.span key="copy" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.15 }} className="flex">
            <Copy size={13} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
    </ButtonHint>
  )
}

export function TabStrip() {
  const tabs = useSessionStore((s) => s.tabs)
  const activeTabId = useSessionStore((s) => s.activeTabId)
  const selectTab = useSessionStore((s) => s.selectTab)
  const createTab = useSessionStore((s) => s.createTab)
  const closeTab = useSessionStore((s) => s.closeTab)
  const isExpanded = useSessionStore((s) => s.isExpanded)

  const groups = useSessionStore((s) => s.groups)
  const newTabShortcut = useShortcutLabel('newTab')
  const groupLabel = (g: TabGroup) => g.name || `${colorName(g.color)} group`

  // Right-click a tab: pin, duplicate, group or close it.
  const openTabMenu = async (tabId: string) => {
    const s = useSessionStore.getState()
    const tab = s.tabs.find((t) => t.id === tabId)
    if (!tab) return
    const busy = tab.status === 'running' || tab.status === 'connecting'
    const others = s.groups.filter((g) => g.id !== tab.groupId)
    const items: MenuItemSpec[] = [
      { id: 'pin', label: tab.pinned ? 'Unpin Tab' : 'Pin Tab' },
      { id: 'duplicate', label: 'Duplicate Tab', enabled: !busy },
      { type: 'separator' },
      { id: 'new-group', label: 'Add to New Group' },
      ...(others.length > 0 ? [{ label: 'Add to Group', submenu: others.map((g) => ({ id: `group:${g.id}`, label: groupLabel(g) })) }] : []),
      ...(tab.groupId ? [{ id: 'ungroup-tab', label: 'Remove from Group' }] : []),
      { type: 'separator' },
      { id: 'close', label: 'Close Tab', enabled: !isTabLocked(tab, s.groups) },
    ]
    const action = await window.clod.popupMenu(items)
    if (action === 'pin') s.togglePin(tabId)
    else if (action === 'duplicate') s.duplicateTab(tabId)
    else if (action === 'new-group') s.createGroup(tabId)
    else if (action?.startsWith('group:')) s.addToGroup(tabId, action.slice(6))
    else if (action === 'ungroup-tab') s.removeFromGroup(tabId)
    else if (action === 'close') s.closeTab(tabId)
  }

  // Right-click a group's label.
  const openGroupMenu = async (group: TabGroup) => {
    const s = useSessionStore.getState()
    const action = await window.clod.popupMenu([
      { id: 'rename', label: 'Rename Group' },
      { id: 'note', label: group.note ? 'Edit Group Note…' : 'Add Group Note…' },
      { label: 'Colour', submenu: GROUP_COLORS.map((c) => ({ id: `color:${c}`, label: colorName(c), type: 'checkbox' as const, checked: group.color === c })) },
      { id: 'pin', label: group.pinned ? 'Unpin Group' : 'Pin Group' },
      { type: 'separator' },
      { id: 'new-tab', label: 'New Tab in Group' },
      { id: 'collapse', label: group.collapsed ? 'Show Group' : 'Hide Group' },
      { id: 'ungroup', label: 'Ungroup' },
      { type: 'separator' },
      { id: 'close', label: 'Close Group', enabled: !group.pinned },
    ])
    if (action === 'rename') s.setEditingGroup(group.id)
    else if (action === 'note') s.setNoteEditor(group.id)
    else if (action?.startsWith('color:')) s.setGroupColor(group.id, action.slice(6) as TabGroupColor)
    else if (action === 'pin') s.toggleGroupPin(group.id)
    else if (action === 'new-tab') s.newTabInGroup(group.id)
    else if (action === 'collapse') s.toggleGroupCollapsed(group.id)
    else if (action === 'ungroup') s.ungroup(group.id)
    else if (action === 'close') s.closeGroup(group.id)
  }

  // Dragging tabs (and groups, by their label) to reorder them.
  const [dragging, setDragging] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<{ targetId: string; after: boolean } | null>(null)
  const endDrag = () => { setDragging(null); setDropAt(null) }
  const onDragOverTab = (e: React.DragEvent, tab: TabState) => {
    if (!dragging || dragging === tab.id) return
    if (dragging === `group:${tab.groupId}`) return // a group can't land inside itself
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const after = e.clientX > rect.left + rect.width / 2
    if (dropAt?.targetId !== tab.id || dropAt.after !== after) setDropAt({ targetId: tab.id, after })
  }
  const onDropOnTab = (e: React.DragEvent, tab: TabState) => {
    e.preventDefault()
    const after = dropAt?.targetId === tab.id ? dropAt.after : false
    const tabId = e.dataTransfer.getData(TAB_DRAG)
    const groupId = e.dataTransfer.getData(GROUP_DRAG)
    if (tabId) useSessionStore.getState().moveTab(tabId, tab.id, after)
    else if (groupId) useSessionStore.getState().moveGroup(groupId, tab.id, after)
    endDrag()
  }

  // The strip in runs: a group's tabs together behind its label, other tabs on their own.
  const runs: Array<{ group: TabGroup | null; tabs: TabState[] }> = []
  for (const tab of tabs) {
    const group = (tab.groupId && groups.find((g) => g.id === tab.groupId)) || null
    const last = runs[runs.length - 1]
    if (last && (group ? last.group?.id === group.id : !last.group)) last.tabs.push(tab)
    else runs.push({ group, tabs: [tab] })
  }

  // Tab shortcuts (⌘T, ⌘W, ⌘⇧T, ⌘K by default). Closing the last tab leaves a
  // fresh, empty one; pinned tabs stay.
  useEffect(() => window.clod.onTabShortcut((action) => {
    const s = useSessionStore.getState()
    if (action === 'newTab') s.createTab()
    else if (action === 'closeTab') s.closeTab(s.activeTabId)
    else if (action === 'reopenTab') s.reopenClosedTab()
    else if (action === 'searchTabs') s.setTabSearchOpen(!s.tabSearchOpen)
  }), [])
  const expandedUI = useThemeStore((s) => s.expandedUI)
  const setExpandedUI = useThemeStore((s) => s.setExpandedUI)
  const colors = useColors()

  return (
    <div
      data-clod-ui
      className="flex items-center no-drag"
      // Compact: extra bottom padding so the ~10px that tucks behind the input
      // bar still leaves ~8px of visible grey below the pill — even with the top.
      style={{ padding: isExpanded ? '8px 0 6px' : '8px 0 18px' }}
    >
      {/* Scrollable tabs area — clipped by master card edge */}
      <div className="relative min-w-0 flex-1">
        <div
          className="flex items-center gap-1 overflow-x-auto min-w-0"
          style={{
            scrollbarWidth: 'none',
            paddingLeft: 12,
            // Extra right breathing room so clipped tabs fade out before the edge.
            paddingRight: 14,
            // Right-only content fade so the parent card's own animated background
            // shows through cleanly in both collapsed and expanded states.
            maskImage: 'linear-gradient(to right, black 0%, black calc(100% - 40px), transparent 100%)',
            WebkitMaskImage: 'linear-gradient(to right, black 0%, black calc(100% - 40px), transparent 100%)',
          }}
        >
          <AnimatePresence mode="popLayout">
            {runs.map((run) => {
              const renderTab = (tab: TabState) => {
                const isActive = tab.id === activeTabId
                const drop = dropAt?.targetId === tab.id ? (dropAt.after ? 'after' : 'before') : null
                return (
                  <motion.div
                    key={tab.id}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: dragging === tab.id ? 0.4 : 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ duration: 0.15 }}
                    className="flex-shrink-0 max-w-[170px] min-w-0"
                  >
                    <div
                      onClick={() => selectTab(tab.id)}
                      onContextMenu={(e) => { e.preventDefault(); openTabMenu(tab.id) }}
                      title={tab.pinned ? 'Pinned (right-click to unpin)' : undefined}
                      data-tab-id={tab.id}
                      draggable
                      onDragStart={(e) => { e.dataTransfer.setData(TAB_DRAG, tab.id); e.dataTransfer.effectAllowed = 'move'; setDragging(tab.id) }}
                      onDragEnd={endDrag}
                      onDragOver={(e) => onDragOverTab(e, tab)}
                      onDrop={(e) => onDropOnTab(e, tab)}
                      className="group flex items-center gap-2 cursor-pointer select-none transition-all duration-150"
                      style={{
                        background: isActive ? colors.tabActive : 'transparent',
                        border: isActive ? `1px solid ${colors.tabActiveBorder}` : '1px solid transparent',
                        borderRadius: 9999,
                        padding: '4px 12px',
                        fontSize: 12,
                        color: isActive ? colors.textPrimary : colors.textTertiary,
                        fontWeight: isActive ? 500 : 400,
                        // Where a dragged tab will land.
                        boxShadow: drop === 'before' ? `inset 2px 0 0 ${colors.accent}` : drop === 'after' ? `inset -2px 0 0 ${colors.accent}` : undefined,
                      }}
                    >
                      <StatusDot status={tab.status} hasUnread={tab.hasUnread} hasPermission={tab.permissionQueue.length > 0} />
                      <span className="truncate flex-1">{tab.title}</span>
                      <button
                        onClick={(e) => { e.stopPropagation(); useSessionStore.getState().togglePin(tab.id) }}
                        className="flex-shrink-0 rounded-full w-4 h-4 flex items-center justify-center transition-opacity"
                        style={{ opacity: tab.pinned ? 0.75 : isActive ? 0.5 : 0, color: tab.pinned ? colors.textTertiary : colors.textSecondary }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = tab.pinned ? '0.75' : isActive ? '0.5' : '0' }}
                        title={tab.pinned ? 'Unpin tab' : 'Pin tab'}
                        aria-label={tab.pinned ? 'Unpin tab' : 'Pin tab'}
                      >
                        <PushPin size={10} weight={tab.pinned ? 'fill' : 'regular'} />
                      </button>
                      {tabs.length > 1 && !isTabLocked(tab, groups) && (
                        <button
                          onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                          className="flex-shrink-0 rounded-full w-4 h-4 flex items-center justify-center transition-opacity"
                          style={{
                            opacity: isActive ? 0.5 : 0,
                            color: colors.textSecondary,
                          }}
                          onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
                          onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = isActive ? '0.5' : '0' }}
                        >
                          <X size={9} />
                        </button>
                      )}
                    </div>
                  </motion.div>
                )
              }
              // Tabs with a thin line between them, except beside the selected tab
              // (its highlight already sets it apart).
              const withDividers = (list: TabState[]) => list.flatMap((tab, i) => {
                const prev = list[i - 1]
                const line = prev && prev.id !== activeTabId && tab.id !== activeTabId
                return line ? [<TabDivider key={`line-${prev.id}-${tab.id}`} />, renderTab(tab)] : [renderTab(tab)]
              })
              if (!run.group) return withDividers(run.tabs)
              const g = run.group
              const hex = GROUP_HEX[g.color]
              // A hidden group still shows the tab you're on.
              const shown = g.collapsed ? run.tabs.filter((t) => t.id === activeTabId) : run.tabs
              return (
                <motion.div
                  key={`group-${g.id}`}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: dragging === `group:${g.id}` ? 0.4 : 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                  className="flex items-stretch gap-1 flex-shrink-0"
                  style={{ border: `1px solid ${hex}66`, background: `${hex}14`, borderRadius: 9999, padding: 2 }}
                >
                  <GroupChip
                    group={g}
                    onMenu={() => openGroupMenu(g)}
                    onDragStart={(e) => { e.dataTransfer.setData(GROUP_DRAG, g.id); e.dataTransfer.effectAllowed = 'move'; setDragging(`group:${g.id}`) }}
                    onDragEnd={endDrag}
                    onDragOver={(e) => { if (dragging && !dragging.startsWith('group:')) { e.preventDefault(); setDropAt(null) } }}
                    onDrop={(e) => {
                      e.preventDefault()
                      const id = e.dataTransfer.getData(TAB_DRAG)
                      if (id) useSessionStore.getState().addToGroup(id, g.id)
                      endDrag()
                    }}
                  />
                  {/* Nothing here for a hidden group: an empty slot would still take
                      the gap after the label and push the outline off-centre. */}
                  {shown.length > 0 && <div className="flex items-center gap-1">{withDividers(shown)}</div>}
                </motion.div>
              )
            })}
          </AnimatePresence>
          <ButtonHint label={newTabShortcut ? `New tab (${newTabShortcut})` : 'New tab'}>
            <button
              onClick={() => createTab()}
              className="flex-shrink-0 w-[26px] h-[26px] flex items-center justify-center rounded-full transition-colors"
              style={{ color: colors.textTertiary }}
              aria-label="New tab"
            >
              <Plus size={13} />
            </button>
          </ButtonHint>
        </div>
      </div>

      {/* Button group — copy, past conversations, resize, CLI | settings */}
      <div
        className="flex items-center flex-shrink-0 ml-1 mr-3 rounded-full"
        style={{ background: colors.controlGroupBg, padding: 2, gap: 2 }}
      >
        <SearchTabsButton />
        <CopyConversationButton />
        <HistoryButton />
        <ButtonHint label={expandedUI ? 'Narrow view (double-click to reset size)' : 'Full width (double-click to reset size)'}>
          <button
            onClick={() => setExpandedUI(!expandedUI)}
            onDoubleClick={() => useThemeStore.getState().resetOverlaySize()}
            className={GROUP_BUTTON_CLASS}
            style={{ color: expandedUI ? colors.accent : colors.textTertiary }}
            aria-label="Toggle wide/narrow view"
          >
            <ArrowsOutLineHorizontal size={13} />
          </button>
        </ButtonHint>
        <OpenInCliButton />
        <span className="flex-shrink-0" style={{ width: 1, height: 14, background: colors.containerBorder, margin: '0 2px' }} />
        <SettingsButton />
      </div>
    </div>
  )
}
