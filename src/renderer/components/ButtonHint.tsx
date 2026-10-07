import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useColors } from '../theme'

const HOVER_DELAY_MS = 600

/**
 * A small label under a button: its name after hovering for a moment, or a
 * confirmation (`flash`) right after it's clicked. macOS's own tooltips don't
 * reliably appear in Clod's floating window, so the top buttons use this.
 * It's drawn at the window level (not inside the card, which clips its
 * contents), so it also shows when Clod is collapsed.
 */
export function ButtonHint({ label, flash, children }: { label: string; flash?: string | null; children: ReactNode }) {
  const colors = useColors()
  const [hovered, setHovered] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const anchor = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null)

  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setHovered(false)
  }
  useEffect(() => cancel, [])

  const text = flash || (hovered ? label : null)

  // Place the hint just under the button, right-aligned with it.
  useEffect(() => {
    if (!text || !anchor.current) return
    const r = anchor.current.getBoundingClientRect()
    setPos({ top: r.bottom + 6, right: window.innerWidth - r.right })
  }, [text])

  return (
    <span
      ref={anchor}
      className="relative flex"
      onMouseEnter={() => { timer.current = setTimeout(() => setHovered(true), HOVER_DELAY_MS) }}
      onMouseLeave={cancel}
      onMouseDown={cancel}
    >
      {children}
      {createPortal(
      <AnimatePresence>
        {text && pos && (
          <motion.span
            key={text}
            role="status"
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="fixed px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap pointer-events-none"
            style={{
              top: pos.top,
              right: pos.right,
              zIndex: 1000,
              background: colors.popoverBg,
              border: `1px solid ${colors.popoverBorder}`,
              boxShadow: colors.popoverShadow,
              color: colors.textPrimary,
            }}
          >
            {text}
          </motion.span>
        )}
      </AnimatePresence>,
      document.body,
      )}
    </span>
  )
}
