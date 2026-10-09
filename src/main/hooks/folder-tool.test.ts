import { describe, expect, it } from 'vitest'
import { existingFolder, rankFolders } from './folder-tool'

describe('rankFolders', () => {
  it('puts exact and starts-with matches first and skips system or hidden folders', () => {
    const ranked = rankFolders(['/u/a/Tax stuff/deep/x', '/u/Tax', '/u/Library/Tax', '/u/b/taxes 2025', '/u/.hidden/tax'], 'tax')
    expect(ranked.map((m) => m.path)).toEqual(['/u/Tax', '/u/b/taxes 2025', '/u/a/Tax stuff/deep/x'])
    expect(ranked[0].name).toBe('Tax')
  })
})

describe('existingFolder', () => {
  it('expands ~ and only accepts folders', () => {
    expect(existingFolder('~')).toMatch(/^\/Users\//)
    expect(existingFolder('/definitely/not/here')).toBeNull()
    expect(existingFolder('/etc/hosts')).toBeNull()
  })
})
