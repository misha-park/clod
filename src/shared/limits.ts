/**
 * Plain-English messages for Claude usage limits, from Claude Code's
 * rate_limit_event. `resetsAt` is Unix time in seconds.
 */

const WINDOW_NAMES: Record<string, string> = {
  five_hour: '5-hour',
  seven_day: 'weekly',
  seven_day_opus: 'weekly Opus',
  seven_day_sonnet: 'weekly Sonnet',
  seven_day_overage_included: 'weekly',
}

/** "at 3:00 pm" today, "tomorrow at 3:00 pm", or "on Tuesday at 3:00 pm". */
export function formatReset(resetsAtSeconds: number, now: Date = new Date()): string {
  const when = new Date(resetsAtSeconds * 1000)
  const time = when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(when) - day(now)) / 86_400_000)
  if (days <= 0) return `at ${time}`
  if (days === 1) return `tomorrow at ${time}`
  if (days < 7) return `on ${when.toLocaleDateString(undefined, { weekday: 'long' })} at ${time}`
  return `on ${when.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}`
}

/** The message to show for a rate-limit event, or null when there's nothing to say. */
export function describeRateLimit(
  status: string,
  rateLimitType: string | undefined,
  resetsAt: number | undefined,
  now: Date = new Date(),
): string | null {
  if (status !== 'rejected' && status !== 'allowed_warning') return null
  const reset = typeof resetsAt === 'number' && resetsAt > 0 ? ` It resets ${formatReset(resetsAt, now)}.` : ''
  const modelSpecific = rateLimitType === 'seven_day_opus' || rateLimitType === 'seven_day_sonnet'

  if (rateLimitType === 'overage') {
    return status === 'rejected'
      ? `You've used all of your extra Claude usage.${reset}`
      : `You're close to using all of your extra Claude usage.${reset}`
  }

  const name = WINDOW_NAMES[rateLimitType ?? ''] ?? ''
  const limit = name ? `your ${name} Claude usage limit` : 'your Claude usage limit'
  if (status === 'allowed_warning') return `You're getting close to ${limit}.${reset}`
  return `You've reached ${limit}.${reset}` + (modelSpecific ? ' You can switch to another model in the meantime.' : '')
}
