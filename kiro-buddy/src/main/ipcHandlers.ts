import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFile } from 'child_process'
import { app, clipboard, ipcMain, Menu, screen } from 'electron'
import { overlayWindow } from './overlayWindow'
import { getConfig, setPetScale } from './configStore'
import { statusManager } from './statusManager'
import type { KiroBuddyDebugInfo, KiroBuddyReplyResult, StatusPayload } from '../shared/types'

const manualClosePath = path.join(os.homedir(), '.kiro-buddy', 'manual-close.json')
const lastCommandPath = path.join(os.homedir(), '.kiro-buddy', 'last-command.json')
const replyHistoryPath = path.join(os.homedir(), '.kiro-buddy', 'reply-history.json')
const MAX_REPLY_CHARS = 2000
const MAX_REPLY_HISTORY = 5
const BASE_WINDOW_WIDTH = 390
const BASE_WINDOW_HEIGHT = 360

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

function isMovePayload(payload: unknown): payload is { x: number; y: number } {
  if (payload === null || typeof payload !== 'object') {
    return false
  }

  const candidate = payload as Record<string, unknown>
  return Number.isFinite(candidate.x) && Number.isFinite(candidate.y)
}

function isReplyText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= MAX_REPLY_CHARS
}

function isPetScale(value: unknown): value is number {
  return Number.isFinite(value) && Number(value) >= 0.6 && Number(value) <= 1.4
}

function scaledWindowSize(scale: number): { width: number; height: number } {
  return {
    width: Math.round(BASE_WINDOW_WIDTH * scale),
    height: Math.round(BASE_WINDOW_HEIGHT * scale),
  }
}

function readLastSlashCommand(): Pick<KiroBuddyDebugInfo, 'lastSlashCommand' | 'lastSlashCommandAt'> {
  try {
    const parsed = JSON.parse(fs.readFileSync(lastCommandPath, 'utf8')) as Record<string, unknown>
    if (typeof parsed.command !== 'string') {
      return {}
    }

    return {
      lastSlashCommand: parsed.command,
      lastSlashCommandAt: Number.isFinite(parsed.timestamp) ? Number(parsed.timestamp) : undefined,
    }
  } catch {
    return {}
  }
}

function fallbackStatus(): StatusPayload {
  return {
    status: 'idle',
    message: 'Kiro is ready',
    timestamp: Date.now(),
  }
}

function readReplyHistory(): string[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(replyHistoryPath, 'utf8')) as unknown
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter((item): item is string => typeof item === 'string').slice(0, MAX_REPLY_HISTORY)
  } catch {
    return []
  }
}

function rememberReply(text: string): void {
  const trimmed = text.trim()
  if (!trimmed) {
    return
  }

  const history = [trimmed, ...readReplyHistory().filter((item) => item !== trimmed)].slice(
    0,
    MAX_REPLY_HISTORY,
  )
  fs.mkdirSync(path.dirname(replyHistoryPath), { recursive: true })
  fs.writeFileSync(replyHistoryPath, `${JSON.stringify(history, null, 2)}\n`, 'utf8')
}

function automationStatus(): string {
  if (process.platform !== 'darwin') {
    return 'Copy-only on this platform.'
  }

  return 'Reply may need macOS Accessibility permission for Kiro Buddy or Terminal.'
}

export function getDebugInfo(): KiroBuddyDebugInfo {
  const payload = statusManager.getCurrentStatus() ?? fallbackStatus()
  return {
    status: payload.status,
    message: payload.message,
    timestamp: payload.timestamp,
    phase: payload.phase,
    context: payload.context,
    statusFilePath: statusManager.getStatusFilePath() ?? getConfig().statusFilePath,
    replyHistory: readReplyHistory(),
    automationStatus: automationStatus(),
    ...readLastSlashCommand(),
  }
}

function copyReplyToClipboard(text: string): KiroBuddyReplyResult {
  if (!isReplyText(text)) {
    return { ok: false, message: 'Type a reply first.' }
  }

  clipboard.writeText(text.trim())
  rememberReply(text)
  return { ok: true, message: 'Copied reply.' }
}

