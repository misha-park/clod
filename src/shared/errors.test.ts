import { describe, expect, it } from 'vitest'
import { explainError, looksLikeClodBug } from './errors'

describe('explainError', () => {
  it('spots a missing Claude Code', () => {
    expect(explainError('spawn claude ENOENT')?.action).toBe('setup')
    expect(explainError('spawn /usr/local/bin/claude ENOENT')?.action).toBe('setup')
  })

  it('spots sign-in problems', () => {
    expect(explainError('Invalid API key · Please run /login')?.text).toMatch(/isn't signed in/)
    expect(explainError('Not logged in · Please run /login')?.action).toBe('account')
    expect(explainError('OAuth token has expired. Please obtain a new token')?.text).toMatch(/expired/)
    expect(explainError('API Error: 401 {"type":"authentication_error"}')?.action).toBe('account')
  })

  it('spots plan and credit problems', () => {
    expect(explainError('Your credit balance is too low to access the Anthropic API')?.action).toBeNull()
    expect(explainError('Claude Code requires a paid plan')?.text).toMatch(/paid plan/)
  })

  it('spots connection problems', () => {
    expect(explainError('Connection error.')?.text).toMatch(/internet connection/)
    expect(explainError('getaddrinfo ENOTFOUND api.anthropic.com')?.text).toMatch(/couldn't reach Claude/)
  })

  it('leaves other errors alone', () => {
    expect(explainError('Run failed with exit code 1')).toBeNull()
    expect(explainError('Error: ENOENT: no such file or directory, open notes.txt')).toBeNull()
  })
})

describe('looksLikeClodBug', () => {
  it('flags errors from inside Clod', () => {
    expect(looksLikeClodBug("Error invoking remote method 'clod:prompt': Error: Tab 44e6 does not exist")).toBe(true)
    expect(looksLikeClodBug("Cannot read properties of undefined (reading 'id')")).toBe(true)
  })
  it('ignores ordinary failures', () => {
    expect(looksLikeClodBug('Run failed with exit code 1')).toBe(false)
  })
})
