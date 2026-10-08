/**
 * Film mode: plays a scripted demo in the real Clod window, for screen
 * recordings (see scripts/film/live). Started with CLOD_FILM=1, which loads
 * the overlay with ?film. Nothing is sent to Claude: the conversation is made
 * up, and the file moves are real but only inside the demo folder
 * (CLOD_FILM_DIR), so they show up in a Finder window being recorded.
 *
 * The demo starts the first time Clod is shown (double-tap Option). It pauses
 * at the permission card until you click Allow (or after 20 seconds).
 */
import { useSessionStore } from './stores/sessionStore'
import { useThemeStore } from './theme'
import type { Message, TabState } from '../shared/types'

const params = new URLSearchParams(location.search)
export const isFilm = params.has('film')
const DIR = params.get('dir') || ''

const PROMPT = 'Sort my Downloads into folders and bin any duplicates'
const REPLY = `Done. I sorted 9 files into three new folders:

- **Documents**: 4 PDFs, spreadsheets and Word files
- **Images**: 3 photos and screenshots
- **Installers**: 2 \`.dmg\` files

I moved the 4 duplicates to the Bin rather than deleting them, so you can still get them back.`
const DUPLICATES = ['invoice (1).pdf', 'IMG_2041 (1).jpg', 'IMG_2042 (1).jpg', 'VideoChat (1).dmg']

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
let n = 0
const msg = (role: Message['role'], content: string, extra: Partial<Message> = {}): Message =>
  ({ id: `film-${++n}`, role, content, timestamp: Date.now(), ...extra })

function makeTab(id: string, title: string): TabState {
  return {
    id, claudeSessionId: null, status: 'idle', activeRequestId: null, hasUnread: false, currentActivity: '',
    permissionQueue: [], permissionDenied: null, attachments: [], messages: [], title, lastResult: null,
    sessionModel: null, sessionTools: [], sessionMcpServers: [], sessionSkills: [], sessionVersion: null,
    queuedPrompts: [], pendingShellOutputs: [], workingDirectory: DIR || '/Users/sam/Downloads', hasChosenDirectory: true,
    additionalDirs: [],
  }
}

const store = () => useSessionStore
const editTab = (fn: (t: TabState) => Partial<TabState>) =>
  store().setState((s) => ({ tabs: s.tabs.map((t) => (t.id === 'film-a' ? { ...t, ...fn(t) } : t)) }))
const completeTools = (messages: Message[]) => messages.map((m) => (m.role === 'tool' ? { ...m, toolStatus: 'completed' as const } : m))

/** Show a tool step in Clod and, if given, really run a command in the demo folder. */
async function step(shown: string, activity: string, run?: string): Promise<void> {
  editTab((t) => ({
    currentActivity: activity,
    messages: [...completeTools(t.messages), msg('tool', '', { toolName: 'Bash', toolInput: JSON.stringify({ command: shown }), toolStatus: 'running' })],
  }))
  if (run && DIR) await window.clod.runShell(run, DIR).catch(() => null)
}

function typeInto(text: string): void {
  const ta = document.querySelector('textarea')
  if (!ta) return
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(ta, text)
  ta.dispatchEvent(new Event('input', { bubbles: true }))
}

async function play(): Promise<void> {
  await wait(1100)
  document.querySelector('textarea')?.focus()
  // Type like a person: steady, with small natural variations.
  for (let i = 1; i <= PROMPT.length; i++) {
    typeInto(PROMPT.slice(0, i))
    const ch = PROMPT[i - 1]
    await wait(ch === ' ' ? 95 : 55 + ((i * 37) % 40))
  }
  await wait(650)

  typeInto('')
  store().setState({ isExpanded: true })
  editTab(() => ({ title: 'Tidy up Downloads', status: 'running', currentActivity: 'Thinking…', messages: [msg('user', PROMPT)] }))
  await wait(900)
  await step('ls -la ~/Downloads', 'Reading Downloads…')
  await wait(800)
  await step('mkdir -p Documents Images Installers', 'Making folders…', 'mkdir -p Documents Images Installers')
  await wait(800)
  await step('mv *.pdf *.xlsx *.docx Documents/', 'Moving documents…', 'mv invoice-march.pdf notes.pdf budget-2026.xlsx cover-letter.docx Documents/')
  await wait(700)
  await step('mv *.jpg *.png Images/', 'Moving images…', 'mv IMG_2041.jpg IMG_2042.jpg "Screenshot 2026-09-14.png" Images/')
  await wait(700)
  await step('mv *.dmg Installers/', 'Moving installers…', 'mv VideoChat.dmg PhotoEditor.dmg Installers/')
  await wait(800)

  editTab((t) => ({
    messages: completeTools(t.messages),
    currentActivity: 'Waiting for permission: Bash',
    permissionQueue: [{
      questionId: 'film-q', toolTitle: 'Bash', toolDescription: 'Move 4 duplicate files to the Bin',
      toolInput: { command: `mv ${DUPLICATES.map((f) => `"${f}"`).join(' ')} ~/.Trash/` },
      options: [{ optionId: 'allow', kind: 'allow', label: 'Allow' }, { optionId: 'deny', kind: 'deny', label: 'Deny' }],
    }],
  }))
  // Wait for the Allow click (the card removes itself), or carry on after 20 s.
  for (let i = 0; i < 200; i++) {
    const tab = store().getState().tabs.find((t) => t.id === 'film-a')
    if (!tab || tab.permissionQueue.length === 0) break
    await wait(100)
  }
  editTab(() => ({ permissionQueue: [] }))
  await wait(350)
  // "The Bin" here is a hidden folder beside the demo folder, so the real Bin isn't touched.
  await step('mv "invoice (1).pdf" "IMG_2041 (1).jpg" … ~/.Trash/', 'Moving duplicates to the Bin…',
    `mkdir -p ../.bin && mv ${DUPLICATES.map((f) => `"${f}"`).join(' ')} ../.bin/`)
  await wait(800)

  editTab((t) => ({ currentActivity: 'Writing…', messages: [...completeTools(t.messages), msg('assistant', '', { id: 'film-reply' })] }))
  const started = Date.now(), duration = 2600
  for (;;) {
    const p = Math.min(1, (Date.now() - started) / duration)
    const text = REPLY.slice(0, Math.floor(p * REPLY.length))
    editTab((t) => ({ messages: t.messages.map((m) => (m.id === 'film-reply' ? { ...m, content: text } : m)) }))
    if (p >= 1) break
    await wait(40)
  }
  await wait(300)
  editTab(() => ({ status: 'completed', currentActivity: '' }))
}

/** Set the stage at launch, then play the demo the first time Clod is shown. */
export function startFilm(): () => void {
  if (!isFilm) return () => {}
  // Clean, made-up state. setState (not the setters) so none of this is saved.
  const prepare = () => {
    useThemeStore.setState({ inputPlaceholder: '', expandedUI: true, overlayWidth: null, overlayHeight: null })
    store().setState({ tabs: [makeTab('film-a', 'New Tab'), makeTab('film-b', 'Holiday budget'), makeTab('film-c', 'Explain this error')], activeTabId: 'film-a', isExpanded: false })
  }
  // After the app's own start-up (restoring tabs etc.) has finished.
  const timer = setTimeout(prepare, 1500)
  let played = false
  const off = window.clod.onWindowShown(() => {
    if (played) return
    played = true
    prepare()
    play().catch((err) => console.error('[film]', err))
  })
  return () => { clearTimeout(timer); off() }
}
