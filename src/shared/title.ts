/** Tab titles suggested by a model (see src/main/claude/tab-title.ts). */

/** Tidy a model's reply into a tab title, or null if it isn't usable. */
export function cleanTitle(raw: string): string | null {
  const line = raw.trim().split('\n').find((l) => l.trim()) ?? ''
  const title = line
    .replace(/^(title|tab title)\s*:\s*/i, '')
    .replace(/^["'“‘`*#\s]+|["'”’`*.\s]+$/g, '')
    .trim()
  if (!title || title.length > 48 || title.split(/\s+/).length > 7) return null
  return title
}
