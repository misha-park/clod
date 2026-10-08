/**
 * Problem reports. "Report a problem" (Settings → Help, or the prompt Clod
 * shows after something goes wrong) opens a pre-filled GitHub issue, or, for
 * people without a GitHub account, Clod's report page (docs/report.html on the
 * download site), which sends it through Formspree. Nothing is sent
 * automatically: the person sees the report and sends it themselves.
 */
import { app, clipboard, dialog, shell } from 'electron'
import { getSettings } from './settings-file'
import { log as _log } from './logger'
import { fitReport } from '../shared/report-format'

function log(msg: string): void {
  _log('report', msg)
}

const ISSUES_URL = 'https://github.com/misha-park/clod/issues/new'
/** The report form for people without GitHub (empty = GitHub only). */
const REPORT_PAGE = 'https://misha-park.github.io/clod/report.html'

/** Long links get cut off by browsers and mail apps; stay well under that. */
const MAX_GITHUB_BODY = 6000
const MAX_PAGE_REPORT = 6000

/** Offer a report at most this often, so one fault doesn't nag repeatedly. */
const PROMPT_EVERY_MS = 10 * 60 * 1000

let describeSetup: () => string = () => ''
let readLog: () => string = () => ''
let onPrompt: (summary: string) => void = () => {}
const recent: Array<{ at: Date; summary: string }> = []
let lastPrompt = 0

/** Wire up where the setup summary and log come from, and how to show a prompt. */
export function configureReports(opts: { describeSetup: () => string; readLog: () => string; onPrompt: (summary: string) => void }): void {
  describeSetup = opts.describeSetup
  readLog = opts.readLog
  onPrompt = opts.onPrompt
}

/** Record a problem so it's included in the next report. */
export function noteProblem(summary: string): void {
  log(`Problem: ${summary}`)
  recent.push({ at: new Date(), summary: summary.slice(0, 300) })
  if (recent.length > 10) recent.shift()
}

/** Record a problem and, unless turned off or shown recently, offer to report it. */
export function problemDetected(summary: string): void {
  noteProblem(summary)
  if (getSettings().reportPrompts === false) return
  if (Date.now() - lastPrompt < PROMPT_EVERY_MS) return
  lastPrompt = Date.now()
  onPrompt(summary)
}

const scrubEmails = (text: string) => text.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '<email>')

/** Everything useful for a bug report, with email addresses removed. */
export function buildReport(): string {
  const problems = recent.length
    ? recent.map((p) => `- ${p.at.toISOString()} ${p.summary}`).join('\n')
    : '- none recorded'
  return scrubEmails([describeSetup(), '', 'Recent problems:', problems, '', '--- Recent log ---', readLog()].join('\n'))
}

function githubUrl(summary: string | undefined, report: string): string {
  const title = summary ? `Problem: ${summary.slice(0, 80)}` : 'Problem report'
  const intro = 'What happened? What were you doing when it went wrong?\n\n\n\n'
  const details = (text: string) => `${intro}<details><summary>Debug info</summary>\n\n\`\`\`\n${text}\n\`\`\`\n</details>\n`
  const body = details(fitReport(report, MAX_GITHUB_BODY))
  return `${ISSUES_URL}?title=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`
}

/** The report page, with the summary and details after '#' (never sent to a server by the browser). */
function reportPageUrl(summary: string | undefined, report: string): string {
  const data = JSON.stringify({ summary: summary ?? '', details: fitReport(report, MAX_PAGE_REPORT), version: app.getVersion() })
  return `${REPORT_PAGE}#${encodeURIComponent(data)}`
}

/**
 * Ask how to send the report, then open it. The full report also goes on the
 * clipboard, since links can only carry part of the log.
 */
export async function reportProblem(summary?: string): Promise<void> {
  const report = buildReport()
  clipboard.writeText(report)
  const buttons = ['Report on GitHub', ...(REPORT_PAGE ? ['Send without GitHub'] : []), 'Cancel']
  app.focus({ steal: true }) // Clod has no Dock icon; bring the question to the front
  const { response } = await dialog.showMessageBox({
    type: 'info',
    message: 'Report a problem',
    detail: 'Clod opens a report with details about your setup and what happened recently. The details are also on your clipboard. ' +
      'Read them before sending: they can mention folder and file names.' +
      (REPORT_PAGE ? '\n\nReporting on GitHub needs a free GitHub account. If you don\'t have one, choose Send without GitHub.' : ''),
    buttons,
    defaultId: 0,
    cancelId: buttons.length - 1,
  })
  const choice = buttons[response]
  log(`Report: ${choice}`)
  if (choice === 'Report on GitHub') {
    await shell.openExternal(githubUrl(summary, report))
  } else if (choice === 'Send without GitHub') {
    await shell.openExternal(reportPageUrl(summary, report))
  }
}
