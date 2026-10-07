import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { ChatCircle, PushPin } from '@phosphor-icons/react'
import { useColors } from '../../theme'
import { usePopoverLayer } from '../PopoverLayer'
import type { SessionMeta } from '../../../shared/types'
import { sessionTitle, folderName, formatTimeAgo } from './useSessionBrowser'

interface Props {
  query: string
  sessions: SessionMeta[]
  loading: boolean
  allFolders: boolean
  selectedIndex: number
  onSelect: (s: SessionMeta) => void
  anchorRect: DOMRect | null
}

export const SESSION_MENU_LIMIT = 8

/** Results for `?query` in the input bar, styled like the slash-command menu. */
export function SessionSearchMenu({ query, sessions, loading, allFolders, selectedIndex, onSelect, anchorRect }: Props) {
  const colors = useColors()
  const popoverLayer = usePopoverLayer()
  const listRef = useRef<HTMLDivElement>(null)
  const shown = sessions.slice(0, SESSION_MENU_LIMIT)

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selectedIndex}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selectedIndex])

  if (!anchorRect || !popoverLayer) return null

  const q = query.trim().toLowerCase()
  const highlight = (text: string) => {
    const i = q ? text.toLowerCase().indexOf(q) : -1
    if (i < 0) return text
    return <>{text.slice(0, i)}<mark style={{ background: 'rgba(216, 90, 48, 0.28)', color: 'inherit', borderRadius: 2 }}>{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>
  }

  return createPortal(
    <motion.div
      data-clod-ui
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      transition={{ duration: 0.12 }}
      style={{
        position: 'fixed',
        bottom: window.innerHeight - anchorRect.top + 4,
        left: anchorRect.left + 12,
        right: window.innerWidth - anchorRect.right + 12,
        pointerEvents: 'auto',
      }}
    >
      <div
        className="rounded-xl overflow-hidden"
        style={{ background: colors.popoverBg, backdropFilter: 'blur(20px)', border: `1px solid ${colors.popoverBorder}`, boxShadow: colors.popoverShadow }}
      >
        <div className="px-3 pt-2 pb-1 text-[10px] font-medium" style={{ color: colors.textTertiary }}>
          {q ? `Conversations matching "${query.trim()}"` : 'Recent conversations'}{allFolders ? ' · all folders' : ''}
        </div>
        <div ref={listRef} className="overflow-y-auto pb-1" style={{ maxHeight: 240 }}>
          {shown.length === 0 && (
            <div className="px-3 py-2 text-[11px]" style={{ color: colors.textTertiary }}>
              {loading ? 'Searching…' : 'No matching conversations'}
            </div>
          )}
          {shown.map((s, i) => (
            <button
              key={s.sessionId}
              data-index={i}
              onClick={() => onSelect(s)}
              className="w-full flex items-start gap-2.5 px-3 py-1.5 text-left"
              style={{ background: i === selectedIndex ? colors.accentLight : 'transparent' }}
            >
              {s.pinned
                ? <PushPin size={12} weight="fill" className="flex-shrink-0 mt-0.5" style={{ color: colors.accent }} />
                : <ChatCircle size={12} className="flex-shrink-0 mt-0.5" style={{ color: colors.textTertiary }} />}
              <div className="min-w-0 flex-1">
                <div className="text-[11px] truncate" style={{ color: colors.textPrimary }}>{highlight(sessionTitle(s))}</div>
                {s.snippet && <div className="text-[10px] truncate" style={{ color: colors.textSecondary }}>{highlight(s.snippet)}</div>}
              </div>
              <span className="text-[10px] flex-shrink-0 mt-0.5" style={{ color: colors.textTertiary }}>
                {allFolders && s.projectPath ? `${folderName(s.projectPath)} · ` : ''}{formatTimeAgo(s.lastTimestamp)}
              </span>
            </button>
          ))}
        </div>
        <div className="px-3 py-1 text-[10px]" style={{ color: colors.textTertiary, borderTop: `1px solid ${colors.popoverBorder}` }}>
          ↑↓ move · ↵ resume · ⇥ {allFolders ? 'this folder' : 'all folders'} · esc clear
        </div>
      </div>
    </motion.div>,
    popoverLayer,
  )
}
