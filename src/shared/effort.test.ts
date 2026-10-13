import { describe, it, expect } from 'vitest'
import { defaultEffortFor, effortLabel } from './effort'

describe('defaultEffortFor', () => {
  it('starts Sonnet at high and Opus at medium', () => {
    expect(defaultEffortFor('sonnet')).toBe('high')
    expect(defaultEffortFor('claude-opus-5-5')).toBe('medium')
  })
  it("leaves other models to Claude Code's default", () => {
    expect(defaultEffortFor('haiku')).toBeUndefined()
    expect(effortLabel(undefined)).toBe('Auto')
  })
})
