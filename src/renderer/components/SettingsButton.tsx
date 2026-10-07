import { useEffect } from 'react'
import { GearSix } from '@phosphor-icons/react'
import { useColors } from '../theme'

/** Opens the native Clod Settings app. ⌘, works while the overlay is focused. */
export function SettingsButton() {
  const colors = useColors()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && !e.ctrlKey && !e.altKey && e.key === ',') {
        e.preventDefault()
        window.clod.openSettings()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <button
      onClick={() => window.clod.openSettings()}
      className="flex-shrink-0 w-[30px] h-[30px] flex items-center justify-center rounded-full transition-colors"
      style={{ color: colors.textTertiary }}
      title="Settings (⌘,)"
    >
      <GearSix size={16} />
    </button>
  )
}
