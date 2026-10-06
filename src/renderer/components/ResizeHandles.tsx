import { useRef, useState } from 'react'
import { useThemeStore, useColors } from '../theme'
import { overlaySize, sizeLimits, MIN_CARD_WIDTH, MIN_CONVERSATION_HEIGHT } from '../../shared/layout'

type Edges = { left?: boolean; right?: boolean; top?: boolean }

interface Props {
  /** 'right': the card's right edge sits at the screen edge, so only left-side handles. */
  anchor: 'right' | 'center'
  /** Height handles only make sense while the conversation is showing. */
  canResizeHeight: boolean
  onStart: () => void
  onEnd: () => void
}

const EDGE = 6 // px grab area along each edge
const CORNER = 14

const clamp = (v: number, min: number, max: number) => Math.round(Math.min(max, Math.max(min, v)))

/**
 * Drag handles on the overlay card: the top edge sets the conversation height,
 * a side edge sets the width, a top corner sets both. In centre mode the card
 * grows symmetrically, so width changes twice as fast as the pointer moves.
 */
export function ResizeHandles({ anchor, canResizeHeight, onStart, onEnd }: Props) {
  const colors = useColors()
  const start = useRef<{ x: number; y: number; w: number; h: number; edges: Edges; customW: number | null; customH: number | null } | null>(null)
  const [hover, setHover] = useState<string | null>(null)
  const [active, setActive] = useState<string | null>(null)

  const begin = (id: string, edges: Edges) => (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    e.preventDefault() // also suppresses the mousedown that would start a window drag
    e.stopPropagation()
    e.currentTarget.setPointerCapture(e.pointerId)
    const st = useThemeStore.getState()
    const size = overlaySize(st.expandedUI, st.overlayWidth, st.overlayHeight)
    start.current = {
      x: e.screenX, y: e.screenY,
      w: size.cardWidth, h: size.conversationHeight, edges,
      customW: st.overlayWidth, customH: st.overlayHeight,
    }
    setActive(id)
    onStart()
  }

  const move = (e: React.PointerEvent) => {
    const s = start.current
    if (!s) return
    const dx = e.screenX - s.x
    const dy = e.screenY - s.y
    const k = anchor === 'center' ? 2 : 1
    const { maxCardWidth, maxConversationHeight } = sizeLimits(window.screen.availWidth, window.screen.availHeight)
    // Only the dragged dimension changes; the other keeps its custom value (or preset).
    let w = s.customW
    let h = s.customH
    if (s.edges.left) w = clamp(s.w - dx * k, MIN_CARD_WIDTH, maxCardWidth)
    if (s.edges.right) w = clamp(s.w + dx * k, MIN_CARD_WIDTH, maxCardWidth)
    if (s.edges.top) h = clamp(s.h - dy, MIN_CONVERSATION_HEIGHT, maxConversationHeight)
    useThemeStore.getState().setOverlaySize(w, h, false)
  }

  const end = () => {
    if (!start.current) return
    start.current = null
    setActive(null)
    const st = useThemeStore.getState()
    st.setOverlaySize(st.overlayWidth, st.overlayHeight, true) // persist once, on release
    onEnd()
  }

  const handle = (id: string, edges: Edges, cursor: string, style: React.CSSProperties, line?: React.CSSProperties) => (
    <div
      key={id}
      data-resize-handle
      onPointerDown={begin(id, edges)}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      onMouseEnter={() => setHover(id)}
      onMouseLeave={() => setHover((h) => (h === id ? null : h))}
      style={{ position: 'absolute', zIndex: 60, cursor, ...style }}
    >
      {line && (hover === id || active === id) && (
        <div style={{ position: 'absolute', background: colors.accent, opacity: active === id ? 0.7 : 0.4, borderRadius: 2, ...line }} />
      )}
    </div>
  )

  const centre = anchor === 'center'
  return (
    <>
      {handle('left', { left: true }, 'ew-resize',
        { left: 0, top: CORNER, bottom: CORNER, width: EDGE },
        { left: 1, top: '35%', bottom: '35%', width: 2 })}
      {centre && handle('right', { right: true }, 'ew-resize',
        { right: 0, top: CORNER, bottom: CORNER, width: EDGE },
        { right: 1, top: '35%', bottom: '35%', width: 2 })}
      {canResizeHeight && handle('top', { top: true }, 'ns-resize',
        { top: 0, left: CORNER, right: CORNER, height: EDGE },
        { top: 1, left: '40%', right: '40%', height: 2 })}
      {canResizeHeight && handle('top-left', { top: true, left: true }, 'nwse-resize',
        { top: 0, left: 0, width: CORNER, height: CORNER })}
      {canResizeHeight && centre && handle('top-right', { top: true, right: true }, 'nesw-resize',
        { top: 0, right: 0, width: CORNER, height: CORNER })}
    </>
  )
}
