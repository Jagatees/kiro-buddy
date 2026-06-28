import { app } from 'electron'
import { getConfig } from './configStore'
import { overlayWindow } from './overlayWindow'
import { registerIpcHandlers } from './ipcHandlers'
import { statusManager } from './statusManager'
import { configureToastNotifier, notifyForStatus } from './toastNotifier'
import { startKiroLifecycleWatcher, stopKiroLifecycleWatcher } from './kiroLifecycle'
import { startKiroInputMonitor, stopKiroInputMonitor } from './kiroInputMonitor'
import { IPC_CHANNELS } from '../shared/ipc'
import { windowSizeForPetScale } from '../shared/constants'
import type { OverlayWindowConfig } from '../shared/types'

export function scaledWindowSize(scale: number): { width: number; height: number } {
  return windowSizeForPetScale(scale)
}

function createOverlayConfig(): OverlayWindowConfig {
  const config = getConfig()
  const size = scaledWindowSize(config.petScale)

  return {
    width: size.width,
    height: size.height,
    x: config.window.x,
    y: config.window.y,
    alwaysOnTop: true,
    transparent: true,
    frame: false,
    skipTaskbar: true,
  }
}

app.whenReady().then(async () => {
  const config = getConfig()
  const win = overlayWindow.create(createOverlayConfig())

  const sendCurrentStatus = (): void => {
    const payload = statusManager.getCurrentStatus()
    if (payload && !win.isDestroyed()) {
      win.webContents.send(IPC_CHANNELS.statusUpdate, payload)
    }
  }

  registerIpcHandlers()
  configureToastNotifier(config.notifications, win)

  statusManager.onStatusChange((payload) => {
    win.webContents.send(IPC_CHANNELS.statusUpdate, payload)
    notifyForStatus(payload.status, payload.message)
  })

  await statusManager.initialize(config.statusFilePath)
  statusManager.startWatching()
  startKiroInputMonitor()
  startKiroLifecycleWatcher()
  win.webContents.once('did-finish-load', () => {
    setTimeout(sendCurrentStatus, 50)
  })
  setTimeout(sendCurrentStatus, 500)
  overlayWindow.show()
})

app.on('before-quit', () => {
  stopKiroInputMonitor()
  statusManager.stopWatching()
  stopKiroLifecycleWatcher()
})

app.on('window-all-closed', () => {
  stopKiroInputMonitor()
  statusManager.stopWatching()
  stopKiroLifecycleWatcher()

  if (process.platform !== 'darwin') {
    app.quit()
  }
})

process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught exception:', err)
})
