import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC } from '../shared/types'
import type { AppShortcutId } from '../shared/shortcuts'
import type { RunOptions, NormalizedEvent, HealthReport, EnrichedError, Attachment, SessionMeta, CatalogPlugin, SessionLoadMessage, MenuItemSpec } from '../shared/types'

export interface ClodAPI {
  // ─── Request-response (renderer → main) ───
  start(): Promise<{ version: string; auth: { email?: string; subscriptionType?: string; authMethod?: string }; projectPath: string; homePath: string; defaultDir: string }>
  createTab(): Promise<{ tabId: string }>
  prompt(tabId: string, requestId: string, options: RunOptions): Promise<void>
  stopTab(tabId: string): Promise<boolean>
  tabHealth(): Promise<HealthReport>
  closeTab(tabId: string): Promise<void>
  selectDirectory(): Promise<string | null>
  openExternal(url: string): Promise<boolean>
  openInTerminal(sessionId: string | null, projectPath?: string): Promise<boolean>
  attachFiles(): Promise<Attachment[] | null>
  takeScreenshot(): Promise<Attachment | null>
  pasteImage(dataUrl: string): Promise<Attachment | null>
  respondPermission(tabId: string, questionId: string, optionId: string): Promise<boolean>
  /** Answer a folder card: the chosen folder, or null for "not now" */
  respondFolder(questionId: string, path: string | null): Promise<boolean>
  /** Copy a conversation without the exchange after `after`; returns the copy's session id */
  deleteExchange(sessionId: string, after: string | null): Promise<string>
  /** Show a native right-click menu; resolves to the chosen item's id, or null */
  popupMenu(items: MenuItemSpec[]): Promise<string | null>
  /** A short title for a conversation from its first message and answer */
  suggestTitle(prompt: string, reply: string): Promise<string | null>
  resetTabSession(tabId: string): void
  listSessions(projectPath?: string): Promise<SessionMeta[]>
  loadSession(sessionId: string, projectPath?: string): Promise<SessionLoadMessage[]>
  deleteSession(sessionId: string, projectPath?: string): Promise<boolean>
  searchSessions(query: string, projectPath: string | null): Promise<SessionMeta[]>
  runShell(command: string, cwd: string): Promise<{ output: string; exitCode: number; truncated: boolean; timedOut: boolean }>
  setSessionMeta(sessionId: string, patch: { title?: string | null; pinned?: boolean }): Promise<boolean>
  exportSession(sessionId: string, projectPath: string, title: string): Promise<string | null>
  fetchMarketplace(forceRefresh?: boolean): Promise<{ plugins: CatalogPlugin[]; error: string | null }>
  listInstalledPlugins(): Promise<string[]>
  installPlugin(repo: string, pluginName: string, marketplace: string, sourcePath?: string, isSkillMd?: boolean): Promise<{ ok: boolean; error?: string }>
  uninstallPlugin(pluginName: string): Promise<{ ok: boolean; error?: string }>
  setPermissionMode(mode: string): void
  setHotkey(mode: 'double-option' | 'accelerator', accelerator: string): void
  copyToClipboard(text: string): void
  setOpenAtLogin(enabled: boolean): void
  getTheme(): Promise<{ isDark: boolean }>
  onThemeChange(callback: (isDark: boolean) => void): () => void
  /** Fires each time the user shows or hides Clod with the keyboard shortcut */
  onHotkeyUsed(callback: () => void): () => void
  /** ⌘T ('new') and ⌘W ('close'), caught by the main process */
  onTabShortcut(callback: (action: AppShortcutId) => void): () => void
  /** Clod noticed a problem and offers to report it */
  onProblemDetected(callback: (summary: string) => void): () => void
  /** Open the "Report a problem" choice (GitHub or email) */
  reportProblem(summary?: string): void
  /** Tell the main process about an error in the overlay; prompt = offer a report */
  rendererProblem(summary: string, prompt: boolean): void
  /** The explain-selection shortcut fired: the selected text, or null and why */
  onExplainSelection(callback: (text: string | null, reason: 'accessibility' | 'empty' | null) => void): () => void

  // ─── Window management ───
  hideWindow(): void
  isVisible(): Promise<boolean>
  /** OS-level click-through for transparent window regions */
  setIgnoreMouseEvents(ignore: boolean, options?: { forward?: boolean }): void
  /** Manual window drag for frameless windows */
  startWindowDrag(deltaX: number, deltaY: number): void
  /** Reset overlay to its default position */
  resetWindowPosition(): void
  /** Set the overlay's horizontal anchor: 'center' or 'right' */
  setWindowPosition(pos: 'center' | 'right'): void

