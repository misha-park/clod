/** Effort levels for the effort picker, and each model's default. */
import type { Effort } from './types'

export const EFFORTS: ReadonlyArray<{ id: Effort; label: string }> = [
  { id: 'low', label: 'Low' },
  { id: 'medium', label: 'Medium' },
  { id: 'high', label: 'High' },
  { id: 'xhigh', label: 'Extra high' },
  { id: 'max', label: 'Max' },
]

/** The effort a model starts at in Clod (undefined: Claude Code's own default). */
export function defaultEffortFor(model: string | null | undefined): Effort | undefined {
  const m = (model || '').toLowerCase()
  if (m.includes('sonnet')) return 'high'
  if (m.includes('opus')) return 'medium'
  return undefined
}

export function effortLabel(effort: Effort | undefined): string {
  return EFFORTS.find((e) => e.id === effort)?.label ?? 'Auto'
}
