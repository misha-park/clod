import { useCallback, useEffect, useRef, useState } from 'react'
import { useStoreWithEqualityFn } from 'zustand/traditional'
import { useSessionStore } from '../../stores/sessionStore'
import type { SessionMeta } from '../../../shared/types'

export function sessionTitle(s: SessionMeta): string {
  return s.title || s.firstMessage || s.slug || s.sessionId.substring(0, 8)
}

export function folderName(path: string | undefined): string {
  if (!path) return ''
  return path.replace(/\/$/, '').split('/').pop() || path
}

export function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return new Date(isoDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Pinned first, then Today / Yesterday / This week / Earlier (input already newest-first). */
export function groupSessions(sessions: SessionMeta[]): Array<{ label: string; items: SessionMeta[] }> {
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  const day = 86400000
  const buckets: Record<string, SessionMeta[]> = { Pinned: [], Today: [], Yesterday: [], 'This week': [], Earlier: [] }
  for (const s of sessions) {
    if (s.pinned) { buckets.Pinned.push(s); continue }
    const t = new Date(s.lastTimestamp).getTime()
    if (t >= startOfToday.getTime()) buckets.Today.push(s)
    else if (t >= startOfToday.getTime() - day) buckets.Yesterday.push(s)
    else if (t >= startOfToday.getTime() - 6 * day) buckets['This week'].push(s)
    else buckets.Earlier.push(s)
  }
  return Object.entries(buckets).filter(([, items]) => items.length).map(([label, items]) => ({ label, items }))
}

/** The folder sessions are listed from: the tab's folder, else the default folder. */
export function useEffectiveProjectPath(): string {
  const activeTab = useStoreWithEqualityFn(
    useSessionStore,
    (s) => s.tabs.find((t) => t.id === s.activeTabId),
    (a, b) => a === b || (!!a && !!b && a.hasChosenDirectory === b.hasChosenDirectory && a.workingDirectory === b.workingDirectory),
  )
  const staticInfo = useSessionStore((s) => s.staticInfo)
  const defaultDirOverride = useSessionStore((s) => s.defaultDirOverride)
  return activeTab?.hasChosenDirectory
    ? activeTab.workingDirectory
    : (defaultDirOverride || staticInfo?.defaultDir || staticInfo?.homePath || activeTab?.workingDirectory || '~')
}

/**
 * Loading, searching and managing past sessions — shared by the in-card view,
 * the side drawer and the `?` search in the input bar.
 */
export function useSessionBrowser(active: boolean, initialQuery = '') {
  const resumeSession = useSessionStore((s) => s.resumeSession)
  const projectPath = useEffectiveProjectPath()
  const [query, setQuery] = useState(initialQuery)
  // Search every conversation by default; Tab / the scope button narrows to this folder.
  const [allFolders, setAllFolders] = useState(true)
  const [sessions, setSessions] = useState<SessionMeta[]>([])
  const [loading, setLoading] = useState(false)
  const seq = useRef(0)

  const load = useCallback(async () => {
    const n = ++seq.current
    setLoading(true)
    try {
      const result = !query.trim() && !allFolders
        ? await window.clod.listSessions(projectPath)
        : await window.clod.searchSessions(query, allFolders ? null : projectPath)
      if (n === seq.current) setSessions(result)
    } catch {
      if (n === seq.current) setSessions([])
    }
    if (n === seq.current) setLoading(false)
  }, [projectPath, query, allFolders])

  useEffect(() => {
    if (!active) return
    const t = setTimeout(() => { void load() }, query ? 250 : 0)
    return () => clearTimeout(t)
  }, [active, query, allFolders, load])

  const patch = (id: string, p: Partial<SessionMeta>) =>
    setSessions((prev) => prev.map((s) => (s.sessionId === id ? { ...s, ...p } : s)))

  return {
    query, setQuery, allFolders, setAllFolders, sessions, loading, projectPath,
    open: (s: SessionMeta) => {
      const full = sessionTitle(s)
      void resumeSession(s.sessionId, full.length > 30 ? full.substring(0, 27) + '...' : full, s.projectPath || projectPath)
    },
    togglePin: async (s: SessionMeta) => {
      patch(s.sessionId, { pinned: !s.pinned })
      await window.clod.setSessionMeta(s.sessionId, { pinned: !s.pinned }).catch(() => false)
      void load()
    },
    rename: async (s: SessionMeta, title: string) => {
      patch(s.sessionId, { title: title.trim() || null })
      await window.clod.setSessionMeta(s.sessionId, { title: title.trim() }).catch(() => false)
    },
    exportMarkdown: (s: SessionMeta) =>
      window.clod.exportSession(s.sessionId, s.projectPath || projectPath, sessionTitle(s)).catch(() => null),
    remove: async (s: SessionMeta) => {
      setSessions((prev) => prev.filter((x) => x.sessionId !== s.sessionId))
      const ok = await window.clod.deleteSession(s.sessionId, s.projectPath || projectPath).catch(() => false)
      if (!ok) void load()
    },
  }
}
