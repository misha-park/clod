import { describe, expect, it } from 'vitest'
import { fitReport } from './report-format'

describe('fitReport', () => {
  const head = 'Clod 3.3.0\nSettings: x\n\n--- Recent log ---'
  const log = Array.from({ length: 400 }, (_, i) => `[t] line ${i} with some detail`).join('\n')

  it('leaves short reports alone', () => {
    expect(fitReport(head + '\nshort', 6000)).toBe(head + '\nshort')
  })

  it('keeps the start and the newest log lines when too long', () => {
    const fitted = fitReport(head + '\n' + log, 3000)
    expect(encodeURIComponent(fitted).length).toBeLessThanOrEqual(3000)
    expect(fitted.startsWith(head)).toBe(true)
    expect(fitted).toContain('line 399')
    expect(fitted).not.toContain('line 0 ')
    expect(fitted).toContain('full report is on your clipboard')
  })
})