function runAppleScript(script: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', script], (error) => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

export async function sendReplyToKiro(
  text: string,
  platform: NodeJS.Platform = process.platform,
): Promise<KiroBuddyReplyResult> {
  const copied = copyReplyToClipboard(text)
  if (!copied.ok) {
    return copied
  }

  if (platform !== 'darwin') {
    return {
      ok: true,
      message: 'Copied reply. Paste it into Kiro.',
    }
  }

  try {
    await runAppleScript([
      'tell application "Kiro" to activate',
      'delay 0.15',
      'tell application "System Events" to keystroke "v" using command down',
      'tell application "System Events" to key code 36',
    ].join('\n'))
    return { ok: true, message: 'Sent reply to Kiro.' }
  } catch {
    return {
      ok: true,
      message: 'Copied reply. Enable macOS Accessibility for automation if Send cannot paste.',
    }
  }
}

export function registerIpcHandlers(): void {
  ipcMain.removeAllListeners('move-window')
  ipcMain.removeAllListeners('close-app')
  ipcMain.removeAllListeners('show-context-menu')
  ipcMain.removeHandler?.('get-debug-info')
  ipcMain.removeHandler?.('get-pet-scale')
  ipcMain.removeHandler?.('set-pet-scale')
  ipcMain.removeHandler?.('copy-reply')
  ipcMain.removeHandler?.('reply-to-kiro')

  ipcMain.on('move-window', (_event, payload: unknown) => {
    if (!isMovePayload(payload)) {
      console.warn('[IPC] Rejected invalid move-window payload')
      return
    }

    const win = overlayWindow.getWindow()
    if (!win) {
      console.warn('[IPC] move-window received before overlay exists')
      return
    }

    const config = getConfig()
    const display = screen.getDisplayMatching(win.getBounds())
    const bounds = display.workArea
    const { width: windowWidth, height: windowHeight } = scaledWindowSize(config.petScale)
    const maxX = bounds.x + bounds.width - windowWidth
    const maxY = bounds.y + bounds.height - windowHeight
    const x = clamp(Math.round(payload.x), bounds.x, maxX)
    const y = clamp(Math.round(payload.y), bounds.y, maxY)

    overlayWindow.setPosition(x, y)
  })

  ipcMain.on('close-app', () => {
    fs.mkdirSync(path.dirname(manualClosePath), { recursive: true })
    fs.writeFileSync(manualClosePath, `${JSON.stringify({ timestamp: Date.now() })}\n`, 'utf8')
    app.quit()
  })

  ipcMain.on('show-context-menu', () => {
    const menu = Menu.buildFromTemplate([
      {
        label: 'Close Kiro Buddy',
        click: () => {
          fs.mkdirSync(path.dirname(manualClosePath), { recursive: true })
          fs.writeFileSync(manualClosePath, `${JSON.stringify({ timestamp: Date.now() })}\n`, 'utf8')
          app.quit()
        },
      },
    ])
    menu.popup({ window: overlayWindow.getWindow() ?? undefined })
  })

  ipcMain.handle('get-debug-info', () => getDebugInfo())

  ipcMain.handle('get-pet-scale', (): number => getConfig().petScale)

  ipcMain.handle('set-pet-scale', (_event, scale: unknown): number => {
    if (!isPetScale(scale)) {
      return getConfig().petScale
    }

    setPetScale(scale)
    const savedScale = getConfig().petScale
    const { width, height } = scaledWindowSize(savedScale)
    overlayWindow.resize(width, height)
    return savedScale
  })

  ipcMain.handle('copy-reply', (_event, text: unknown): KiroBuddyReplyResult => {
    if (!isReplyText(text)) {
      return { ok: false, message: 'Type a reply first.' }
    }

    return copyReplyToClipboard(text)
  })

  ipcMain.handle('reply-to-kiro', (_event, text: unknown): Promise<KiroBuddyReplyResult> => {
    if (!isReplyText(text)) {
      return Promise.resolve({ ok: false, message: 'Type a reply first.' })
    }

    return sendReplyToKiro(text)
  })
}
