import { Clock } from '@phosphor-icons/react'
import { useColors } from '../../theme'
import { useSessionStore } from '../../stores/sessionStore'

/** Opens/closes the session history (in the card or as a drawer, per the saved choice). */
export function HistoryButton() {
  const colors = useColors()
  const historyOpen = useSessionStore((s) => s.historyOpen)
  const setHistoryOpen = useSessionStore((s) => s.setHistoryOpen)
  return (
    <button
      onClick={() => setHistoryOpen(!historyOpen)}
      className="flex-shrink-0 w-[26px] h-[26px] flex items-center justify-center rounded-full transition-colors"
      style={{ color: historyOpen ? colors.accent : colors.textTertiary }}
      title="Past conversations (or type ? in the input bar)"
      aria-label="Past conversations"
    >
      <Clock size={13} />
    </button>
  )
}
