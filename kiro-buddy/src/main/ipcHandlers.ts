import { ipcMain, screen } from 'electron'
import { overlayWindow } from './overlayWindow'
import { getConfig, getProjectPath, setPetOpacity, setPetScale, setPositionLocked } from './configStore'
import { DEFAULT_WINDOW_X, DEFAULT_WINDOW_Y, windowSizeForPetScale } from '../shared/constants'
import {
  IPC_CHANNELS,
  isMoveWindowPayload,
  isSetPetOpacityPayload,
  isSetPetScalePayload,
  isSetPositionLockedPayload,
  isSetSettingsMenuOpenPayload,
} from '../shared/ipc'

interface Rect {
  x: number
  y: number
  width: number
  height: number
}

let settingsMenuOpen = false

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max))
}

function unionRects(rects: Rect[]): Rect {
  if (rects.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 }
  }

  const minX = Math.min(...rects.map((rect) => rect.x))
  const minY = Math.min(...rects.map((rect) => rect.y))
  const maxX = Math.max(...rects.map((rect) => rect.x + rect.width))
  const maxY = Math.max(...rects.map((rect) => rect.y + rect.height))

  return {
    x:      minX,
    y:      minY,
    width:  maxX - minX,
    height: maxY - minY,
  }
}

function getVirtualDesktopBounds(): Rect {
  const displays = screen.getAllDisplays()
  return unionRects(displays.map((display) => display.bounds))
}

function settingsPayload() {
  const config = getConfig()

  return {
    petScale: config.petScale,
    petOpacity: config.petOpacity,
    positionLocked: config.positionLocked,
    projectPath: getProjectPath(),
    statusFilePath: config.statusFilePath,
  }
}

function resizeOverlayForCurrentUiState(): void {
  const config = getConfig()
  const { width, height } = windowSizeForPetScale(config.petScale, settingsMenuOpen)
  overlayWindow.resize(width, height)
}

export function registerIpcHandlers(): void {
  settingsMenuOpen = false
  ipcMain.removeAllListeners(IPC_CHANNELS.moveWindow)
  ipcMain.removeAllListeners(IPC_CHANNELS.setSettingsMenuOpen)
  ipcMain.removeHandler(IPC_CHANNELS.getSettings)
  ipcMain.removeHandler(IPC_CHANNELS.setPetScale)
  ipcMain.removeHandler(IPC_CHANNELS.setPetOpacity)
  ipcMain.removeHandler(IPC_CHANNELS.setPositionLocked)
  ipcMain.removeHandler(IPC_CHANNELS.resetWindowPosition)

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
    if (config.positionLocked) {
      return
    }

    const bounds = getVirtualDesktopBounds()
    const { width: windowWidth, height: windowHeight } = windowSizeForPetScale(config.petScale)
    const maxX = Math.max(bounds.x, bounds.x + bounds.width - windowWidth)
    const maxY = Math.max(bounds.y, bounds.y + bounds.height - windowHeight)
    const x = clamp(Math.round(payload.x), bounds.x, maxX)
    const y = clamp(Math.round(payload.y), bounds.y, maxY)

    overlayWindow.setPosition(x, y)
  })

  ipcMain.handle(IPC_CHANNELS.getSettings, () => settingsPayload())

  ipcMain.handle(IPC_CHANNELS.setPetScale, (_event, payload: unknown) => {
    if (!isSetPetScalePayload(payload)) {
      console.warn('[IPC] Rejected invalid set-pet-scale payload')
      return settingsPayload()
    }

    const petScale = setPetScale(payload.scale)
    const { width, height } = windowSizeForPetScale(petScale, settingsMenuOpen)
    overlayWindow.resize(width, height)

    return settingsPayload()
  })

  ipcMain.handle(IPC_CHANNELS.setPetOpacity, (_event, payload: unknown) => {
    if (!isSetPetOpacityPayload(payload)) {
      console.warn('[IPC] Rejected invalid set-pet-opacity payload')
      return settingsPayload()
    }

    setPetOpacity(payload.opacity)

    return settingsPayload()
  })

  ipcMain.handle(IPC_CHANNELS.setPositionLocked, (_event, payload: unknown) => {
    if (!isSetPositionLockedPayload(payload)) {
      console.warn('[IPC] Rejected invalid set-position-locked payload')
      return settingsPayload()
    }

    setPositionLocked(payload.locked)

    return settingsPayload()
  })

  ipcMain.on(IPC_CHANNELS.setSettingsMenuOpen, (_event, payload: unknown) => {
    if (!isSetSettingsMenuOpenPayload(payload)) {
      console.warn('[IPC] Rejected invalid set-settings-menu-open payload')
      return
    }

    settingsMenuOpen = payload.open
    resizeOverlayForCurrentUiState()
  })

  ipcMain.handle(IPC_CHANNELS.resetWindowPosition, () => {
    overlayWindow.setPosition(DEFAULT_WINDOW_X, DEFAULT_WINDOW_Y)
    return settingsPayload()
  })
}