  // ─── Event listeners (main → renderer) ───
  onEvent(callback: (tabId: string, event: NormalizedEvent) => void): () => void
  onTabStatusChange(callback: (tabId: string, newStatus: string, oldStatus: string) => void): () => void
  onError(callback: (tabId: string, error: EnrichedError) => void): () => void
  onSkillStatus(callback: (status: { name: string; state: string; error?: string; reason?: string }) => void): () => void
  onWindowShown(callback: () => void): () => void
  onCursorPoint(callback: (point: { x: number; y: number } | null) => void): () => void
  getPathForFile(file: File): string
  setWindowSize(width: number, height: number): void
  getSettingsSync(): { settings: Record<string, unknown>; existed: boolean }
  saveSettings(partial: Record<string, unknown>): void
  onSettingsChanged(callback: (settings: Record<string, unknown>) => void): () => void
  publishState(partial: Record<string, unknown>): void
  openSettings(): void
  /** Open setup ('setup') or the settings window at Account ('account') */
  openSetup(target: 'setup' | 'account'): void
}

const api: ClodAPI = {
  // ─── Request-response ───
  start: () => ipcRenderer.invoke(IPC.START),
  createTab: () => ipcRenderer.invoke(IPC.CREATE_TAB),
  prompt: (tabId, requestId, options) => ipcRenderer.invoke(IPC.PROMPT, { tabId, requestId, options }),
  stopTab: (tabId) => ipcRenderer.invoke(IPC.STOP_TAB, tabId),
  tabHealth: () => ipcRenderer.invoke(IPC.TAB_HEALTH),
  closeTab: (tabId) => ipcRenderer.invoke(IPC.CLOSE_TAB, tabId),
  selectDirectory: () => ipcRenderer.invoke(IPC.SELECT_DIRECTORY),
  openExternal: (url) => ipcRenderer.invoke(IPC.OPEN_EXTERNAL, url),
  openInTerminal: (sessionId, projectPath) => ipcRenderer.invoke(IPC.OPEN_IN_TERMINAL, { sessionId, projectPath }),
  attachFiles: () => ipcRenderer.invoke(IPC.ATTACH_FILES),
  takeScreenshot: () => ipcRenderer.invoke(IPC.TAKE_SCREENSHOT),
  pasteImage: (dataUrl) => ipcRenderer.invoke(IPC.PASTE_IMAGE, dataUrl),
  respondFolder: (questionId, path) => ipcRenderer.invoke(IPC.RESPOND_FOLDER, { questionId, path }),
  deleteExchange: (sessionId, after) => ipcRenderer.invoke(IPC.DELETE_EXCHANGE, { sessionId, after }),
  popupMenu: (items) => ipcRenderer.invoke(IPC.POPUP_MENU, items),
  suggestTitle: (prompt, reply) => ipcRenderer.invoke(IPC.SUGGEST_TITLE, { prompt, reply }),
  respondPermission: (tabId, questionId, optionId) =>
    ipcRenderer.invoke(IPC.RESPOND_PERMISSION, { tabId, questionId, optionId }),
  resetTabSession: (tabId) => ipcRenderer.send(IPC.RESET_TAB_SESSION, tabId),
  listSessions: (projectPath?: string) => ipcRenderer.invoke(IPC.LIST_SESSIONS, projectPath),
  loadSession: (sessionId: string, projectPath?: string) => ipcRenderer.invoke(IPC.LOAD_SESSION, { sessionId, projectPath }),
  deleteSession: (sessionId: string, projectPath?: string) => ipcRenderer.invoke(IPC.DELETE_SESSION, { sessionId, projectPath }),
  searchSessions: (query, projectPath) => ipcRenderer.invoke(IPC.SEARCH_SESSIONS, { query, projectPath }),
  runShell: (command, cwd) => ipcRenderer.invoke(IPC.RUN_SHELL, { command, cwd }),
  setSessionMeta: (sessionId, patch) => ipcRenderer.invoke(IPC.SET_SESSION_META, { sessionId, ...patch }),
  exportSession: (sessionId, projectPath, title) => ipcRenderer.invoke(IPC.EXPORT_SESSION, { sessionId, projectPath, title }),
  fetchMarketplace: (forceRefresh) => ipcRenderer.invoke(IPC.MARKETPLACE_FETCH, { forceRefresh }),
  listInstalledPlugins: () => ipcRenderer.invoke(IPC.MARKETPLACE_INSTALLED),
  installPlugin: (repo, pluginName, marketplace, sourcePath, isSkillMd) =>
    ipcRenderer.invoke(IPC.MARKETPLACE_INSTALL, { repo, pluginName, marketplace, sourcePath, isSkillMd }),
  uninstallPlugin: (pluginName) =>
    ipcRenderer.invoke(IPC.MARKETPLACE_UNINSTALL, { pluginName }),
  setPermissionMode: (mode) => ipcRenderer.send(IPC.SET_PERMISSION_MODE, mode),
  setHotkey: (mode, accelerator) => ipcRenderer.send(IPC.SET_HOTKEY, mode, accelerator),
  copyToClipboard: (text) => ipcRenderer.send(IPC.COPY_TO_CLIPBOARD, text),
  setOpenAtLogin: (enabled) => ipcRenderer.send(IPC.SET_OPEN_AT_LOGIN, enabled),
  getTheme: () => ipcRenderer.invoke(IPC.GET_THEME),
  onThemeChange: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, isDark: boolean) => callback(isDark)
    ipcRenderer.on(IPC.THEME_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC.THEME_CHANGED, handler)
  },
  onExplainSelection: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, text: string | null, reason: 'accessibility' | 'empty' | null) => callback(text, reason)
    ipcRenderer.on(IPC.EXPLAIN_SELECTION, handler)
    return () => ipcRenderer.removeListener(IPC.EXPLAIN_SELECTION, handler)
  },
  onProblemDetected: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, summary: string) => callback(summary)
    ipcRenderer.on(IPC.PROBLEM_DETECTED, handler)
    return () => ipcRenderer.removeListener(IPC.PROBLEM_DETECTED, handler)
  },
  reportProblem: (summary) => ipcRenderer.send(IPC.REPORT_PROBLEM, summary),
  rendererProblem: (summary, prompt) => ipcRenderer.send(IPC.RENDERER_PROBLEM, summary, prompt),
  onTabShortcut: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, action: AppShortcutId) => callback(action)
    ipcRenderer.on(IPC.TAB_SHORTCUT, handler)
    return () => ipcRenderer.removeListener(IPC.TAB_SHORTCUT, handler)
  },
  onHotkeyUsed: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC.HOTKEY_USED, handler)
    return () => ipcRenderer.removeListener(IPC.HOTKEY_USED, handler)
  },

  // ─── Window management ───
  hideWindow: () => ipcRenderer.send(IPC.HIDE_WINDOW),
  isVisible: () => ipcRenderer.invoke(IPC.IS_VISIBLE),
  setIgnoreMouseEvents: (ignore, options) =>
    ipcRenderer.send(IPC.SET_IGNORE_MOUSE_EVENTS, ignore, options || {}),
  startWindowDrag: (deltaX, deltaY) =>
    ipcRenderer.send(IPC.START_WINDOW_DRAG, deltaX, deltaY),
  resetWindowPosition: () => ipcRenderer.send(IPC.RESET_WINDOW_POSITION),
  setWindowPosition: (pos) => ipcRenderer.send(IPC.SET_WINDOW_POSITION, pos),

  // ─── Event listeners ───
  onEvent: (callback) => {
    // Single unified handler — all normalized events come through one channel
    const handler = (_e: Electron.IpcRendererEvent, tabId: string, event: NormalizedEvent) => callback(tabId, event)
    ipcRenderer.on('clod:normalized-event', handler)
    return () => ipcRenderer.removeListener('clod:normalized-event', handler)
  },

  onTabStatusChange: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, tabId: string, newStatus: string, oldStatus: string) =>
      callback(tabId, newStatus, oldStatus)
    ipcRenderer.on('clod:tab-status-change', handler)
    return () => ipcRenderer.removeListener('clod:tab-status-change', handler)
  },

  onError: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, tabId: string, error: EnrichedError) =>
      callback(tabId, error)
    ipcRenderer.on('clod:enriched-error', handler)
    return () => ipcRenderer.removeListener('clod:enriched-error', handler)
  },

  onSkillStatus: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, status: any) => callback(status)
    ipcRenderer.on(IPC.SKILL_STATUS, handler)
    return () => ipcRenderer.removeListener(IPC.SKILL_STATUS, handler)
  },

  onWindowShown: (callback) => {
    const handler = () => callback()
    ipcRenderer.on(IPC.WINDOW_SHOWN, handler)
    return () => ipcRenderer.removeListener(IPC.WINDOW_SHOWN, handler)
  },

  onCursorPoint: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, point: { x: number; y: number } | null) => callback(point)
    ipcRenderer.on(IPC.CURSOR_POINT, handler)
    return () => ipcRenderer.removeListener(IPC.CURSOR_POINT, handler)
  },

  // File.path was removed in Electron 32; this is the supported replacement.
  getPathForFile: (file) => webUtils.getPathForFile(file),

  setWindowSize: (width, height) => ipcRenderer.send(IPC.SET_WINDOW_SIZE, { width, height }),
  getSettingsSync: () => ipcRenderer.sendSync(IPC.SETTINGS_GET_SYNC),
  saveSettings: (partial) => ipcRenderer.send(IPC.SETTINGS_SAVE, partial),
  onSettingsChanged: (callback) => {
    const handler = (_e: Electron.IpcRendererEvent, settings: Record<string, unknown>) => callback(settings)
    ipcRenderer.on(IPC.SETTINGS_CHANGED, handler)
    return () => ipcRenderer.removeListener(IPC.SETTINGS_CHANGED, handler)
  },
  publishState: (partial) => ipcRenderer.send(IPC.PUBLISH_STATE, partial),
  openSettings: () => ipcRenderer.send(IPC.OPEN_SETTINGS),
  openSetup: (target) => ipcRenderer.send(IPC.OPEN_SETUP, target),
}

contextBridge.exposeInMainWorld('clod', api)
