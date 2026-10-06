import { app, BrowserWindow, ipcMain, dialog, screen, globalShortcut, Tray, Menu, nativeImage, nativeTheme, shell, systemPreferences, session, clipboard } from 'electron'
import { join } from 'path'
import { existsSync, readdirSync, statSync, createReadStream, mkdirSync, unlinkSync } from 'fs'
import { createInterface } from 'readline'
import { homedir } from 'os'
import { ControlPlane } from './claude/control-plane'
import { ensureSkills, type SkillStatus } from './skills/installer'
import { fetchCatalog, listInstalled, installPlugin, uninstallPlugin } from './marketplace/catalog'
import { log as _log, flushLogs } from './logger'
import { getCliEnv } from './cli-env'
import { IPC } from '../shared/types'
import type { RunOptions, NormalizedEvent, EnrichedError } from '../shared/types'
import { registerOptionDoubleTap, stopOptionDoubleTap } from './option-double-tap'
import { getSettings, saveSettings, watchSettings, publishState, settingsFileExisted } from './settings-file'

const DEBUG_MODE = process.env.CLOD_DEBUG === '1'
const SPACES_DEBUG = DEBUG_MODE || process.env.CLOD_SPACES_DEBUG === '1'

function getContentSecurityPolicy(): string {
  const isDev = !!process.env.ELECTRON_RENDERER_URL
  const connectSrc = isDev
    ? "connect-src 'self' ws://localhost:* http://localhost:*;"
    : "connect-src 'self';"
  const scriptSrc = isDev
    ? "script-src 'self' 'unsafe-inline' 'unsafe-eval';"
    : "script-src 'self';"

  return [
    "default-src 'none'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' data: blob:",
    "font-src 'self'",
    connectSrc,
    "object-src 'none'",
    "base-uri 'none'",
    "frame-src 'none'",
  ].join('; ')
}

function installContentSecurityPolicy(): void {
  const csp = getContentSecurityPolicy()
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    })
  })
}

