import { describe, expect, it } from 'vitest'
import { explainPrompt } from './explain'

describe('explainPrompt', () => {
  it('quotes each line and asks for an explanation', () => {
    expect(explainPrompt('  first line\nsecond line ')).toBe('> first line\n> second line\n\nExplain this.')
  })
  it('cuts very long selections', () => {
    expect(explainPrompt('x'.repeat(25_000))).toMatch(/cut short\.\)\n\nExplain this\.$/)
  })
})
