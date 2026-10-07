import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { TabStrip } from './components/TabStrip'
import { ConversationView } from './components/ConversationView'
import { InputBar } from './components/InputBar'
import { AnimatedInputBorder } from './components/AnimatedInputBorder'
import { StatusBar } from './components/StatusBar'
import { MarketplacePanel } from './components/MarketplacePanel'
import { PopoverLayerProvider } from './components/PopoverLayer'
import { useClaudeEvents } from './hooks/useClaudeEvents'
import { useHealthReconciliation } from './hooks/useHealthReconciliation'
import { useFolderDrop } from './hooks/useFolderDrop'
import { ResizeHandles } from './components/ResizeHandles'
import { SessionBrowser } from './components/history/SessionBrowser'
import { overlaySize, windowSizeFor } from '../shared/layout'
import { useSessionStore } from './stores/sessionStore'
import { useColors, useThemeStore } from './theme'

const TRANSITION = { duration: 0.26, ease: [0.4, 0, 0.1, 1] as const }

export default function App() {
  useClaudeEvents()
  useHealthReconciliation()

  const colors = useColors()
  const setSystemTheme = useThemeStore((s) => s.setSystemTheme)
  const expandedUI = useThemeStore((s) => s.expandedUI)
  const overlayWidth = useThemeStore((s) => s.overlayWidth)
  const overlayHeight = useThemeStore((s) => s.overlayHeight)
  const narrowWidth = useThemeStore((s) => s.narrowWidth)
  const wideWidth = useThemeStore((s) => s.wideWidth)
  // While the user drags a resize handle: no size animations, no click-through.
  const [resizing, setResizing] = useState(false)
  const historyOpen = useSessionStore((s) => s.historyOpen)
  const historyMode = useSessionStore((s) => s.historyMode)
  const drawerOpen = historyOpen && historyMode === 'drawer'
  const historyInCard = historyOpen && historyMode === 'card'
  // The drawer runs from the card's top down to the input bar; track the card's top.
  const cardRef = useRef<HTMLDivElement>(null)
  const [cardTop, setCardTop] = useState(0)
  useEffect(() => {
    const el = cardRef.current
    if (!el) return
    const update = () => setCardTop(el.offsetTop)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    if (el.parentElement) ro.observe(el.parentElement)
    return () => ro.disconnect()
  }, [])
  const resizingRef = useRef(false)
  const windowPosition = useThemeStore((s) => s.windowPosition)
  const borderAnimation = useThemeStore((s) => s.borderAnimation)
  const [inputFocused, setInputFocused] = useState(false)

  // Push persisted window position + hotkey to main on launch (main defaults to
  // center / double-tap Option).
  useEffect(() => {
    const t = useThemeStore.getState()
    try { window.clod.setWindowPosition(t.windowPosition) } catch {}
    try { window.clod.setHotkey(t.hotkeyMode, t.hotkeyAccelerator) } catch {}
    try { window.clod.setOpenAtLogin(t.openAtLogin) } catch {}
  }, [])

  // Window placement is owned by the main process (SET_WINDOW_POSITION →
  // resetWindowPosition). A second, relative move from here used to stack on
  // top of it at launch and push the window half off the screen.

  // ─── Theme initialization ───
  useEffect(() => {
    // Get initial OS theme — setSystemTheme respects themeMode (system/light/dark)
    window.clod.getTheme().then(({ isDark }) => {
      setSystemTheme(isDark)
    }).catch(() => {})

    // Listen for OS theme changes
    const unsub = window.clod.onThemeChange((isDark) => {
      setSystemTheme(isDark)
    })
    return unsub
  }, [setSystemTheme])

  useEffect(() => {
    useSessionStore.getState().initStaticInfo().then(async () => {
      // Reopen the conversations that were open when Clod last quit.
      if (await useSessionStore.getState().restoreOpenTabs()) return
      const homeDir = useSessionStore.getState().defaultDirOverride || useSessionStore.getState().staticInfo?.defaultDir || useSessionStore.getState().staticInfo?.homePath || '~'
      const tab = useSessionStore.getState().tabs[0]
      if (tab) {
        // Set working directory to home by default (user hasn't chosen yet)
        useSessionStore.setState((s) => ({
          tabs: s.tabs.map((t, i) => (i === 0 ? { ...t, workingDirectory: homeDir, hasChosenDirectory: false } : t)),
        }))
        window.clod.createTab().then(({ tabId }) => {
          useSessionStore.setState((s) => ({
            tabs: s.tabs.map((t, i) => (i === 0 ? { ...t, id: tabId } : t)),
            activeTabId: tabId,
          }))
        }).catch(() => {})
      }
    })
  }, [])

  // Shared drag ref — must be declared before the setIgnoreMouseEvents effect so both closures can read it
  const dragRef = useRef<{ startX: number; startY: number } | null>(null)

  // Vertical position tracking — window moves first (until macOS clamps it), then CSS overflows
  const PILL_HEIGHT_CONST = 720
  const PILL_BOTTOM_MARGIN_CONST = 6
  const minWindowY = window.screen.availTop   // top of work area (below menu bar)
  const initialWindowY = window.screen.availTop + window.screen.availHeight - PILL_HEIGHT_CONST - PILL_BOTTOM_MARGIN_CONST
  const windowYRef = useRef(initialWindowY)
  const cardYRef = useRef(0) // CSS translateY offset (only used after window hits its y constraint)

  // OS-level click-through (RAF-throttled to avoid per-pixel IPC)
  useEffect(() => {
    if (!window.clod?.setIgnoreMouseEvents) return
    let lastIgnored: boolean | null = null

    const onMouseMove = (e: MouseEvent) => {
      // While dragging or resizing, keep full mouse capture — don't toggle ignore-events
      if (dragRef.current || resizingRef.current) return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const isUI = !!(el && el.closest('[data-clod-ui]'))
      const shouldIgnore = !isUI
      if (shouldIgnore !== lastIgnored) {
        lastIgnored = shouldIgnore
        if (shouldIgnore) {
          window.clod.setIgnoreMouseEvents(true, { forward: true })
        } else {
          window.clod.setIgnoreMouseEvents(false)
        }
      }
    }

    const onMouseLeave = () => {
      if (dragRef.current || resizingRef.current) return
      if (lastIgnored !== true) {
        lastIgnored = true
        window.clod.setIgnoreMouseEvents(true, { forward: true })
      }
    }

    // Cursor position pushed from the main process. Unlike mousemove, this
    // keeps arriving during an OS drag, so the card can accept dropped folders.
    const offCursor = window.clod.onCursorPoint?.((point) => {
      if (point) onMouseMove({ clientX: point.x, clientY: point.y } as MouseEvent)
      else onMouseLeave()
    })

    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseleave', onMouseLeave)
    return () => {
      offCursor?.()
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseleave', onMouseLeave)
    }
  }, [])

  const draggingFiles = useFolderDrop()

  // Dev/QA snapshots (CLOD_SNAPSHOT_DIR): the main process asks the overlay to open.
  useEffect(() => {
    const open = () => useSessionStore.setState({ isExpanded: true })
    window.addEventListener('clod-debug-expand', open)
    return () => window.removeEventListener('clod-debug-expand', open)
  }, [])

  // Manual window drag — bypasses -webkit-app-region conflicts with setIgnoreMouseEvents
  useEffect(() => {
    if (!window.clod?.startWindowDrag) return

    const onMouseDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      // Skip interactive elements — everything else on the card is draggable
      if (el.closest('button, input, textarea, a, select, [role="button"], [contenteditable], .cm-editor, [data-resize-handle]')) return
      if (!el.closest('[data-clod-ui]')) return
      e.preventDefault()
      // Double-click: snap back to default position
      if (e.detail >= 2) {
        window.clod.resetWindowPosition()
        windowYRef.current = initialWindowY
        cardYRef.current = 0
        document.documentElement.style.setProperty('--clod-card-y', '0px')
        return
      }
      // Ensure full mouse capture for the duration of the drag
      window.clod.setIgnoreMouseEvents(false)
      // The window height varies with the overlay size, so read where it really is.
      windowYRef.current = window.screenY
      dragRef.current = { startX: e.screenX, startY: e.screenY }
    }

    const onMouseMove = (e: MouseEvent) => {
      if (!dragRef.current) return
      const dx = e.screenX - dragRef.current.startX
      const dy = e.screenY - dragRef.current.startY
      if (dx !== 0 || dy !== 0) {
        // Horizontal: always native window movement (full screen width range)
        if (dx !== 0) window.clod.startWindowDrag(dx, 0)
        // Vertical: move window first (until macOS y constraint), then CSS within window
        if (dy !== 0) {
          if (dy < 0) {
            // Moving up — window first, then CSS overflow
            const windowCanMove = windowYRef.current - minWindowY
            const windowDy = Math.max(-windowCanMove, dy)
            const cssDy = dy - windowDy
            if (windowDy !== 0) {
              window.clod.startWindowDrag(0, windowDy)
              windowYRef.current += windowDy
            }
            if (cssDy !== 0) {
              cardYRef.current += cssDy
              document.documentElement.style.setProperty('--clod-card-y', `${cardYRef.current}px`)
            }
          } else {
            // Moving down — undo CSS first, then move window
            const cssUndo = Math.min(-cardYRef.current, dy)
            const windowDy = dy - cssUndo
            if (cssUndo !== 0) {
              cardYRef.current += cssUndo
              document.documentElement.style.setProperty('--clod-card-y', `${cardYRef.current}px`)
            }
            if (windowDy !== 0) {
              window.clod.startWindowDrag(0, windowDy)
              windowYRef.current += windowDy
            }
          }
        }
        dragRef.current.startX = e.screenX
        dragRef.current.startY = e.screenY
      }
    }

    const onMouseUp = () => {
      dragRef.current = null
    }

    document.addEventListener('mousedown', onMouseDown)
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
    return () => {
      document.removeEventListener('mousedown', onMouseDown)
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  const isExpanded = useSessionStore((s) => s.isExpanded)
  const marketplaceOpen = useSessionStore((s) => s.marketplaceOpen)

  // Layout dimensions — narrow/wide preset, or the user's resized size
  const size = overlaySize(expandedUI, overlayWidth, overlayHeight, { narrowWidth, wideWidth })
  const contentWidth = size.cardWidth
  const cardExpandedWidth = size.cardWidth
  const cardCollapsedWidth = size.cardWidth - 30
  const cardCollapsedMargin = 15
  const bodyMaxHeight = size.conversationHeight + 64

  // Keep the transparent native window big enough for the card.
  useEffect(() => {
    const w = windowSizeFor(size, window.screen.availWidth, window.screen.availHeight)
    // The drawer sits left of the card (both sides' worth of room when centred).
    const drawerRoom = drawerOpen ? (windowPosition === 'right' ? 282 + 16 : 2 * 282) : 0
    const width = Math.min(window.screen.availWidth, Math.max(w.width, size.cardWidth + drawerRoom + 24))
    window.clod.setWindowSize?.(width, w.height)
  }, [size.cardWidth, size.conversationHeight, drawerOpen, windowPosition])

  return (
    <PopoverLayerProvider>
      <div
        className="flex flex-col justify-end h-full"
        style={{
          background: 'transparent',
          // Horizontal anchor: right mode pins the column to the window's right
          // edge (which sits at the screen's right edge); center mode uses margin auto.
          alignItems: windowPosition === 'right' ? 'flex-end' : undefined,
          paddingRight: windowPosition === 'right' ? 16 : 0,
        }}
      >

        {/* ─── content column. Circles overflow left. ─── */}
        <div style={{ width: contentWidth, position: 'relative', margin: windowPosition === 'right' ? '0' : '0 auto', transition: resizing ? 'none' : 'width 0.26s cubic-bezier(0.4, 0, 0.1, 1)', transform: 'translateY(var(--clod-card-y, 0px))' }}>
          {drawerOpen && (
            <div
              data-clod-ui
              className="rounded-2xl overflow-hidden"
              style={{
                position: 'absolute', right: 'calc(100% + 12px)', top: cardTop, bottom: 10, width: 270, zIndex: 30,
                background: colors.popoverBg, border: `1px solid ${colors.popoverBorder}`, boxShadow: colors.popoverShadow,
                backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
              }}
            >
              <SessionBrowser variant="drawer" />
            </div>
          )}

          <AnimatePresence initial={false}>
            {marketplaceOpen && (
              <div
                data-clod-ui
                style={{
                  width: 720,
                  maxWidth: 720,
                  marginLeft: '50%',
                  transform: 'translateX(-50%)',
                  marginBottom: 14,
                  position: 'relative',
                  zIndex: 30,
                }}
              >
                <motion.div
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.985 }}
                  transition={TRANSITION}
                >
                  <div
                    data-clod-ui
                    className="glass-surface overflow-hidden no-drag"
                    style={{
                      borderRadius: 24,
                      maxHeight: 470,
                    }}
                  >
                    <MarketplacePanel />
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          {/*
            ─── Tabs / message shell ───
            This always remains the chat shell. The marketplace is a separate
            panel rendered above it, never inside it.
          */}
          <motion.div
            ref={cardRef}
            data-clod-ui
            className="overflow-hidden flex flex-col drag-region"
            animate={{
              width: isExpanded ? cardExpandedWidth : cardCollapsedWidth,
              // Collapsed: the square bottom runs straight down and tucks behind
              // the input bar. The tab strip's extra bottom padding keeps the
              // visible grey above and below the pill even despite this overlap.
              marginBottom: isExpanded ? 10 : -10,
              marginLeft: isExpanded ? 0 : cardCollapsedMargin,
              marginRight: isExpanded ? 0 : cardCollapsedMargin,
              background: isExpanded ? colors.containerBg : colors.containerBgCollapsed,
              borderColor: draggingFiles ? colors.accent : colors.containerBorder,
              boxShadow: isExpanded ? colors.cardShadow : colors.cardShadowCollapsed,
              // Compact: rounded top only, square bottom. Expanded: all four rounded.
              borderTopLeftRadius: isExpanded ? 34 : 30,
              borderTopRightRadius: isExpanded ? 34 : 30,
              borderBottomLeftRadius: isExpanded ? 34 : 0,
              borderBottomRightRadius: isExpanded ? 34 : 0,
            }}
            transition={resizing ? { duration: 0 } : TRANSITION}
            style={{
              borderWidth: 1,
              borderStyle: 'solid',
              position: 'relative',
              zIndex: isExpanded ? 20 : 10,
            }}
          >
            {draggingFiles && (
              <div
                className="absolute inset-0 flex items-center justify-center text-[12px] font-medium"
                style={{
                  zIndex: 50,
                  pointerEvents: 'none',
                  borderRadius: 'inherit',
                  background: colors.containerBg,
                  color: colors.accent,
                }}
              >
                Drop a folder to work in it
              </div>
            )}
            <ResizeHandles
              anchor={windowPosition === 'right' ? 'right' : 'center'}
              canResizeHeight={isExpanded}
              onStart={() => { resizingRef.current = true; setResizing(true); window.clod.setIgnoreMouseEvents(false) }}
              onEnd={() => { resizingRef.current = false; setResizing(false) }}
            />
            {/* Tab strip — always mounted */}
            <div className="no-drag">
              <TabStrip />
            </div>

            {/* Body — chat history only; the marketplace is a separate overlay above */}
            <motion.div
              initial={false}
              animate={{
                height: isExpanded ? 'auto' : 0,
                opacity: isExpanded ? 1 : 0,
              }}
              transition={resizing ? { duration: 0 } : TRANSITION}
              className="overflow-hidden no-drag"
            >
              {historyInCard ? (
                <div style={{ height: size.conversationHeight + 44 }}>
                  <SessionBrowser variant="card" />
                </div>
              ) : (
                <div style={{ maxHeight: bodyMaxHeight }}>
                  <ConversationView />
                  <StatusBar />
                </div>
              )}
            </motion.div>
          </motion.div>

          {/* ─── Input row ─── */}
          {/* marginBottom: shadow buffer so the glass-surface drop shadow isn't clipped at the native window edge */}
          <div data-clod-ui className="relative" style={{ minHeight: 46, zIndex: 15, marginBottom: 10 }}>
            {/* Input pill */}
            <div
              data-clod-ui
              className="glass-surface w-full"
              style={{ position: 'relative', minHeight: 50, borderRadius: 26, padding: '0 7px 0 20px', background: colors.inputPillBg }}
              onFocusCapture={() => setInputFocused(true)}
              onBlurCapture={(e) => {
                // Only blur when focus leaves the pill entirely (not when moving
                // between the textarea and the attach/screenshot buttons).
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setInputFocused(false)
              }}
            >
              <AnimatedInputBorder enabled={borderAnimation} focused={inputFocused} />
              <InputBar />
            </div>
          </div>
        </div>
      </div>
    </PopoverLayerProvider>
  )
}
