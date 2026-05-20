import { ipcMain, screen } from 'electron'
import { overlayWindow } from './overlayWindow'
import { getConfig } from './configStore'
import { IPC_CHANNELS, isMoveWindowPayload } from '../shared/ipc'

const BASE_WINDOW_WIDTH = 390
const BASE_WINDOW_HEIGHT = 360

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

function scaledWindowSize(scale: number): { width: number; height: number } {
  return {
    width: Math.round(BASE_WINDOW_WIDTH * scale),
    height: Math.round(BASE_WINDOW_HEIGHT * scale),
  }
}

export function registerIpcHandlers(): void {
  ipcMain.removeAllListeners(IPC_CHANNELS.moveWindow)

  ipcMain.on(IPC_CHANNELS.moveWindow, (_event, payload: unknown) => {
    if (!isMoveWindowPayload(payload)) {
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
}
