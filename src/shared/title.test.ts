import { describe, it, expect } from 'vitest'
import { cleanTitle } from './title'

describe('cleanTitle', () => {
  it('keeps a plain title', () => expect(cleanTitle('Mac Fan Loud at Idle\n')).toBe('Mac Fan Loud at Idle'))
  it('strips quotes, labels and full stops', () => expect(cleanTitle('Title: "Sorting Downloads."')).toBe('Sorting Downloads'))
  it('rejects rambling replies', () => expect(cleanTitle('Sure! Here is a short title you could use for this chat about fans')).toBeNull())
  it('rejects empty replies', () => expect(cleanTitle('  \n')).toBeNull())
})
