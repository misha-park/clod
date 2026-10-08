/**
 * Plain-English versions of the errors a new user is most likely to hit:
 * no internet, Claude Code missing, not signed in, an expired sign-in, no paid
 * plan, or an API account out of credit. Anything else is shown as Claude Code reported it.
 */

export type ErrorAction = 'setup' | 'account'

export interface ExplainedError {
  text: string
  /** Button under the message: open setup, or Settings → Account */
  action: ErrorAction | null
}

const RULES: Array<{ test: RegExp; text: string; action: ErrorAction | null }> = [
  {
    test: /ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|getaddrinfo|fetch failed|connection error|network (error|request failed)|socket hang up|unable to connect/i,
    text: "Clod couldn't reach Claude. Check your internet connection, then press Retry.",
    action: null,
  },
  {
    test: /spawn \S*claude ENOENT|claude: command not found|ENOENT.*claude/i,
    text: "Claude Code isn't installed on this Mac. Clod needs it to answer you. Setup installs it in about a minute.",
    action: 'setup',
  },
  {
    test: /credit balance is too low|insufficient.?credit/i,
    text: 'Your Anthropic API account is out of credit. Add credit at console.anthropic.com, then try again.',
    action: null,
  },
  {
    test: /(claude|your|active|paid) subscription|not available (on|for) your plan|requires a (paid|pro|max)|upgrade your plan/i,
    text: "This Claude account doesn't have a paid plan. Claude Code needs Pro, Max, Team or Enterprise, or you can sign in with an API account instead.",
    action: 'account',
  },
  {
    test: /token (has )?expired|expired (token|oauth)|session expired|re-?authenticate/i,
    text: 'Your Claude sign-in has expired. Sign in again to carry on.',
    action: 'account',
  },
  {
    test: /not logged in|please run \/login|invalid api key|invalid x-api-key|authentication_error|\b401\b/i,
    text: "Clod isn't signed in to Claude. Sign in to carry on.",
    action: 'account',
  },
]

/** Errors that point at a bug in Clod itself (rather than Claude, the network or the account). */
export function looksLikeClodBug(raw: string): boolean {
  return /Error invoking remote method|does not exist|is not a function|Cannot read propert|undefined is not|is not defined|Maximum call stack/i.test(raw)
}

/** A friendlier message for a known problem, or null to show the raw error. */
export function explainError(raw: string): ExplainedError | null {
  for (const rule of RULES) {
    if (rule.test.test(raw)) return { text: rule.text, action: rule.action }
  }
  return null
}
