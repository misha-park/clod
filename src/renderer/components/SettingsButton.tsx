import { GearSix } from '@phosphor-icons/react'
import { useColors } from '../theme'
import { useShortcutLabel } from '../settings-sync'
import { ButtonHint } from './ButtonHint'

/** Opens the native Clod Settings app (its shortcut, ⌘, by default, is handled by the main process). */
export function SettingsButton() {
  const colors = useColors()
  const shortcut = useShortcutLabel('openSettings')

  return (
    <ButtonHint label={shortcut ? `Settings (${shortcut})` : 'Settings'}>
      <button
        onClick={() => window.clod.openSettings()}
        className="flex-shrink-0 w-[26px] h-[26px] flex items-center justify-center rounded-full transition-colors"
        style={{ color: colors.textTertiary }}
        aria-label="Settings"
      >
        <GearSix size={14} />
      </button>
    </ButtonHint>
  )
}
