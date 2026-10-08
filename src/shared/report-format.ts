/** Fit a report into `max` characters (once URL-encoded), keeping the start and the newest log lines. */
export function fitReport(report: string, max: number): string {
  if (encodeURIComponent(report).length <= max) return report
  const marker = '--- Recent log ---'
  const split = report.indexOf(marker)
  const head = split >= 0 ? report.slice(0, split + marker.length) : ''
  let tail = split >= 0 ? report.slice(split + marker.length) : report
  const note = '\n(earlier log lines left out; the full report is on your clipboard)\n'
  while (tail.length > 0 && encodeURIComponent(head + note + tail).length > max) {
    tail = tail.slice(Math.ceil(tail.length * 0.15))
    tail = tail.slice(tail.indexOf('\n') + 1)
  }
  return head + note + tail
}
