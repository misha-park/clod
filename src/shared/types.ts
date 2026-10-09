// ─── Claude Code Stream Event Types (verified from v2.1.63) ───

export interface InitEvent {
  type: 'system'
  subtype: 'init'
  cwd: string
  session_id: string
  tools: string[]
  mcp_servers: Array<{ name: string; status: string }>
  model: string
  permissionMode: string
  agents: string[]
  skills: string[]
  plugins: string[]
  claude_code_version: string
  fast_mode_state: string
  uuid: string
}

export interface StreamEvent {
  type: 'stream_event'
  event: StreamSubEvent
  session_id: string
  parent_tool_use_id: string | null
  uuid: string
}

export type StreamSubEvent =
  | { type: 'message_start'; message: AssistantMessagePayload }
  | { type: 'content_block_start'; index: number; content_block: ContentBlock }
  | { type: 'content_block_delta'; index: number; delta: ContentDelta }
  | { type: 'content_block_stop'; index: number }
  | { type: 'message_delta'; delta: { stop_reason: string | null }; usage: UsageData; context_management?: unknown }
  | { type: 'message_stop' }

export interface ContentBlock {
  type: 'text' | 'tool_use'
  text?: string
  id?: string
  name?: string
  input?: Record<string, unknown>
}

export type ContentDelta =
  | { type: 'text_delta'; text: string }
  | { type: 'input_json_delta'; partial_json: string }

export interface AssistantEvent {
  type: 'assistant'
  message: AssistantMessagePayload
  parent_tool_use_id: string | null
  session_id: string
  uuid: string
}

export interface AssistantMessagePayload {
  model: string
  id: string
  role: 'assistant'
  content: ContentBlock[]
  stop_reason: string | null
  usage: UsageData
}

export interface RateLimitEvent {
  type: 'rate_limit_event'
  rate_limit_info: {
    status: string
    resetsAt: number
    rateLimitType: string
  }
  session_id: string
  uuid: string
}

export interface ResultEvent {
  type: 'result'
  subtype: 'success' | 'error'
  is_error: boolean
  duration_ms: number
  num_turns: number
  result: string
  total_cost_usd: number
  session_id: string
  usage: UsageData & {
    input_tokens: number
    output_tokens: number
    cache_read_input_tokens?: number
    cache_creation_input_tokens?: number
  }
  permission_denials: string[]
  uuid: string
}

export interface UsageData {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number
  cache_creation_input_tokens?: number
  service_tier?: string
}

export interface PermissionEvent {
  type: 'permission_request'
  tool: { name: string; description?: string; input?: Record<string, unknown> }
  question_id: string
  options: Array<{ id: string; label: string; kind?: string }>
  session_id: string
  uuid: string
}

// Union of all possible top-level events
export type ClaudeEvent = InitEvent | StreamEvent | AssistantEvent | RateLimitEvent | ResultEvent | PermissionEvent | UnknownEvent

export interface UnknownEvent {
  type: string
  [key: string]: unknown
}

// ─── Tab State Machine (v2 — from execution plan) ───

export type TabStatus = 'connecting' | 'idle' | 'running' | 'completed' | 'failed' | 'dead'

export interface PermissionRequest {
  questionId: string
  toolTitle: string
  toolDescription?: string
  toolInput?: Record<string, unknown>
  options: Array<{ optionId: string; kind?: string; label: string }>
}

export interface Attachment {
  id: string
  type: 'image' | 'file'
  name: string
  path: string
  mimeType?: string
  /** Base64 data URL for image previews */
  dataUrl?: string
  /** File size in bytes */
  size?: number
}

