import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, Copy, Check, ArrowsOutLineHorizontal, Terminal } from '@phosphor-icons/react'
import { useSessionStore } from '../stores/sessionStore'
import { HistoryButton } from './history/HistoryButton'
import { SettingsButton } from './SettingsButton'
import { useColors, useThemeStore } from '../theme'
import type { TabStatus } from '../../shared/types'

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
export const GROUP_BUTTON_CLASS = 'flex-shrink-0 w-[30px] h-[30px] flex items-center justify-center rounded-full transition-colors'

/** Opens the active tab's session in Terminal (`claude --resume`). */
function OpenInCliButton() {
  const colors = useColors()
  const tab = useSessionStore((s) => s.tabs.find((t) => t.id === s.activeTabId))
  return (
    <button
      onClick={() => { if (tab) window.clod.openInTerminal(tab.claudeSessionId, tab.workingDirectory) }}
      className={GROUP_BUTTON_CLASS}
      style={{ color: colors.textTertiary }}
      title="Open this session in Terminal"
      aria-label="Open in CLI"
    >
      <Terminal size={15} />
    </button>
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
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <button
      onClick={handleCopy}
      disabled={!hasContent}
      className={GROUP_BUTTON_CLASS}
      style={{ color: copied ? colors.accent : colors.textTertiary, opacity: hasContent ? 1 : 0.4 }}
      title="Copy conversation for Claude"
    >
      <AnimatePresence mode="wait" initial={false}>
        {copied ? (
          <motion.span key="check" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.15 }} className="flex">
            <Check size={15} weight="bold" />
          </motion.span>
        ) : (
          <motion.span key="copy" initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.5, opacity: 0 }} transition={{ duration: 0.15 }} className="flex">
            <Copy size={15} />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
  )
}

export function TabStrip() {
  const tabs = useSessionStore((s) => s.tabs)
  const activeTabId = useSessionStore((s) => s.activeTabId)
  const selectTab = useSessionStore((s) => s.selectTab)
  const createTab = useSessionStore((s) => s.createTab)
  const closeTab = useSessionStore((s) => s.closeTab)
  const isExpanded = useSessionStore((s) => s.isExpanded)
  const expandedUI = useThemeStore((s) => s.expandedUI)
  const setExpandedUI = useThemeStore((s) => s.setExpandedUI)
  const colors = useColors()

  return (
    <div
      data-clod-ui
      className="flex items-center no-drag"
      // Compact: extra bottom padding so the ~10px that tucks behind the input
      // bar still leaves ~8px of visible grey below the pill — even with the top.
      style={{ padding: isExpanded ? '10px 0 8px' : '10px 0 20px' }}
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
            {tabs.map((tab) => {
              const isActive = tab.id === activeTabId
              return (
                <motion.div
                  key={tab.id}
                  layout
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                  onClick={() => selectTab(tab.id)}
                  data-tab-id={tab.id}
                  className="group flex items-center gap-2 cursor-pointer select-none flex-shrink-0 max-w-[190px] transition-all duration-150"
                  style={{
                    background: isActive ? colors.tabActive : 'transparent',
                    border: isActive ? `1px solid ${colors.tabActiveBorder}` : '1px solid transparent',
                    borderRadius: 9999,
                    padding: '6px 14px',
                    fontSize: 13,
                    color: isActive ? colors.textPrimary : colors.textTertiary,
                    fontWeight: isActive ? 500 : 400,
                  }}
                >
                  <StatusDot status={tab.status} hasUnread={tab.hasUnread} hasPermission={tab.permissionQueue.length > 0} />
                  <span className="truncate flex-1">{tab.title}</span>
                  {tabs.length > 1 && (
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
                      <X size={10} />
                    </button>
                  )}
                </motion.div>
              )
            })}
          </AnimatePresence>
          <button
            onClick={() => createTab()}
            className="flex-shrink-0 w-[30px] h-[30px] flex items-center justify-center rounded-full transition-colors"
            style={{ color: colors.textTertiary }}
            title="New tab"
            aria-label="New tab"
          >
            <Plus size={15} />
          </button>
        </div>
      </div>

      {/* Button group — copy, past conversations, resize, CLI | settings */}
      <div
        className="flex items-center flex-shrink-0 ml-1 mr-3 rounded-full"
        style={{ background: colors.controlGroupBg, padding: 3, gap: 2 }}
      >
        <CopyConversationButton />
        <HistoryButton />
        <button
          onClick={() => setExpandedUI(!expandedUI)}
          onDoubleClick={() => useThemeStore.getState().resetOverlaySize()}
          className={GROUP_BUTTON_CLASS}
          style={{ color: expandedUI ? colors.accent : colors.textTertiary }}
          title={`${expandedUI ? 'Switch to narrow view' : 'Switch to wide view'} · double-click to reset size`}
          aria-label="Toggle wide/narrow view"
        >
          <ArrowsOutLineHorizontal size={15} />
        </button>
        <OpenInCliButton />
        <span className="flex-shrink-0" style={{ width: 1, height: 16, background: colors.containerBorder, margin: '0 2px' }} />
        <SettingsButton />
      </div>
    </div>
  )
}
