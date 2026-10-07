import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, X, MagnifyingGlass, PushPin, PencilSimple, DownloadSimple, Trash,
  ChatCircle,
} from '@phosphor-icons/react'
import { useColors } from '../../theme'
import { useSessionStore } from '../../stores/sessionStore'
import type { SessionMeta } from '../../../shared/types'
import { useSessionBrowser, groupSessions, sessionTitle, folderName, formatTimeAgo } from './useSessionBrowser'

/** Highlight the first occurrence of `query` in `text`. */
function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim()
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1
  if (i < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, i)}
      <mark style={{ background: 'rgba(216, 90, 48, 0.28)', color: 'inherit', borderRadius: 2 }}>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  )
}

/**
 * Search and browse past sessions. Shared by the in-card view (variant 'card')
 * and the side drawer (variant 'drawer'). Fills its container's height.
 */
export function SessionBrowser({ variant }: { variant: 'card' | 'drawer' }) {
  const colors = useColors()
  const setHistoryOpen = useSessionStore((s) => s.setHistoryOpen)
  const b = useSessionBrowser(true)
  const [selected, setSelected] = useState(0)
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const compact = variant === 'drawer'

  const groups = useMemo(() => groupSessions(b.sessions), [b.sessions])
  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups])
  useEffect(() => { setSelected(0) }, [b.query, b.allFolders])
  useEffect(() => { inputRef.current?.focus() }, [])

  const close = () => setHistoryOpen(false)
  const open = (s: SessionMeta) => { b.open(s); close() }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (renaming) return
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); b.query ? b.setQuery('') : close() }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((i) => Math.min(flat.length - 1, i + 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((i) => Math.max(0, i - 1)) }
    else if (e.key === 'Enter' && flat[selected]) { e.preventDefault(); open(flat[selected]) }
    else if (e.key === 'Tab') { e.preventDefault(); b.setAllFolders(!b.allFolders) }
  }

  // Keep the keyboard selection in view.
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${selected}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [selected])

  const commitRename = (s: SessionMeta) => {
    void b.rename(s, renameText)
    setRenaming(null)
    inputRef.current?.focus()
  }

  const iconBtn = (label: string, icon: React.ReactNode, onClick: () => void) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-md"
      style={{ color: colors.textTertiary }}
    >
      {icon}
    </button>
  )

  let index = -1
  return (
    <div className="flex flex-col h-full min-h-0" onKeyDown={onKeyDown}>
      {/* Header: back, search, scope, layout */}
      <div className="flex items-center gap-1.5 px-2 py-2 flex-shrink-0" style={{ borderBottom: `1px solid ${colors.popoverBorder}` }}>
        {iconBtn(variant === 'card' ? 'Back to conversation' : 'Close', variant === 'card' ? <ArrowLeft size={13} /> : <X size={12} />, close)}
        <div className="flex items-center gap-1.5 rounded-md px-2 py-1 flex-1 min-w-0" style={{ background: colors.surfaceSecondary, border: `1px solid ${colors.containerBorder}` }}>
          <MagnifyingGlass size={11} style={{ color: colors.textTertiary }} />
          <input
            ref={inputRef}
            value={b.query}
            onChange={(e) => b.setQuery(e.target.value)}
            placeholder={b.allFolders ? 'Search all conversations' : 'Search this folder'}
            className="flex-1 min-w-0 bg-transparent text-[11px]"
            style={{ color: colors.textPrimary, outline: 'none', border: 'none' }}
          />
        </div>
        <button
          type="button"
          onClick={() => b.setAllFolders(!b.allFolders)}
          title="Switch between this folder and all folders (Tab)"
          className="flex-shrink-0 rounded-md px-1.5 py-0.5 text-[10px]"
          style={{ background: b.allFolders ? colors.accent : 'transparent', color: b.allFolders ? '#fff' : colors.textTertiary, border: `1px solid ${b.allFolders ? colors.accent : colors.containerBorder}` }}
        >
          {b.allFolders ? 'All' : (compact ? 'Folder' : 'This folder')}
        </button>
      </div>

      {/* Results */}
      <div ref={listRef} className="overflow-y-auto flex-1 min-h-0 py-1">
        {b.loading && b.sessions.length === 0 && (
          <div className="px-3 py-4 text-center text-[11px]" style={{ color: colors.textTertiary }}>{b.query ? 'Searching…' : 'Loading…'}</div>
        )}
        {!b.loading && b.sessions.length === 0 && (
          <div className="px-3 py-4 text-center text-[11px]" style={{ color: colors.textTertiary }}>
            {b.query ? 'No matching conversations' : 'No conversations here yet'}
          </div>
        )}
        {groups.map((g) => (
          <div key={g.label}>
            <div className="px-3 pt-2 pb-1 text-[10px] font-medium" style={{ color: colors.textTertiary }}>{g.label}</div>
            {g.items.map((s) => {
              index++
              const i = index
              const isSel = i === selected
              return (
                <div
                  key={s.sessionId}
                  data-index={i}
                  onClick={() => (renaming ? undefined : open(s))}
                  onMouseEnter={() => setSelected(i)}
                  className="group flex items-start gap-2 mx-1 px-2 py-1.5 rounded-lg cursor-pointer"
                  style={{ background: isSel ? colors.surfaceHover : 'transparent' }}
                >
                  {s.pinned
                    ? <PushPin size={12} weight="fill" className="flex-shrink-0 mt-0.5" style={{ color: colors.accent }} />
                    : <ChatCircle size={12} className="flex-shrink-0 mt-0.5" style={{ color: colors.textTertiary }} />}
                  <div className="min-w-0 flex-1">
                    {renaming === s.sessionId ? (
                      <input
                        autoFocus
                        value={renameText}
                        onChange={(e) => setRenameText(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => commitRename(s)}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === 'Enter') commitRename(s)
                          if (e.key === 'Escape') { setRenaming(null); inputRef.current?.focus() }
                        }}
                        className="w-full rounded px-1 text-[11px]"
                        style={{ background: colors.surfaceSecondary, color: colors.textPrimary, border: `1px solid ${colors.accent}`, outline: 'none' }}
                      />
                    ) : (
                      <div className="text-[11px] truncate" style={{ color: colors.textPrimary }}>
                        <Highlight text={sessionTitle(s)} query={b.query} />
                      </div>
                    )}
                    {s.snippet && !compact && (
                      <div className="text-[10px] mt-0.5 line-clamp-2" style={{ color: colors.textSecondary }}>
                        <Highlight text={s.snippet} query={b.query} />
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-[10px] mt-0.5" style={{ color: colors.textTertiary }}>
                      <span>{formatTimeAgo(s.lastTimestamp)}</span>
                      {b.allFolders && s.projectPath && <span className="truncate">· {folderName(s.projectPath)}</span>}
                    </div>
                  </div>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {iconBtn(s.pinned ? 'Unpin' : 'Pin', <PushPin size={11} weight={s.pinned ? 'fill' : 'regular'} />, () => void b.togglePin(s))}
                    {iconBtn('Rename', <PencilSimple size={11} />, () => { setRenaming(s.sessionId); setRenameText(s.title || s.firstMessage || '') })}
                    {!compact && iconBtn('Export as Markdown', <DownloadSimple size={11} />, () => void b.exportMarkdown(s))}
                    {iconBtn('Delete', <Trash size={11} />, () => void b.remove(s))}
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {!compact && (
        <div className="px-3 py-1.5 text-[10px] flex-shrink-0" style={{ color: colors.textTertiary, borderTop: `1px solid ${colors.popoverBorder}` }}>
          ↑↓ move · ↵ open · ⇥ all folders · esc back
        </div>
      )}
    </div>
  )
}