function log(msg: string): void {
  _log('main', msg)
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let screenshotCounter = 0
let toggleSequence = 0
let lastWindowBounds: Electron.Rectangle | null = null

const controlPlane = new ControlPlane()

// Keep native width fixed to avoid renderer animation vs setBounds race.
// The UI itself still launches in compact mode; extra width is transparent/click-through.
const BAR_WIDTH = 1040
const PILL_HEIGHT = 720  // Fixed native window height — extra room for expanded UI + shadow buffers
const PILL_BOTTOM_MARGIN = 24

// Horizontal placement of the overlay. 'center' = bottom-center (default),
// 'right' = window pinned to the screen's right edge (renderer right-aligns content).
type WindowPosition = 'center' | 'right'
let windowPosition: WindowPosition = 'center'

// Overlay toggle hotkey. 'double-option' = double-tap Option (default, via uiohook).
// 'accelerator' = a custom Electron global shortcut. Cmd+Shift+K is always a fallback.
type HotkeyMode = 'double-option' | 'accelerator'
let hotkeyMode: HotkeyMode = 'double-option'
let registeredAccelerator: string | null = null

/** X coordinate for the window given the current position preference. */
function computeWindowX(dx: number, sw: number): number {
  if (windowPosition === 'right') return dx + sw - BAR_WIDTH
  return dx + Math.round((sw - BAR_WIDTH) / 2)
}

// ─── Broadcast to renderer ───

function broadcast(channel: string, ...args: unknown[]): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

function snapshotWindowState(reason: string): void {
  if (!SPACES_DEBUG) return
  if (!mainWindow || mainWindow.isDestroyed()) {
    log(`[spaces] ${reason} window=none`)
    return
  }

  const b = mainWindow.getBounds()
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const visibleOnAll = mainWindow.isVisibleOnAllWorkspaces()
  const wcFocused = mainWindow.webContents.isFocused()

  log(
    `[spaces] ${reason} ` +
    `vis=${mainWindow.isVisible()} focused=${mainWindow.isFocused()} wcFocused=${wcFocused} ` +
    `alwaysOnTop=${mainWindow.isAlwaysOnTop()} allWs=${visibleOnAll} ` +
    `bounds=(${b.x},${b.y},${b.width}x${b.height}) ` +
    `cursor=(${cursor.x},${cursor.y}) display=${display.id} ` +
    `workArea=(${display.workArea.x},${display.workArea.y},${display.workArea.width}x${display.workArea.height})`
  )
}

function scheduleToggleSnapshots(toggleId: number, phase: 'show' | 'hide'): void {
  if (!SPACES_DEBUG) return
  const probes = [0, 100, 400, 1200]
  for (const delay of probes) {
    setTimeout(() => {
      snapshotWindowState(`toggle#${toggleId} ${phase} +${delay}ms`)
    }, delay)
  }
}


// ─── Wire ControlPlane events → renderer ───

controlPlane.on('event', (tabId: string, event: NormalizedEvent) => {
  broadcast('clod:normalized-event', tabId, event)
})

controlPlane.on('tab-status-change', (tabId: string, newStatus: string, oldStatus: string) => {
  broadcast('clod:tab-status-change', tabId, newStatus, oldStatus)
})

controlPlane.on('error', (tabId: string, error: EnrichedError) => {
  broadcast('clod:enriched-error', tabId, error)
})

// ─── Window Creation ───

function createWindow(): void {
  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { width: screenWidth, height: screenHeight } = display.workAreaSize
  const { x: dx, y: dy } = display.workArea

  const x = computeWindowX(dx, screenWidth)
  const y = dy + screenHeight - PILL_HEIGHT - PILL_BOTTOM_MARGIN

  mainWindow = new BrowserWindow({
    width: BAR_WIDTH,
    height: PILL_HEIGHT,
    x,
    y,
    ...(process.platform === 'darwin' ? { type: 'panel' as const } : {}),  // NSPanel — non-activating, joins all spaces
    frame: false,
    transparent: true,
    resizable: false,
    movable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    roundedCorners: true,
    backgroundColor: '#00000000',
    show: false,
    icon: join(__dirname, '../../resources/icon.icns'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
    },
  })
  lastWindowBounds = mainWindow.getBounds()

  // Belt-and-suspenders: panel already joins all spaces and floats,
  // but explicit flags ensure correct behavior on older Electron builds.
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  // 'floating', not 'screen-saver': macOS does not deliver drag-and-drop to
  // windows at screen-saver level, which broke dropping folders onto Clod.
  // The panel's all-spaces/full-screen behaviour keeps it above full-screen apps.
  mainWindow.setAlwaysOnTop(true, 'floating')
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  mainWindow.webContents.on('will-navigate', (event) => {
    event.preventDefault()
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    // Enable OS-level click-through for transparent regions.
    // { forward: true } ensures mousemove events still reach the renderer
    // so it can toggle click-through off when cursor enters interactive UI.
    mainWindow?.setIgnoreMouseEvents(true, { forward: true })
    if (process.env.ELECTRON_RENDERER_URL) {
      mainWindow?.webContents.openDevTools({ mode: 'detach' })
    }
  })

  let forceQuit = false
  app.on('before-quit', () => { forceQuit = true })
  mainWindow.on('close', (e) => {
    if (!forceQuit) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  startCursorTracking()
  watchSettings((settings) => {
    log('Settings changed externally — applying')
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(IPC.SETTINGS_CHANGED, settings)
  })
  // Keep the Accessibility status shown in the settings app current
  // (publishState only writes when the value actually changes).
  setInterval(() => {
    if (process.platform !== 'darwin') return
    publishState({ accessibilityGranted: systemPreferences.isTrustedAccessibilityClient(false) })
  }, 3000)
}

// Click-through is normally toggled from forwarded mousemove events, but macOS
// sends none while the user drags something (e.g. a folder from Finder), so the
// overlay would stay click-through and never receive the drop. Report the cursor
// position whenever it is over the window so the renderer can run the same
// hit-test it uses for mousemove. Only sends when the cursor actually moves.
let cursorTimer: ReturnType<typeof setInterval> | null = null
function startCursorTracking(): void {
  if (cursorTimer) return
  let last: string | null = null
  cursorTimer = setInterval(() => {
    if (!mainWindow || mainWindow.isDestroyed() || !mainWindow.isVisible()) return
    const p = screen.getCursorScreenPoint()
    const b = mainWindow.getBounds()
    const inside = p.x >= b.x && p.x < b.x + b.width && p.y >= b.y && p.y < b.y + b.height
    const key = inside ? `${p.x - b.x},${p.y - b.y}` : 'out'
    if (key === last) return
    last = key
    mainWindow.webContents.send(IPC.CURSOR_POINT, inside ? { x: p.x - b.x, y: p.y - b.y } : null)
  }, 50)
}

function showWindow(source = 'unknown'): void {
  if (!mainWindow) return
  const toggleId = ++toggleSequence

  if (lastWindowBounds) {
    mainWindow.setBounds(lastWindowBounds)
  }

  // Always re-assert space membership — the flag can be lost after hide/show cycles
  // and must be set before show() so the window joins the active Space, not its
  // last-known Space.
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

  if (SPACES_DEBUG) {
    const b = mainWindow.getBounds()
    log(`[spaces] showWindow#${toggleId} source=${source} preserve-bounds=(${b.x},${b.y},${b.width}x${b.height})`)
    snapshotWindowState(`showWindow#${toggleId} pre-show`)
  }
  // As an accessory app (app.dock.hide), show() + focus gives keyboard
  // without deactivating the active app — hover preserved everywhere.
  mainWindow.show()
  if (lastWindowBounds) {
    mainWindow.setBounds(lastWindowBounds)
  }
  mainWindow.webContents.focus()
  broadcast(IPC.WINDOW_SHOWN)
  if (SPACES_DEBUG) scheduleToggleSnapshots(toggleId, 'show')
}

function resetWindowPosition(): void {
  if (!mainWindow) return

  const cursor = screen.getCursorScreenPoint()
  const display = screen.getDisplayNearestPoint(cursor)
  const { width: sw, height: sh } = display.workAreaSize
  const { x: dx, y: dy } = display.workArea

  mainWindow.setBounds({
    x: computeWindowX(dx, sw),
    y: dy + sh - PILL_HEIGHT - PILL_BOTTOM_MARGIN,
    width: BAR_WIDTH,
    height: PILL_HEIGHT,
  })
  lastWindowBounds = mainWindow.getBounds()
}

function toggleWindow(source = 'unknown'): void {
  if (!mainWindow) return
  const toggleId = ++toggleSequence
  if (SPACES_DEBUG) {
    log(`[spaces] toggle#${toggleId} source=${source} start`)
    snapshotWindowState(`toggle#${toggleId} pre`)
  }

  if (mainWindow.isVisible()) {
    mainWindow.hide()
    if (SPACES_DEBUG) scheduleToggleSnapshots(toggleId, 'hide')
  } else {
    showWindow(source)
  }
}

ipcMain.on(IPC.HIDE_WINDOW, () => {
  mainWindow?.hide()
})

ipcMain.handle(IPC.IS_VISIBLE, () => {
  return mainWindow?.isVisible() ?? false
})

// ─── Settings ───
// The renderer loads settings synchronously at startup (its stores initialise
// at module load), then saves partial updates. `existed` tells it whether to
// migrate values it previously kept in localStorage.
ipcMain.on(IPC.SETTINGS_GET_SYNC, (event) => {
  event.returnValue = { settings: getSettings(), existed: settingsFileExisted }
})
ipcMain.on(IPC.SETTINGS_SAVE, (_e, partial: Record<string, unknown>) => {
  if (partial && typeof partial === 'object') saveSettings(partial)
})
ipcMain.on(IPC.PUBLISH_STATE, (_e, partial: Record<string, unknown>) => {
  if (partial && typeof partial === 'object') publishState(partial)
})
ipcMain.on(IPC.OPEN_SETTINGS, () => openSettingsApp())

/** Path of the bundled native settings app (or the local build in dev). */
function settingsAppPath(): string {
  return app.isPackaged
    ? join(process.resourcesPath, '..', 'Helpers', 'Clod Settings.app')
    : join(app.getAppPath(), 'dist-native', 'Clod Settings.app')
}

function openSettingsApp(): void {
  // Refresh what only Clod knows before the settings app reads it.
  publishState({
    accessibilityGranted: process.platform === 'darwin'
      ? systemPreferences.isTrustedAccessibilityClient(false) : true,
    defaultDir: join(homedir(), 'Documents', 'clod-scratch'),
  })
  const path = settingsAppPath()
  if (!existsSync(path)) {
    log(`Settings app not found at ${path}`)
    dialog.showErrorBox('Clod Settings not found',
      `The settings app is missing:\n${path}\n\nReinstall Clod with install-app.command.`)
    return
  }
  // `open` reuses a running instance, bringing its window to the front.
  const { spawn } = require('child_process')
  spawn('/usr/bin/open', [path], { stdio: 'ignore', detached: true }).unref()
  log(`Opened settings app: ${path}`)
}

// OS-level click-through toggle — renderer calls this on mousemove
// to enable clicks on interactive UI while passing through transparent areas
ipcMain.on(IPC.SET_IGNORE_MOUSE_EVENTS, (event, ignore: boolean, options?: { forward?: boolean }) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) {
    win.setIgnoreMouseEvents(ignore, options || {})
  }
})

// Manual window drag — works reliably with frameless + setIgnoreMouseEvents
ipcMain.on(IPC.START_WINDOW_DRAG, (event, deltaX: number, deltaY: number) => {
  const win = BrowserWindow.fromWebContents(event.sender)
  if (win && !win.isDestroyed()) {
    const [x, y] = win.getPosition()
    // Vertical is handled in two phases in the renderer: window first (until macOS clamps),
    // then CSS translateY within the window — so deltaY here is always within allowed range
    win.setPosition(Math.round(x + deltaX), Math.round(y + deltaY))
    lastWindowBounds = win.getBounds()
  }
})

ipcMain.on(IPC.RESET_WINDOW_POSITION, () => {
  resetWindowPosition()
})

ipcMain.on(IPC.SET_WINDOW_POSITION, (_event, pos: string) => {
  if (pos !== 'center' && pos !== 'right') {
    log(`IPC SET_WINDOW_POSITION: invalid pos "${pos}" — ignoring`)
    return
  }
  log(`IPC SET_WINDOW_POSITION: ${pos}`)
  windowPosition = pos
  resetWindowPosition() // re-place the window with the new horizontal anchor
})

// Configure the overlay toggle hotkey. Double-tap Option is handled by the always-on
// uiohook callback (gated on hotkeyMode); a custom accelerator uses globalShortcut.
function configureHotkey(mode: HotkeyMode, accelerator: string): void {
  hotkeyMode = mode
  if (registeredAccelerator) {
    try { globalShortcut.unregister(registeredAccelerator) } catch {}
    registeredAccelerator = null
  }
  if (mode === 'accelerator' && accelerator && accelerator !== 'CommandOrControl+Shift+K') {
    try {
      const ok = globalShortcut.register(accelerator, () => toggleWindow(`shortcut ${accelerator}`))
      if (ok) {
        registeredAccelerator = accelerator
        log(`Hotkey: registered custom accelerator "${accelerator}"`)
      } else {
        log(`Hotkey: failed to register "${accelerator}" (already in use?)`)
      }
    } catch (err: any) {
      log(`Hotkey: invalid accelerator "${accelerator}" — ${err.message}`)
    }
  }
}

ipcMain.on(IPC.SET_HOTKEY, (_event, mode: string, accelerator: string) => {
  const m: HotkeyMode = mode === 'accelerator' ? 'accelerator' : 'double-option'
  log(`IPC SET_HOTKEY: mode=${m} accel=${accelerator || '(none)'}`)
  configureHotkey(m, typeof accelerator === 'string' ? accelerator : '')
})

ipcMain.on(IPC.COPY_TO_CLIPBOARD, (_event, text: string) => {
  if (typeof text === 'string') clipboard.writeText(text)
})

ipcMain.on(IPC.SET_OPEN_AT_LOGIN, (_event, enabled: boolean) => {
  try {
    app.setLoginItemSettings({ openAtLogin: !!enabled })
    log(`Open at login: ${enabled ? 'enabled' : 'disabled'}`)
  } catch (err: any) {
    log(`Open at login: failed — ${err.message}`)
  }
})

// ─── IPC Handlers (typed, strict) ───

ipcMain.handle(IPC.START, async () => {
  log('IPC START — fetching static CLI info')
  // Run the CLI queries asynchronously and in parallel: synchronous calls here
  // froze the main process (and so the overlay) at every launch.
  const { execFile } = require('child_process')
  const runCli = (args: string[]): Promise<string> => new Promise((resolve) => {
    execFile('claude', args, { encoding: 'utf-8', timeout: 5000, env: getCliEnv() },
      (err: Error | null, stdout: string) => resolve(err ? '' : String(stdout).trim()))
  })
  const [versionOut, authOut] = await Promise.all([runCli(['-v']), runCli(['auth', 'status'])])

  const version = versionOut || 'unknown'
  let auth: { email?: string; subscriptionType?: string; authMethod?: string } = {}
  try { auth = JSON.parse(authOut) } catch {}

  // Default working directory for new chats: a dedicated scratch folder so
  // quick questions never touch a real project. Created on demand (self-healing).
  const home = require('os').homedir()
  let defaultDir = join(home, 'Documents', 'clod-scratch')
  try {
    mkdirSync(defaultDir, { recursive: true })
  } catch (err: any) {
    log(`Scratch dir creation failed — falling back to home: ${err.message}`)
    defaultDir = home
  }

  return { version, auth, projectPath: process.cwd(), homePath: home, defaultDir }
})

ipcMain.handle(IPC.CREATE_TAB, () => {
  const tabId = controlPlane.createTab()
  log(`IPC CREATE_TAB → ${tabId}`)
  return { tabId }
})

ipcMain.on(IPC.RESET_TAB_SESSION, (_event, tabId: string) => {
  log(`IPC RESET_TAB_SESSION: ${tabId}`)
  controlPlane.resetTabSession(tabId)
})

ipcMain.handle(IPC.PROMPT, async (_event, { tabId, requestId, options }: { tabId: string; requestId: string; options: RunOptions }) => {
  if (DEBUG_MODE) {
    log(`IPC PROMPT: tab=${tabId} req=${requestId} prompt="${options.prompt.substring(0, 100)}"`)
  } else {
    log(`IPC PROMPT: tab=${tabId} req=${requestId}`)
  }

  if (!tabId) {
    throw new Error('No tabId provided — prompt rejected')
  }
  if (!requestId) {
    throw new Error('No requestId provided — prompt rejected')
  }

  try {
    await controlPlane.submitPrompt(tabId, requestId, options)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    log(`PROMPT error: ${msg}`)
    throw err
  }
})

ipcMain.handle(IPC.STOP_TAB, (_event, tabId: string) => {
  log(`IPC STOP_TAB: ${tabId}`)
  return controlPlane.cancelTab(tabId)
})

ipcMain.handle(IPC.TAB_HEALTH, () => {
  return controlPlane.getHealth()
})

ipcMain.handle(IPC.CLOSE_TAB, (_event, tabId: string) => {
  log(`IPC CLOSE_TAB: ${tabId}`)
  controlPlane.closeTab(tabId)
})

ipcMain.on(IPC.SET_PERMISSION_MODE, (_event, mode: string) => {
  if (mode !== 'ask' && mode !== 'auto') {
    log(`IPC SET_PERMISSION_MODE: invalid mode "${mode}" — ignoring`)
    return
  }
  log(`IPC SET_PERMISSION_MODE: ${mode}`)
  controlPlane.setPermissionMode(mode)
})

ipcMain.handle(IPC.RESPOND_PERMISSION, (_event, { tabId, questionId, optionId }: { tabId: string; questionId: string; optionId: string }) => {
  log(`IPC RESPOND_PERMISSION: tab=${tabId} question=${questionId} option=${optionId}`)
  return controlPlane.respondToPermission(tabId, questionId, optionId)
})

ipcMain.handle(IPC.LIST_SESSIONS, async (_e, projectPath?: string) => {
  log(`IPC LIST_SESSIONS ${projectPath ? `(path=${projectPath})` : ''}`)
  try {
    const cwd = projectPath || process.cwd()
    // Validate projectPath — reject null bytes, newlines, non-absolute paths
    if (/[\0\r\n]/.test(cwd) || !cwd.startsWith('/')) {
      log(`LIST_SESSIONS: rejected invalid projectPath: ${cwd}`)
      return []
    }
    // Claude stores project sessions at ~/.claude/projects/<encoded-path>/
    // Path encoding: replace all '/' with '-' (leading '/' becomes leading '-')
    const encodedPath = cwd.replace(/\//g, '-')
    const sessionsDir = join(homedir(), '.claude', 'projects', encodedPath)
    if (!existsSync(sessionsDir)) {
      log(`LIST_SESSIONS: directory not found: ${sessionsDir}`)
      return []
    }
    const files = readdirSync(sessionsDir).filter((f: string) => f.endsWith('.jsonl'))

    const sessions: Array<{ sessionId: string; slug: string | null; firstMessage: string | null; lastTimestamp: string; size: number }> = []

    // UUID v4 regex — only consider files named as valid UUIDs
    const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

    for (const file of files) {
      // The filename (without .jsonl) IS the canonical resume ID for `claude --resume`
      const fileSessionId = file.replace(/\.jsonl$/, '')
      if (!UUID_RE.test(fileSessionId)) continue // skip non-UUID files

      const filePath = join(sessionsDir, file)
      const stat = statSync(filePath)
      if (stat.size < 100) continue // skip trivially small files

      // Retention: delete sessions older than 2 weeks. Note these transcripts
      // belong to the claude CLI, so this also removes them from other clients.
      const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000
      if (stat.mtimeMs < Date.now() - TWO_WEEKS_MS) {
        try { unlinkSync(filePath) } catch {}
        continue
      }

      // Read lines to extract metadata and validate transcript schema
      const meta: { validated: boolean; slug: string | null; firstMessage: string | null; lastTimestamp: string | null } = {
        validated: false, slug: null, firstMessage: null, lastTimestamp: null,
      }

      await new Promise<void>((resolve) => {
        const rl = createInterface({ input: createReadStream(filePath) })
        rl.on('line', (line: string) => {
          try {
            const obj = JSON.parse(line)
            // Validate: must have expected Claude transcript fields
            if (!meta.validated && obj.type && obj.uuid && obj.timestamp) {
              meta.validated = true
            }
            if (obj.slug && !meta.slug) meta.slug = obj.slug
            if (obj.timestamp) meta.lastTimestamp = obj.timestamp
            if (obj.type === 'user' && !meta.firstMessage) {
              const content = obj.message?.content
              if (typeof content === 'string') {
                meta.firstMessage = content.substring(0, 100)
              } else if (Array.isArray(content)) {
                const textPart = content.find((p: any) => p.type === 'text')
                meta.firstMessage = textPart?.text?.substring(0, 100) || null
              }
            }
          } catch {}
          // Read all lines to get the last timestamp
        })
        rl.on('close', () => resolve())
      })

      if (meta.validated) {
        sessions.push({
          sessionId: fileSessionId,
          slug: meta.slug,
          firstMessage: meta.firstMessage,
          lastTimestamp: meta.lastTimestamp || stat.mtime.toISOString(),
          size: stat.size,
        })
      }
    }

    // Sort by last timestamp, most recent first
    sessions.sort((a, b) => new Date(b.lastTimestamp).getTime() - new Date(a.lastTimestamp).getTime())
    return sessions.slice(0, 20) // Return top 20
  } catch (err) {
    log(`LIST_SESSIONS error: ${err}`)
    return []
  }
})

// Delete a session's JSONL file from disk
ipcMain.handle(IPC.DELETE_SESSION, (_e, arg: { sessionId: string; projectPath?: string }) => {
  const sessionId = arg?.sessionId
  const projectPath = arg?.projectPath
  log(`IPC DELETE_SESSION ${sessionId}${projectPath ? ` (path=${projectPath})` : ''}`)

  // Validate sessionId — must be a strict UUID to prevent path traversal.
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!sessionId || !UUID_RE.test(sessionId)) {
    log(`DELETE_SESSION: rejected invalid sessionId: ${sessionId}`)
    return false
  }

  try {
    const cwd = projectPath || process.cwd()
    if (/[\0\r\n]/.test(cwd) || !cwd.startsWith('/')) {
      log(`DELETE_SESSION: rejected invalid projectPath: ${cwd}`)
      return false
    }
    const encodedPath = cwd.replace(/\//g, '-')
    const filePath = join(homedir(), '.claude', 'projects', encodedPath, `${sessionId}.jsonl`)
    if (!existsSync(filePath)) return false
    unlinkSync(filePath)
    return true
  } catch (err) {
    log(`DELETE_SESSION error: ${err}`)
    return false
  }
})

// Load conversation history from a session's JSONL file
ipcMain.handle(IPC.LOAD_SESSION, async (_e, arg: { sessionId: string; projectPath?: string } | string) => {
  const sessionId = typeof arg === 'string' ? arg : arg.sessionId
  const projectPath = typeof arg === 'string' ? undefined : arg.projectPath
  log(`IPC LOAD_SESSION ${sessionId}${projectPath ? ` (path=${projectPath})` : ''}`)

  // Validate sessionId — must be strict UUID to prevent path traversal via crafted filenames
  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
  if (!UUID_RE.test(sessionId)) {
    log(`LOAD_SESSION: rejected invalid sessionId: ${sessionId}`)
    return []
  }

  try {
    const cwd = projectPath || process.cwd()
    // Validate projectPath — reject null bytes, newlines, non-absolute paths
    if (/[\0\r\n]/.test(cwd) || !cwd.startsWith('/')) {
      log(`LOAD_SESSION: rejected invalid projectPath: ${cwd}`)
      return []
    }
    const encodedPath = cwd.replace(/\//g, '-')
    const filePath = join(homedir(), '.claude', 'projects', encodedPath, `${sessionId}.jsonl`)
    if (!existsSync(filePath)) return []

    const messages: Array<{ role: string; content: string; toolName?: string; timestamp: number }> = []
    await new Promise<void>((resolve) => {
      const rl = createInterface({ input: createReadStream(filePath) })
      rl.on('line', (line: string) => {
        try {
          const obj = JSON.parse(line)
          if (obj.type === 'user') {
            const content = obj.message?.content
            let text = ''
            if (typeof content === 'string') {
              text = content
            } else if (Array.isArray(content)) {
              text = content
                .filter((b: any) => b.type === 'text')
                .map((b: any) => b.text)
                .join('\n')
            }
            if (text) {
              messages.push({ role: 'user', content: text, timestamp: new Date(obj.timestamp).getTime() })
            }
          } else if (obj.type === 'assistant') {
            const content = obj.message?.content
            if (Array.isArray(content)) {
              for (const block of content) {
                if (block.type === 'text' && block.text) {
                  messages.push({ role: 'assistant', content: block.text, timestamp: new Date(obj.timestamp).getTime() })
                } else if (block.type === 'tool_use' && block.name) {
                  messages.push({
                    role: 'tool',
                    content: '',
                    toolName: block.name,
                    timestamp: new Date(obj.timestamp).getTime(),
                  })
                }
              }
            }
          }
        } catch {}
      })
      rl.on('close', () => resolve())
    })
    return messages
  } catch (err) {
    log(`LOAD_SESSION error: ${err}`)
    return []
  }
})

ipcMain.handle(IPC.SELECT_DIRECTORY, async () => {
  if (!mainWindow) return null
  // macOS: activate app so unparented dialog appears on top (not behind other apps).
  // Unparented avoids modal dimming on the transparent overlay.
  // Activation is fine here — user is actively interacting with CLOD.
  if (process.platform === 'darwin') app.focus()
  const options: Electron.OpenDialogOptions = { properties: ['openDirectory'] }
  const result = process.platform === 'darwin'
    ? await dialog.showOpenDialog(options)
    : await dialog.showOpenDialog(mainWindow, options)
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle(IPC.OPEN_EXTERNAL, async (_event, url: string) => {
  try {
    // Parse with URL constructor to reject malformed/ambiguous payloads
    const parsed = new URL(url)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false
    if (!parsed.hostname) return false
    await shell.openExternal(parsed.href)
    return true
  } catch {
    return false
  }
})

ipcMain.handle(IPC.ATTACH_FILES, async () => {
  if (!mainWindow) return null
  // macOS: activate app so unparented dialog appears on top
  if (process.platform === 'darwin') app.focus()
  const options: Electron.OpenDialogOptions = {
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'] },
      { name: 'Code', extensions: ['ts', 'tsx', 'js', 'jsx', 'py', 'rs', 'go', 'md', 'json', 'yaml', 'toml'] },
    ],
  }
  const result = process.platform === 'darwin'
    ? await dialog.showOpenDialog(options)
    : await dialog.showOpenDialog(mainWindow, options)
  if (result.canceled || result.filePaths.length === 0) return null

  const { basename, extname } = require('path')
  const { readFileSync, statSync } = require('fs')

  const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'])
  const mimeMap: Record<string, string> = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf', '.txt': 'text/plain', '.md': 'text/markdown',
    '.json': 'application/json', '.yaml': 'text/yaml', '.toml': 'text/toml',
  }

  return result.filePaths.map((fp: string) => {
    const ext = extname(fp).toLowerCase()
    const mime = mimeMap[ext] || 'application/octet-stream'
    const stat = statSync(fp)
    let dataUrl: string | undefined

    // Generate preview data URL for images (max 2MB to keep IPC fast)
    if (IMAGE_EXTS.has(ext) && stat.size < 2 * 1024 * 1024) {
      try {
        const buf = readFileSync(fp)
        dataUrl = `data:${mime};base64,${buf.toString('base64')}`
      } catch {}
    }

    return {
      id: crypto.randomUUID(),
      type: IMAGE_EXTS.has(ext) ? 'image' : 'file',
      name: basename(fp),
      path: fp,
      mimeType: mime,
      dataUrl,
      size: stat.size,
    }
  })
})

ipcMain.handle(IPC.TAKE_SCREENSHOT, async () => {
  if (!mainWindow) return null

  if (SPACES_DEBUG) snapshotWindowState('screenshot pre-hide')
  mainWindow.hide()
  await new Promise((r) => setTimeout(r, 250))

  try {
    const { spawn } = require('child_process')
    const { join } = require('path')
    const { tmpdir } = require('os')
    const { readFileSync, existsSync } = require('fs')

    const timestamp = Date.now()
    const screenshotPath = join(tmpdir(), `clod-screenshot-${timestamp}.png`)

    // Run screencapture ASYNCHRONOUSLY (not execSync). execSync blocks Electron's
    // main run loop for the whole interactive selection, and a stalled run loop can
    // make macOS drop the crosshair's first mousedown — so only the second drag
    // registered. Spawning keeps the run loop alive during selection.
    await new Promise<void>((resolve) => {
      const proc = spawn('/usr/sbin/screencapture', ['-i', screenshotPath], { stdio: 'ignore' })
      const timer = setTimeout(() => { try { proc.kill() } catch {} resolve() }, 60000)
      proc.on('close', () => { clearTimeout(timer); resolve() })
      proc.on('error', () => { clearTimeout(timer); resolve() })
    })

    if (!existsSync(screenshotPath)) {
      log('screenshot: no file written (cancelled or capture failed)')
      return null
    }

    // Downscale large captures (macOS-native `sips`, no deps) so full-screen
    // Retina grabs fit comfortably under the inline image size cap. `-Z` only
    // shrinks (never upscales) and preserves aspect ratio. Runs async so it
    // doesn't stall the main run loop; best-effort — on failure keep the original.
    await new Promise<void>((resolve) => {
      const sips = spawn('/usr/bin/sips', ['-Z', '1568', screenshotPath], { stdio: 'ignore' })
      const timer = setTimeout(() => { try { sips.kill() } catch {} resolve() }, 5000)
      sips.on('close', () => { clearTimeout(timer); resolve() })
      sips.on('error', () => { clearTimeout(timer); resolve() })
    })

    // Return structured attachment with data URL preview
    const buf = readFileSync(screenshotPath)
    log(`screenshot: captured ${buf.length} bytes at ${screenshotPath}`)
    return {
      id: crypto.randomUUID(),
      type: 'image',
      name: `screenshot ${++screenshotCounter}.png`,
      path: screenshotPath,
      mimeType: 'image/png',
      dataUrl: `data:image/png;base64,${buf.toString('base64')}`,
      size: buf.length,
    }
  } catch {
    return null
  } finally {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.webContents.focus()
    }
    broadcast(IPC.WINDOW_SHOWN)
    if (SPACES_DEBUG) {
      log('[spaces] screenshot restore show+focus')
      snapshotWindowState('screenshot restore immediate')
      setTimeout(() => snapshotWindowState('screenshot restore +200ms'), 200)
    }
  }
})

let pasteCounter = 0
ipcMain.handle(IPC.PASTE_IMAGE, async (_event, dataUrl: string) => {
  try {
    const { writeFileSync } = require('fs')
    const { join } = require('path')
    const { tmpdir } = require('os')

    // Parse data URL: "data:image/png;base64,..."
    const match = dataUrl.match(/^data:(image\/(\w+));base64,(.+)$/)
    if (!match) return null

    const [, mimeType, ext, base64Data] = match
    const buf = Buffer.from(base64Data, 'base64')
    const timestamp = Date.now()
    const filePath = join(tmpdir(), `clod-paste-${timestamp}.${ext}`)
    writeFileSync(filePath, buf)

    return {
      id: crypto.randomUUID(),
      type: 'image',
      name: `pasted image ${++pasteCounter}.${ext}`,
      path: filePath,
      mimeType,
      dataUrl,
      size: buf.length,
    }
  } catch {
    return null
  }
})

ipcMain.handle(IPC.OPEN_IN_TERMINAL, (_event, arg: string | null | { sessionId?: string | null; projectPath?: string }) => {
  const { execFile } = require('child_process')
  const claudeBin = 'claude'

  const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

  // Support both old (string) and new ({ sessionId, projectPath }) calling convention
  let sessionId: string | null = null
  let projectPath: string = process.cwd()
  if (typeof arg === 'string') {
    sessionId = arg
  } else if (arg && typeof arg === 'object') {
    sessionId = arg.sessionId ?? null
    projectPath = arg.projectPath && arg.projectPath !== '~' ? arg.projectPath : process.cwd()
  }

  // Validate sessionId — must be a strict UUID to prevent injection into the shell command
  if (sessionId && !UUID_RE.test(sessionId)) {
    log(`OPEN_IN_TERMINAL: rejected invalid sessionId: ${sessionId}`)
    return false
  }

  // Sanitize projectPath — reject null bytes, newlines, and non-absolute paths
  if (/[\0\r\n]/.test(projectPath) || !projectPath.startsWith('/')) {
    log(`OPEN_IN_TERMINAL: rejected invalid projectPath: ${projectPath}`)
    return false
  }

  // Shell-safe single-quote escaping: replace ' with '\'' (end quote, escaped literal quote, reopen quote)
  // Single quotes block all shell expansion ($, `, \, etc.) — unlike double quotes which allow $() and backticks
  const shellSingleQuote = (s: string): string => "'" + s.replace(/'/g, "'\\''") + "'"
  // AppleScript string escaping: backslashes doubled, double quotes escaped
  const escapeAppleScript = (s: string): string => s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')

  const safeDir = escapeAppleScript(shellSingleQuote(projectPath))

  let cmd: string
  if (sessionId) {
    // sessionId is UUID-validated above, safe to embed directly
    cmd = `cd ${safeDir} && ${claudeBin} --resume ${sessionId}`
  } else {
    cmd = `cd ${safeDir} && ${claudeBin}`
  }

  const script = `tell application "Terminal"
  activate
  do script "${cmd}"
end tell`

  try {
    execFile('/usr/bin/osascript', ['-e', script], (err: Error | null) => {
      if (err) log(`Failed to open terminal: ${err.message}`)
      else log(`Opened terminal with: ${cmd}`)
    })
    return true
  } catch (err: unknown) {
    log(`Failed to open terminal: ${err}`)
    return false
  }
})

// ─── Marketplace IPC ───

ipcMain.handle(IPC.MARKETPLACE_FETCH, async (_event, { forceRefresh } = {}) => {
  log('IPC MARKETPLACE_FETCH')
  return fetchCatalog(forceRefresh)
})

ipcMain.handle(IPC.MARKETPLACE_INSTALLED, async () => {
  log('IPC MARKETPLACE_INSTALLED')
  return listInstalled()
})

ipcMain.handle(IPC.MARKETPLACE_INSTALL, async (_event, { repo, pluginName, marketplace, sourcePath, isSkillMd }: { repo: string; pluginName: string; marketplace: string; sourcePath?: string; isSkillMd?: boolean }) => {
  log(`IPC MARKETPLACE_INSTALL: ${pluginName} from ${repo} (isSkillMd=${isSkillMd})`)
  return installPlugin(repo, pluginName, marketplace, sourcePath, isSkillMd)
})

ipcMain.handle(IPC.MARKETPLACE_UNINSTALL, async (_event, { pluginName }: { pluginName: string }) => {
  log(`IPC MARKETPLACE_UNINSTALL: ${pluginName}`)
  return uninstallPlugin(pluginName)
})

// ─── Theme Detection ───

ipcMain.handle(IPC.GET_THEME, () => {
  return { isDark: nativeTheme.shouldUseDarkColors }
})

nativeTheme.on('updated', () => {
  broadcast(IPC.THEME_CHANGED, nativeTheme.shouldUseDarkColors)
})

// ─── Permission Preflight ───
// Request all required macOS permissions upfront on first launch so the user
// is never interrupted mid-session by a permission prompt.

async function requestPermissions(): Promise<void> {
  if (process.platform !== 'darwin') return

  // ── Accessibility (required by the uiohook key hook for double-tap Option) ──
  // Cmd+Shift+K is always the fallback if this is denied.
  try {
    if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(false)) {
      systemPreferences.isTrustedAccessibilityClient(true) // shows the system prompt
      log('Permission preflight: Accessibility not yet granted — prompted user')
    }
  } catch (err: any) {
    log(`Permission preflight: Accessibility check failed — ${err.message}`)
  }
  // Screen Recording: not requested upfront — macOS 15 Sequoia shows an alarming
  // "bypass private window picker" dialog. Let the OS prompt naturally if/when
  // the screenshot feature is actually used.
}

// ─── App Lifecycle ───

app.whenReady().then(async () => {
  // macOS: become an accessory app. Accessory apps can have key windows (keyboard works)
  // without deactivating the currently active app (hover preserved in browsers).
  // This is how Spotlight, Alfred, Raycast work.
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide()
  }

  // Request permissions upfront so the user is never interrupted mid-session.
  await requestPermissions()

  installContentSecurityPolicy()

  // Skill provisioning — non-blocking, streams status to renderer
  ensureSkills((status: SkillStatus) => {
    log(`Skill ${status.name}: ${status.state}${status.error ? ` — ${status.error}` : ''}`)
    broadcast(IPC.SKILL_STATUS, status)
  }).catch((err: Error) => log(`Skill provisioning error: ${err.message}`))

  createWindow()
  snapshotWindowState('after createWindow')

  if (SPACES_DEBUG) {
    mainWindow?.on('show', () => snapshotWindowState('event window show'))
    mainWindow?.on('hide', () => snapshotWindowState('event window hide'))
    mainWindow?.on('focus', () => snapshotWindowState('event window focus'))
    mainWindow?.on('blur', () => snapshotWindowState('event window blur'))
    mainWindow?.webContents.on('focus', () => snapshotWindowState('event webContents focus'))
    mainWindow?.webContents.on('blur', () => snapshotWindowState('event webContents blur'))

    app.on('browser-window-focus', () => snapshotWindowState('event app browser-window-focus'))
    app.on('browser-window-blur', () => snapshotWindowState('event app browser-window-blur'))

    screen.on('display-added', (_e, display) => {
      log(`[spaces] event display-added id=${display.id}`)
      snapshotWindowState('event display-added')
    })
    screen.on('display-removed', (_e, display) => {
      log(`[spaces] event display-removed id=${display.id}`)
      snapshotWindowState('event display-removed')
    })
    screen.on('display-metrics-changed', (_e, display, changedMetrics) => {
      log(`[spaces] event display-metrics-changed id=${display.id} changed=${changedMetrics.join(',')}`)
      snapshotWindowState('event display-metrics-changed')
    })
  }


  // Primary: double-tap Option (via global key hook — needs Accessibility permission).
  // The hook always runs but only toggles when hotkeyMode is 'double-option', so
  // switching modes at runtime needs no start/stop of the native hook.
  // Fallback: Cmd+Shift+K always works even if Accessibility is denied.
  registerOptionDoubleTap(() => { if (hotkeyMode === 'double-option') toggleWindow('double-tap Option') })
  globalShortcut.register('CommandOrControl+Shift+K', () => toggleWindow('shortcut Cmd/Ctrl+Shift+K'))

  const trayIconPath = join(__dirname, '../../resources/trayTemplate.png')
  const trayIcon = nativeImage.createFromPath(trayIconPath)
  trayIcon.setTemplateImage(true)
  tray = new Tray(trayIcon)
  tray.setToolTip('Clod — Claude Code UI')
  tray.on('click', () => toggleWindow('tray click'))
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Show Clod', click: () => showWindow('tray menu') },
      { label: 'Settings…', accelerator: 'Command+,', click: () => openSettingsApp() },
      { type: 'separator' },
      { label: 'Quit', click: () => { app.quit() } },
    ])
  )

  // app 'activate' fires when macOS brings the app to the foreground (e.g. after
  // webContents.focus() triggers applicationDidBecomeActive on some macOS versions).
  // Using showWindow here instead of toggleWindow prevents the re-entry race where
  // a summon immediately hides itself because activate fires mid-show.
  app.on('activate', () => showWindow('app activate'))
})

app.on('will-quit', () => {
  stopOptionDoubleTap()
  globalShortcut.unregisterAll()
  controlPlane.shutdown()
  flushLogs()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