export interface TabState {
  id: string
  claudeSessionId: string | null
  status: TabStatus
  activeRequestId: string | null
  hasUnread: boolean
  currentActivity: string
  permissionQueue: PermissionRequest[]
  /** Fallback card when tools were denied and no interactive permission is available */
  permissionDenied: { tools: Array<{ toolName: string; toolUseId: string }> } | null
  attachments: Attachment[]
  messages: Message[]
  title: string
  /** Last run's result data (cost, tokens, duration) */
  lastResult: RunResult | null
  /** Session metadata from init event */
  sessionModel: string | null
  sessionTools: string[]
  sessionMcpServers: Array<{ name: string; status: string }>
  sessionSkills: string[]
  sessionVersion: string | null
  /** Prompts waiting behind the current run (display text only) */
  queuedPrompts: string[]
  /** Output of `!` commands, attached to the next message sent to Claude */
  pendingShellOutputs: string[]
  /** Working directory for this tab's Claude sessions */
  workingDirectory: string
  /** Whether the user explicitly chose a directory (vs. using default home) */
  hasChosenDirectory: boolean
  /** Extra directories accessible via --add-dir (session-preserving) */
  additionalDirs: string[]
  /** Claude is asking for a folder (the request_folder tool) */
  folderRequest?: { questionId: string; name: string; reason: string; matches: Array<{ path: string; name: string }> } | null
  /** Pinned tabs sit first and can't be closed until unpinned */
  pinned?: boolean
  /** The last assistant message of the conversation so far (its transcript id), for edits */
  lastAssistantUuid?: string | null
  /** A duplicated tab: its next message branches off into a conversation of its own */
  forkOnNextSend?: boolean
  /** The tab group this tab belongs to */
  groupId?: string
}

/** An item of a native right-click menu (see POPUP_MENU); `id` is what a click returns */
export interface MenuItemSpec {
  id?: string
  label?: string
  type?: 'separator' | 'checkbox'
  enabled?: boolean
  checked?: boolean
  submenu?: MenuItemSpec[]
}

export type TabGroupColor = 'grey' | 'blue' | 'green' | 'yellow' | 'orange' | 'red' | 'purple'

/** A named, coloured set of tabs that sit together in the tab strip. */
export interface TabGroup {
  id: string
  name: string
  color: TabGroupColor
  collapsed: boolean
  /** Pinned groups sit first, and their tabs can't be closed until the group is unpinned */
  pinned: boolean
}

export interface Message {
  id: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  toolName?: string
  toolInput?: string
  toolStatus?: 'running' | 'completed' | 'error'
  timestamp: number
  /** Output of a `!` shell command, rendered as a monospaced block */
  shell?: boolean
  /** A button under a notice: open setup, Settings → Account, or report a problem */
  action?: 'setup' | 'account' | 'report'
  /** For 'report': a one-line summary of what went wrong */
  detail?: string
  /**
   * For user messages: where the conversation stood just before this message,
   * so it can be edited and sent again. `at` is the last assistant message's
   * transcript id in `sessionId`, or null when this was the first message.
   */
  rewind?: { sessionId: string; at: string | null }
}

export interface RunResult {
  totalCostUsd: number
  durationMs: number
  numTurns: number
  usage: UsageData
  sessionId: string
}

// ─── Canonical Events (normalized from raw stream) ───

export type NormalizedEvent =
  | { type: 'session_init'; sessionId: string; tools: string[]; model: string; mcpServers: Array<{ name: string; status: string }>; skills: string[]; version: string }
  | { type: 'text_chunk'; text: string }
  | { type: 'tool_call'; toolName: string; toolId: string; index: number }
  | { type: 'tool_call_update'; toolId: string; partialInput: string }
  | { type: 'tool_call_complete'; index: number }
  | { type: 'task_update'; message: AssistantMessagePayload; uuid?: string }
  | { type: 'task_complete'; result: string; costUsd: number; durationMs: number; numTurns: number; usage: UsageData; sessionId: string; permissionDenials?: Array<{ toolName: string; toolUseId: string }> }
  | { type: 'error'; message: string; isError: boolean; sessionId?: string }
  | { type: 'session_dead'; exitCode: number | null; signal: string | null; stderrTail: string[] }
  | { type: 'rate_limit'; status: string; resetsAt?: number; rateLimitType?: string }
  | { type: 'usage'; usage: UsageData }
  | { type: 'folder_request'; questionId: string; name: string; reason: string; matches: Array<{ path: string; name: string }> }
  | { type: 'permission_request'; questionId: string; toolName: string; toolDescription?: string; toolInput?: Record<string, unknown>; options: Array<{ id: string; label: string; kind?: string }> }

// ─── Run Options ───

/**
 * An image to embed directly (inline) in the user message as a base64 image
 * content block, so the model sees the pixels without a Read tool round-trip.
 */
