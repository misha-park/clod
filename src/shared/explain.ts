/** Longest selection sent as-is; anything longer is cut, with a note. */
const MAX_CHARS = 20_000

/** The selection as a quote, followed by the request. */
export function explainPrompt(text: string): string {
  const trimmed = text.trim()
  const cut = trimmed.length > MAX_CHARS
  const body = (cut ? trimmed.slice(0, MAX_CHARS) : trimmed).split('\n').map((line) => `> ${line}`).join('\n')
  return `${body}${cut ? '\n\n(The selection was cut short.)' : ''}\n\nExplain this.`
}
