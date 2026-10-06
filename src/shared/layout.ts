/**
 * Overlay sizing shared by the main process (native window size) and the
 * renderer (card size), so both always agree.
 *
 * The card's width and its conversation height come from the narrow/wide
 * preset unless the user has resized the overlay (custom width/height). The
 * transparent native window is sized around the card with extra room for
 * popovers above it and controls that overflow to its left.
 */

export const PRESETS = {
  narrow: { cardWidth: 460, conversationHeight: 336 },
  wide: { cardWidth: 700, conversationHeight: 460 },
} as const

export const MIN_CARD_WIDTH = 360
export const MIN_CONVERSATION_HEIGHT = 140

/** Default native window size (fits either preset). */
export const BASE_WINDOW_WIDTH = 1040
export const BASE_WINDOW_HEIGHT = 720
/** Room around the card inside the window: overflowing controls / popovers. */
const WINDOW_EXTRA_WIDTH = 340
const WINDOW_EXTRA_HEIGHT = 260
/** Gap kept from the screen edges at the largest size. */
export const SCREEN_MARGIN = 16

export interface OverlaySize {
  cardWidth: number
  conversationHeight: number
  /** True when the user has set a custom height (conversation gets a fixed height). */
  customHeight: boolean
}

export function overlaySize(
  expandedUI: boolean,
  overlayWidth: number | null | undefined,
  overlayHeight: number | null | undefined,
): OverlaySize {
  const preset = expandedUI ? PRESETS.wide : PRESETS.narrow
  return {
    cardWidth: typeof overlayWidth === 'number' ? overlayWidth : preset.cardWidth,
    conversationHeight: typeof overlayHeight === 'number' ? overlayHeight : preset.conversationHeight,
    customHeight: typeof overlayHeight === 'number',
  }
}

/** Largest card width / conversation height that fit a work area of this size. */
export function sizeLimits(availWidth: number, availHeight: number): { maxCardWidth: number; maxConversationHeight: number } {
  return {
    maxCardWidth: Math.max(MIN_CARD_WIDTH, availWidth - 2 * SCREEN_MARGIN),
    maxConversationHeight: Math.max(MIN_CONVERSATION_HEIGHT, availHeight - WINDOW_EXTRA_HEIGHT),
  }
}

/** Native window size needed for a card, clamped to the work area. */
export function windowSizeFor(size: OverlaySize, availWidth: number, availHeight: number): { width: number; height: number } {
  return {
    width: Math.min(availWidth, Math.max(BASE_WINDOW_WIDTH, size.cardWidth + WINDOW_EXTRA_WIDTH)),
    height: Math.min(availHeight, Math.max(BASE_WINDOW_HEIGHT, size.conversationHeight + WINDOW_EXTRA_HEIGHT)),
  }
}