export interface InlineImage {
  /** MIME type, e.g. 'image/png'. */
  mediaType: string
  /** Base64-encoded image data — NO `data:` URL prefix. */
  data: string
  /** Original file path — used for a text fallback if the image can't be inlined. */
  path?: string
  /** Display name — used in the fallback text reference. */
  name?: string
}

export interface RunOptions {
  prompt: string
  projectPath: string
  sessionId?: string
  allowedTools?: string[]
  maxTurns?: number
  maxBudgetUsd?: number
  systemPrompt?: string
  model?: string
  /** Path to CLOD-scoped settings file with hook config (passed via --settings) */
  hookSettingsPath?: string
  /** Path to the MCP config that gives the run Clod's request_folder tool (--mcp-config) */
  mcpConfigPath?: string
  /** Extra directories to add via --add-dir (session-preserving) */
  addDirs?: string[]
  /** Permission mode for this run: 'auto' bypasses all approvals at the CLI level. */
  permissionMode?: 'ask' | 'auto'
  /** Images to embed inline as image content blocks in the stream-json user message. */
  images?: InlineImage[]
  /** Edit and resend: continue `sessionId` from this message (a fork, so the original is kept) */
  resumeAt?: string
  /** Edit and resend of a first message: start a new conversation */
  newSession?: boolean
  /** Continue `sessionId` as a copy (a duplicated tab's first message) */
  fork?: boolean
}

// ─── Control Plane Types ───

export interface TabRegistryEntry {
  tabId: string
  claudeSessionId: string | null
  status: TabStatus
  activeRequestId: string | null
  runPid: number | null
  createdAt: number
  lastActivityAt: number
  promptCount: number
}

export interface HealthReport {
  tabs: Array<{
    tabId: string
    status: TabStatus
    activeRequestId: string | null
    claudeSessionId: string | null
    alive: boolean
  }>
  queueDepth: number
}

export interface EnrichedError {
  message: string
  stderrTail: string[]
  stdoutTail?: string[]
  exitCode: number | null
  elapsedMs: number
  toolCallCount: number
  sawPermissionRequest?: boolean
  permissionDenials?: Array<{ tool_name: string; tool_use_id: string }>
}

// ─── Session History ───

export interface SessionMeta {
  sessionId: string
  slug: string | null
  firstMessage: string | null
  lastTimestamp: string
  size: number
  /** Custom name set in Clod */
  title?: string | null
  pinned?: boolean
  /** Folder the session ran in (set by search, which can span folders) */
  projectPath?: string
  /** Text around a search match */
  snippet?: string | null
}

export interface SessionLoadMessage {
  role: string
  content: string
  toolName?: string
  timestamp: number
  /** Assistant messages: the transcript id */
  uuid?: string
  /** User messages: the last assistant transcript id before it (null = first message) */
  rewindAt?: string | null
}

// ─── Marketplace / Plugin Types ───

export type PluginStatus = 'not_installed' | 'checking' | 'installing' | 'installed' | 'failed'

export interface CatalogPlugin {
  id: string              // unique: `${repo}/${skillPath}` e.g. 'anthropics/skills/skills/xlsx'
  name: string            // from SKILL.md or plugin.json
  description: string     // from SKILL.md or plugin.json
  version: string         // from plugin.json or '0.0.0'
  author: string          // from plugin.json or marketplace entry
  marketplace: string     // marketplace name from marketplace.json
  repo: string            // 'anthropics/skills'
  sourcePath: string      // path within repo, e.g. 'skills/xlsx'
  installName: string     // individual skill name for SKILL.md skills, bundle name for CLI plugins
  category: string        // 'Agent Skills' | 'Knowledge Work' | 'Financial Services'
  tags: string[]          // Semantic use-case tags derived from name/description (e.g. 'Design', 'Finance')
  isSkillMd: boolean      // true = individual SKILL.md (direct install), false = CLI plugin (bundle install)
}

// ─── IPC Channel Names ───

