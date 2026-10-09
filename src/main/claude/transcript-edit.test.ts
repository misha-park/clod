import { describe, it, expect } from 'vitest'
import { removeExchange } from './transcript-edit'

// A small transcript: two notes, then three exchanges (prompt, tool step, answer).
const line = (o: object) => JSON.stringify({ sessionId: 'old', isSidechain: false, ...o })
const prompt = (uuid: string, parentUuid: string | null, text: string) => line({ type: 'user', uuid, parentUuid, message: { role: 'user', content: text } })
const answer = (uuid: string, parentUuid: string) => line({ type: 'assistant', uuid, parentUuid, message: { role: 'assistant', content: [{ type: 'text', text: 'OK' }] } })
const lines = [
  line({ type: 'attachment', uuid: 'n1', parentUuid: null }),
  prompt('u1', 'n1', 'BANANA'),
  answer('a1', 'u1'),
  prompt('u2', 'a1', 'CHERRY'),
  line({ type: 'user', uuid: 't2', parentUuid: 'u2', message: { role: 'user', content: [{ type: 'tool_result', content: 'x' }] } }),
  answer('a2', 't2'),
  line({ type: 'system', uuid: 's2', parentUuid: 'a2' }),
  line({ type: 'last-prompt', leafUuid: 's2' }),
  prompt('u3', 's2', 'MANGO'),
  answer('a3', 'u3'),
]
const parse = (out: string[]) => out.map((l) => JSON.parse(l))

describe('removeExchange', () => {
  it('cuts a middle exchange and re-links the next prompt', () => {
    const out = parse(removeExchange(lines, 'a1', 'new'))
    expect(out.map((e) => e.uuid).filter(Boolean)).toEqual(['n1', 'u1', 'a1', 'u3', 'a3'])
    expect(out.find((e) => e.uuid === 'u3').parentUuid).toBe('a1')
    expect(out.every((e) => !('sessionId' in e) || e.sessionId === 'new')).toBe(true)
  })

  it('cuts the first exchange', () => {
    const out = parse(removeExchange(lines, null, 'new'))
    expect(out.map((e) => e.uuid).filter(Boolean)).toEqual(['n1', 'u2', 't2', 'a2', 's2', 'u3', 'a3'])
    expect(out.find((e) => e.uuid === 'u2').parentUuid).toBe('n1')
  })

  it('refuses when there is nothing after the exchange', () => {
    expect(() => removeExchange(lines, 's2', 'new')).toThrow()
  })
})
