import { describe, it, expect } from 'vitest'
import { overlaySize, windowSizeFor, sizeLimits, PRESETS, BASE_WINDOW_WIDTH, BASE_WINDOW_HEIGHT } from './layout'

describe('overlay sizing', () => {
  it('uses the narrow/wide presets when no custom size is set', () => {
    expect(overlaySize(false, null, null)).toEqual({ cardWidth: 460, conversationHeight: 336, customHeight: false })
    expect(overlaySize(true, null, null)).toEqual({ cardWidth: 700, conversationHeight: 460, customHeight: false })
  })

  it('lets a custom width or height override just that dimension', () => {
    expect(overlaySize(false, 900, null)).toEqual({ cardWidth: 900, conversationHeight: PRESETS.narrow.conversationHeight, customHeight: false })
    expect(overlaySize(true, null, 600)).toEqual({ cardWidth: 700, conversationHeight: 600, customHeight: true })
  })

  it('keeps the default window for preset sizes and grows it for bigger cards', () => {
    expect(windowSizeFor(overlaySize(true, null, null), 1800, 1130)).toEqual({ width: BASE_WINDOW_WIDTH, height: BASE_WINDOW_HEIGHT })
    expect(windowSizeFor(overlaySize(true, 1200, 800), 1800, 1130)).toEqual({ width: 1540, height: 1060 })
  })

  it('never makes the window larger than the screen', () => {
    expect(windowSizeFor(overlaySize(true, 3000, 3000), 1800, 1130)).toEqual({ width: 1800, height: 1130 })
  })

  it('caps card width and conversation height to fit the screen', () => {
    expect(sizeLimits(1800, 1130)).toEqual({ maxCardWidth: 1768, maxConversationHeight: 870 })
  })
})
