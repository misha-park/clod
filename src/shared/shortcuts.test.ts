import { describe, it, expect } from 'vitest'
import { matchesAccelerator, resolveShortcuts, shortcutSymbols } from './shortcuts'

const key = (k: string, mods: Partial<{ meta: boolean; control: boolean; alt: boolean; shift: boolean }> = {}) =>
  ({ key: k, meta: false, control: false, alt: false, shift: false, ...mods })

describe('matchesAccelerator', () => {
  it('matches letters regardless of case', () => {
    expect(matchesAccelerator('Command+Shift+T', key('T', { meta: true, shift: true }))).toBe(true)
    expect(matchesAccelerator('Command+T', key('t', { meta: true }))).toBe(true)
  })
  it('needs exactly the same modifiers', () => {
    expect(matchesAccelerator('Command+T', key('t', { meta: true, shift: true }))).toBe(false)
    expect(matchesAccelerator('Command+Shift+T', key('t', { meta: true }))).toBe(false)
  })
  it('handles punctuation and named keys', () => {
    expect(matchesAccelerator('Command+,', key(',', { meta: true }))).toBe(true)
    expect(matchesAccelerator('Control+Space', key(' ', { control: true }))).toBe(true)
  })
  it('never matches a turned-off shortcut', () => {
    expect(matchesAccelerator('', key('t', { meta: true }))).toBe(false)
  })
})

describe('resolveShortcuts', () => {
  it('applies saved changes over the defaults', () => {
    const s = resolveShortcuts({ newTab: 'Command+N', closeTab: '', bogus: 1 })
    expect(s.newTab).toBe('Command+N')
    expect(s.closeTab).toBe('')
    expect(s.reopenTab).toBe('Command+Shift+T')
  })
})

describe('shortcutSymbols', () => {
  it('shows symbols', () => expect(shortcutSymbols('Command+Shift+T')).toBe('⌘⇧T'))
})
