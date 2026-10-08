/**
 * Demo scenes for screenshots of the real overlay (README, download page).
 * Only used when Clod is started with CLOD_DEMO=1 together with
 * CLOD_SNAPSHOT_DIR; the main process then fires 'clod-demo' events with a
 * scene name before each capture. Everything shown here is made up.
 */
import { useSessionStore } from './stores/sessionStore'
import { useThemeStore } from './theme'
import type { Message, TabState } from '../shared/types'

let n = 0
const msg = (role: Message['role'], content: string, extra: Partial<Message> = {}): Message =>
  ({ id: `demo-${++n}`, role, content, timestamp: Date.now(), ...extra })

const DOWNLOADS = '/Users/sam/Downloads'

function tab(id: string, title: string, overrides: Partial<TabState> = {}): TabState {
  return {
    id, claudeSessionId: null, status: 'idle', activeRequestId: null, hasUnread: false, currentActivity: '',
    permissionQueue: [], permissionDenied: null, attachments: [], messages: [], title, lastResult: null,
    sessionModel: null, sessionTools: [], sessionMcpServers: [], sessionSkills: [], sessionVersion: null,
    queuedPrompts: [], pendingShellOutputs: [], workingDirectory: DOWNLOADS, hasChosenDirectory: true,
    additionalDirs: [], ...overrides,
  }
}

const ASK = 'Sort my Downloads into folders for documents, images and installers, and get rid of any duplicates'

const tools: Message[] = [
  msg('tool', '', { toolName: 'Bash', toolInput: '{"command":"ls -la ~/Downloads"}', toolStatus: 'completed' }),
  msg('tool', '', { toolName: 'Bash', toolInput: '{"command":"mkdir -p Documents Images Installers"}', toolStatus: 'completed' }),
  msg('tool', '', { toolName: 'Bash', toolInput: '{"command":"mv *.pdf *.xlsx *.docx Documents/"}', toolStatus: 'completed' }),
]

const REPLY = `Done. I sorted 46 files into three folders:

- **Documents**: 18 PDFs, spreadsheets and Word files
- **Images**: 21 photos and screenshots
- **Installers**: 7 \`.dmg\` files

I found 4 duplicates (same name and size) and moved them to the Bin rather than deleting them, so you can still get them back.`

const others = [
  tab('demo-b', 'Holiday budget'),
  tab('demo-c', 'Explain this error'),
]

const SCENES: Record<string, () => void> = {
  reply: () => {
    useSessionStore.setState({
      tabs: [tab('demo-a', 'Tidy up Downloads', { messages: [msg('user', ASK), ...tools, msg('assistant', REPLY)] }), ...others],
      activeTabId: 'demo-a',
      isExpanded: true,
    })
  },
  permission: () => {
    useSessionStore.setState({
      tabs: [tab('demo-a', 'Tidy up Downloads', {
        status: 'running',
        currentActivity: 'Waiting for permission: Bash',
        messages: [msg('user', ASK), ...tools],
        permissionQueue: [{
          questionId: 'demo-q',
          toolTitle: 'Bash',
          toolDescription: 'Move 4 duplicate files to the Bin',
          toolInput: { command: 'mv "invoice (1).pdf" "IMG_2041 (1).jpg" "IMG_2042 (1).jpg" "Zoom (1).dmg" ~/.Trash/' },
          options: [
            { optionId: 'allow', kind: 'allow', label: 'Allow' },
            { optionId: 'deny', kind: 'deny', label: 'Deny' },
          ],
        }],
      }), ...others],
      activeTabId: 'demo-a',
      isExpanded: true,
    })
  },
  closed: () => {
    useSessionStore.setState({ tabs: [tab('demo-a', 'Tidy up Downloads'), ...others], activeTabId: 'demo-a', isExpanded: false })
  },
}

// Film mode (scripts/film): the film set drives the real interface through
// the stores directly. Only exposed when the page is loaded with ?film.
if (typeof location !== 'undefined' && new URLSearchParams(location.search).has('film')) {
  ;(window as unknown as Record<string, unknown>).__clod = { useSessionStore, useThemeStore }
}

/** Listen for demo scenes. Never persists anything: setState bypasses the stores' save paths. */
export function listenForDemoScenes(): () => void {
  const onScene = (e: Event) => {
    const scene = SCENES[(e as CustomEvent<string>).detail]
    if (!scene) return
    // The default placeholder rather than whatever this Mac has set.
    useThemeStore.setState({ inputPlaceholder: '' })
    scene()
  }
  window.addEventListener('clod-demo', onScene)
  return () => window.removeEventListener('clod-demo', onScene)
}
