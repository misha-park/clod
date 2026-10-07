import { describe, expect, it } from 'vitest'
import { describeRateLimit, formatReset } from './limits'

const now = new Date(2026, 9, 7, 10, 0) // Wed 7 Oct 2026, 10:00
const at = (d: Date) => Math.floor(d.getTime() / 1000)

describe('formatReset', () => {
  it('names the day relative to now', () => {
    expect(formatReset(at(new Date(2026, 9, 7, 15, 0)), now)).toMatch(/^at /)
    expect(formatReset(at(new Date(2026, 9, 8, 9, 0)), now)).toMatch(/^tomorrow at /)
    expect(formatReset(at(new Date(2026, 9, 12, 9, 0)), now)).toMatch(/^on \S+ at /)
  })
})

describe('describeRateLimit', () => {
  const later = at(new Date(2026, 9, 7, 15, 0))

  it('says nothing while usage is fine', () => {
    expect(describeRateLimit('allowed', 'five_hour', later, now)).toBeNull()
  })

  it('explains a reached limit with its reset time', () => {
    const text = describeRateLimit('rejected', 'five_hour', later, now)!
    expect(text).toMatch(/^You've reached your 5-hour Claude usage limit\. It resets at /)
  })

  it('warns before the limit, and suggests another model for model limits', () => {
    expect(describeRateLimit('allowed_warning', 'seven_day', later, now)).toMatch(/^You're getting close to your weekly/)
    expect(describeRateLimit('rejected', 'seven_day_opus', later, now)).toMatch(/switch to another model/)
  })

  it('copes with a missing reset time or type', () => {
    expect(describeRateLimit('rejected', undefined, undefined, now)).toBe("You've reached your Claude usage limit.")
  })
})
