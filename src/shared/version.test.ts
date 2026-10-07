import { describe, expect, it } from 'vitest'
import { isNewer } from './version'

describe('isNewer', () => {
  it('compares versions number by number', () => {
    expect(isNewer('3.2.0', '3.1.0')).toBe(true)
    expect(isNewer('v3.10.0', '3.9.9')).toBe(true)
    expect(isNewer('3.1.0', '3.1.0')).toBe(false)
    expect(isNewer('3.0.9', '3.1.0')).toBe(false)
    expect(isNewer('4', '3.9.9')).toBe(true)
  })
})
