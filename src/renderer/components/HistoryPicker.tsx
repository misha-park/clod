import React, { useState, useRef, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { Clock, ChatCircle, X, PushPin, PencilSimple, DownloadSimple, MagnifyingGlass } from '@phosphor-icons/react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useSessionStore } from '../stores/sessionStore'
import { usePopoverLayer } from './PopoverLayer'
import { useColors } from '../theme'
import type { SessionMeta } from '../../shared/types'

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return new Date(isoDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function folderName(path: string | undefined): string {
  if (!path) return ''
  return path.replace(/\/$/, '').split('/').pop() || path
}

function sessionTitle(s: SessionMeta): string {
  return s.title || s.firstMessage || s.slug || s.sessionId.substring(0, 8)
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}K`
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`
}

export function HistoryPicker() {
  const resumeSession = useSessionStore((s) => s.resumeSession)
  const isExpanded = useSessionStore((s) => s.isExpanded)
  const activeTab = useStoreWithEqualityFn(
    useSessionStore,
    (s) => s.tabs.find((t) => t.id === s.activeTabId),
    (a, b) => a === b || (!!a && !!b && a.hasChosenDirectory === b.hasChosenDirectory && a.workingDirectory === b.workingDirectory),
  )
  const staticInfo = useSessionStore((s) => s.staticInfo)
  const defaultDirOverride = useSessionStore((s) => s.defaultDirOverride)
  const popoverLayer = usePopoverLayer()
  const colors = useColors()
  // Tabs without a chosen folder run in the default folder (clod-scratch unless
  // overridden), so their sessions are stored there — list from the same place.
  const effectiveProjectPath = activeTab?.hasChosenDirectory
    ? activeTab.workingDirectory
    : (defaultDirOverride || staticInfo?.defaultDir || staticInfo?.homePath || activeTab?.workingDirectory || '~')

  const [open, setOpen] = useState(false)
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [loading, setLoading] = useState(false)
  const [query, setQuery] = useState('')
  const [allFolders, setAllFolders] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameText, setRenameText] = useState('')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ right: number; top?: number; bottom?: number; maxHeight?: number }>({ right: 0 })

  const updatePos = useCallback(() => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    if (isExpanded) {
      const top = rect.bottom + 6
      setPos({
        top,
        right: window.innerWidth - rect.right,
        maxHeight: window.innerHeight - top - 12,
      })
    } else {
      setPos({
        bottom: window.innerHeight - rect.top + 6,
        right: window.innerWidth - rect.right,
      })
    }
  }, [isExpanded])

  // Plain list for this folder; search (text and names) otherwise.
  const requestSeq = useRef(0)
  const loadSessions = useCallback(async () => {
    const seq = ++requestSeq.current
    setLoading(true)
    try {
      const result = !query.trim() && !allFolders
        ? await window.clod.listSessions(effectiveProjectPath)
        : await window.clod.searchSessions(query, allFolders ? null : effectiveProjectPath)
      if (seq === requestSeq.current) setSessions(result)
    } catch {
      if (seq === requestSeq.current) setSessions([])
    }
    if (seq === requestSeq.current) setLoading(false)
  }, [effectiveProjectPath, query, allFolders])

  // Re-run (debounced) when the search or scope changes while open.
  useEffect(() => {
    if (!open) return
    const t = setTimeout(() => { void loadSessions() }, query ? 250 : 0)
    return () => clearTimeout(t)
  }, [open, query, allFolders, loadSessions])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (triggerRef.current?.contains(target)) return
      if (popoverRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const handleToggle = () => {
    if (!open) {
      updatePos()
      setRenamingId(null)
    }
    setOpen((o) => !o)
  }

  const handleSelect = (session: SessionMeta) => {
    if (renamingId) return
    setOpen(false)
    const full = sessionTitle(session)
    const title = full.length > 30 ? full.substring(0, 27) + '...' : full
    void resumeSession(session.sessionId, title, session.projectPath || effectiveProjectPath)
  }

  const patchLocal = (id: string, patch: Partial<SessionMeta>) =>
    setSessions((prev) => prev.map((s) => (s.sessionId === id ? { ...s, ...patch } : s)))

  const handlePin = async (e: React.MouseEvent, session: SessionMeta) => {
    e.stopPropagation()
    patchLocal(session.sessionId, { pinned: !session.pinned })
    await window.clod.setSessionMeta(session.sessionId, { pinned: !session.pinned }).catch(() => false)
    void loadSessions() // re-sort: pinned first
  }

  const startRename = (e: React.MouseEvent, session: SessionMeta) => {
    e.stopPropagation()
    setRenamingId(session.sessionId)
    setRenameText(session.title || session.firstMessage || '')
  }

  const commitRename = async (session: SessionMeta) => {
    const title = renameText.trim()
    setRenamingId(null)
    patchLocal(session.sessionId, { title: title || null })
    await window.clod.setSessionMeta(session.sessionId, { title }).catch(() => false)
  }

  const handleExport = async (e: React.MouseEvent, session: SessionMeta) => {
    e.stopPropagation()
    await window.clod.exportSession(session.sessionId, session.projectPath || effectiveProjectPath, sessionTitle(session)).catch(() => null)
  }

  const handleDelete = async (e: React.MouseEvent, session: SessionMeta) => {
    e.stopPropagation()
    // Optimistically remove; restore on failure.
    setSessions((prev) => prev.filter((s) => s.sessionId !== session.sessionId))
    const ok = await window.clod.deleteSession(session.sessionId, session.projectPath || effectiveProjectPath).catch(() => false)
    if (!ok) void loadSessions()
  }

  return (
    <>
      <button
        ref={triggerRef}
        onClick={handleToggle}
        className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded-full transition-colors"
        style={{ color: colors.textTertiary }}
        title="Resume a previous session"
      >
        <Clock size={13} />
      </button>

      {popoverLayer && open && createPortal(
        <motion.div
          ref={popoverRef}
          data-clod-ui
          initial={{ opacity: 0, y: isExpanded ? -4 : 4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: isExpanded ? -4 : 4 }}
          transition={{ duration: 0.12 }}
          className="rounded-xl"
          style={{
            position: 'fixed',
            ...(pos.top != null ? { top: pos.top } : {}),
            ...(pos.bottom != null ? { bottom: pos.bottom } : {}),
            right: pos.right,
            width: 320,
            pointerEvents: 'auto',
            background: colors.popoverBg,
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            boxShadow: colors.popoverShadow,
            border: `1px solid ${colors.popoverBorder}`,
            ...(pos.maxHeight != null ? { maxHeight: pos.maxHeight } : {}),
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column' as const,
          }}
        >
          <div className="px-3 pt-2 pb-2 flex-shrink-0 flex flex-col gap-2" style={{ borderBottom: `1px solid ${colors.popoverBorder}` }}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-medium" style={{ color: colors.textTertiary }}>Recent Sessions</span>
              <div className="flex rounded-md overflow-hidden text-[10px]" style={{ border: `1px solid ${colors.containerBorder}` }}>
                {([['This folder', false], ['All folders', true]] as const).map(([label, value]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setAllFolders(value)}
                    className="px-1.5 py-0.5 transition-colors"
                    style={{
                      background: allFolders === value ? colors.accent : 'transparent',
                      color: allFolders === value ? '#fff' : colors.textTertiary,
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-1.5 rounded-md px-2 py-1" style={{ background: colors.surfaceSecondary, border: `1px solid ${colors.containerBorder}` }}>
              <MagnifyingGlass size={11} style={{ color: colors.textTertiary }} />
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); query ? setQuery('') : setOpen(false) } }}
                placeholder={allFolders ? 'Search all conversations' : 'Search this folder'}
                className="flex-1 min-w-0 bg-transparent text-[11px]"
                style={{ color: colors.textPrimary, outline: 'none', border: 'none' }}
              />
              {query && (
                <button type="button" onClick={() => setQuery('')} aria-label="Clear search" style={{ color: colors.textTertiary }}>
                  <X size={10} weight="bold" />
                </button>
              )}
            </div>
          </div>

          <div className="overflow-y-auto py-1" style={{ maxHeight: pos.maxHeight != null ? undefined : 180 }}>
            {loading && sessions.length === 0 && (
              <div className="px-3 py-4 text-center text-[11px]" style={{ color: colors.textTertiary }}>
                {query ? 'Searching…' : 'Loading…'}
              </div>
            )}

            {!loading && sessions.length === 0 && (
              <div className="px-3 py-4 text-center text-[11px]" style={{ color: colors.textTertiary }}>
                {query ? 'No matching sessions' : 'No previous sessions found'}
              </div>
            )}

            {!loading && sessions.map((session) => (
              <div
                key={session.sessionId}
                className="group w-full flex items-center gap-1 pr-1.5"
              >
                <button
                  onClick={() => handleSelect(session)}
                  className="flex items-start gap-2.5 pl-3 pr-1 py-2 text-left transition-colors flex-1 min-w-0"
                >
                  {session.pinned
                    ? <PushPin size={13} weight="fill" className="flex-shrink-0 mt-0.5" style={{ color: colors.accent }} />
                    : <ChatCircle size={13} className="flex-shrink-0 mt-0.5" style={{ color: colors.textTertiary }} />}
                  <div className="min-w-0 flex-1">
                    {renamingId === session.sessionId ? (
                      <input
                        autoFocus
                        value={renameText}
                        onChange={(e) => setRenameText(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onBlur={() => void commitRename(session)}
                        onKeyDown={(e) => {
                          e.stopPropagation()
                          if (e.key === 'Enter') void commitRename(session)
                          if (e.key === 'Escape') setRenamingId(null)
                        }}
                        className="w-full rounded px-1 text-[11px]"
                        style={{ background: colors.surfaceSecondary, color: colors.textPrimary, border: `1px solid ${colors.accent}`, outline: 'none' }}
                      />
                    ) : (
                      <div className="text-[11px] truncate" style={{ color: colors.textPrimary }}>
                        {sessionTitle(session)}
                      </div>
                    )}
                    {session.snippet && (
                      <div className="text-[10px] mt-0.5 line-clamp-2" style={{ color: colors.textSecondary }}>
                        {session.snippet}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-[10px] mt-0.5" style={{ color: colors.textTertiary }}>
                      <span>{formatTimeAgo(session.lastTimestamp)}</span>
                      <span>{formatSize(session.size)}</span>
                      {allFolders && session.projectPath && <span className="truncate">{folderName(session.projectPath)}</span>}
                    </div>
                  </div>
                </button>
                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                  {[
                    { label: session.pinned ? 'Unpin' : 'Pin', icon: <PushPin size={11} weight={session.pinned ? 'fill' : 'regular'} />, onClick: (e: React.MouseEvent) => handlePin(e, session) },
                    { label: 'Rename', icon: <PencilSimple size={11} />, onClick: (e: React.MouseEvent) => startRename(e, session) },
                    { label: 'Export as Markdown', icon: <DownloadSimple size={11} />, onClick: (e: React.MouseEvent) => handleExport(e, session) },
                  ].map((a) => (
                    <button
                      key={a.label}
                      onClick={a.onClick}
                      title={a.label}
                      aria-label={a.label}
                      className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-md"
                      style={{ color: colors.textTertiary }}
                    >
                      {a.icon}
                    </button>
                  ))}
                </div>
                <button
                  onClick={(e) => handleDelete(e, session)}
                  title="Delete session"
                  aria-label="Delete session"
                  className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ color: colors.textTertiary }}
                >
                  <X size={11} weight="bold" />
                </button>
              </div>
            ))}
          </div>
        </motion.div>,
        popoverLayer,
      )}
    </>
  )
}