export const IPC = {
  // Request-response (renderer → main)
  START: 'clod:start',
  CREATE_TAB: 'clod:create-tab',
  PROMPT: 'clod:prompt',
  STOP_TAB: 'clod:stop-tab',
  TAB_HEALTH: 'clod:tab-health',
  CLOSE_TAB: 'clod:close-tab',
  SELECT_DIRECTORY: 'clod:select-directory',
  OPEN_EXTERNAL: 'clod:open-external',
  OPEN_IN_TERMINAL: 'clod:open-in-terminal',
  ATTACH_FILES: 'clod:attach-files',
  TAKE_SCREENSHOT: 'clod:take-screenshot',
  PASTE_IMAGE: 'clod:paste-image',
  RESPOND_PERMISSION: 'clod:respond-permission',
  RESPOND_FOLDER: 'clod:respond-folder',
  DELETE_EXCHANGE: 'clod:delete-exchange',
  RESET_TAB_SESSION: 'clod:reset-tab-session',
  LIST_SESSIONS: 'clod:list-sessions',
  LOAD_SESSION: 'clod:load-session',
  DELETE_SESSION: 'clod:delete-session',
  SEARCH_SESSIONS: 'clod:search-sessions',
  SET_SESSION_META: 'clod:set-session-meta',
  RUN_SHELL: 'clod:run-shell',
  EXPORT_SESSION: 'clod:export-session',

  // One-way events (main → renderer)
  TEXT_CHUNK: 'clod:text-chunk',
  TOOL_CALL: 'clod:tool-call',
  TOOL_CALL_UPDATE: 'clod:tool-call-update',
  TOOL_CALL_COMPLETE: 'clod:tool-call-complete',
  TASK_UPDATE: 'clod:task-update',
  TASK_COMPLETE: 'clod:task-complete',
  SESSION_DEAD: 'clod:session-dead',
  SESSION_INIT: 'clod:session-init',
  ERROR: 'clod:error',
  RATE_LIMIT: 'clod:rate-limit',

  // Window management
  HIDE_WINDOW: 'clod:hide-window',
  WINDOW_SHOWN: 'clod:window-shown',
  SET_IGNORE_MOUSE_EVENTS: 'clod:set-ignore-mouse-events',
  CURSOR_POINT: 'clod:cursor-point',

  // Settings (shared settings.json, edited by the native settings app)
  SETTINGS_GET_SYNC: 'clod:settings-get-sync',
  SETTINGS_SAVE: 'clod:settings-save',
  SETTINGS_CHANGED: 'clod:settings-changed',
  PUBLISH_STATE: 'clod:publish-state',
  OPEN_SETTINGS: 'clod:open-settings',
  OPEN_SETUP: 'clod:open-setup',
  START_WINDOW_DRAG: 'clod:start-window-drag',
  RESET_WINDOW_POSITION: 'clod:reset-window-position',
  SET_WINDOW_POSITION: 'clod:set-window-position',
  SET_WINDOW_SIZE: 'clod:set-window-size',
  IS_VISIBLE: 'clod:is-visible',

  // Skill provisioning (main → renderer)
  SKILL_STATUS: 'clod:skill-status',
  HOTKEY_USED: 'clod:hotkey-used',
  TAB_SHORTCUT: 'clod:tab-shortcut',
  POPUP_MENU: 'clod:popup-menu',
  EXPLAIN_SELECTION: 'clod:explain-selection',
  PROBLEM_DETECTED: 'clod:problem-detected',
  REPORT_PROBLEM: 'clod:report-problem',
  RENDERER_PROBLEM: 'clod:renderer-problem',

  // Theme
  GET_THEME: 'clod:get-theme',
  THEME_CHANGED: 'clod:theme-changed',

  // Marketplace
  MARKETPLACE_FETCH: 'clod:marketplace-fetch',
  MARKETPLACE_INSTALLED: 'clod:marketplace-installed',
  MARKETPLACE_INSTALL: 'clod:marketplace-install',
  MARKETPLACE_UNINSTALL: 'clod:marketplace-uninstall',

  // Permission mode
  SET_PERMISSION_MODE: 'clod:set-permission-mode',

  // Overlay toggle hotkey (double-tap Option or a custom accelerator)
  SET_HOTKEY: 'clod:set-hotkey',

  // Write text to the system clipboard
  COPY_TO_CLIPBOARD: 'clod:copy-to-clipboard',

  // Launch Clod automatically at login
  SET_OPEN_AT_LOGIN: 'clod:set-open-at-login',

  // Accessibility permission (needed by the double-tap Option key hook)

  // Legacy (kept for backward compat during migration)
} as const
