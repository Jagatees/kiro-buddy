/**
 * overlayWindow.ts
 *
 * Creates and manages the Electron BrowserWindow with overlay properties.
 * The window is frameless, transparent, always-on-top, and skips the taskbar.
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 10.1, 10.2, 11.1
 */

import path from 'path'
import { BrowserWindow, app } from 'electron'
import { getConfig, setWindowPosition } from './configStore'
import type { OverlayWindowConfig } from '../shared/types'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Maximum number of BrowserWindow creation attempts (Requirement 10.1) */
const MAX_RETRIES = 3

/** Delay in milliseconds between retry attempts (Requirement 10.1) */
const RETRY_DELAY_MS = 2000

// ---------------------------------------------------------------------------
// Module-level window reference
// ---------------------------------------------------------------------------

let win: BrowserWindow | null = null

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

export function configureMacFullscreenOverlay(
  window: BrowserWindow,
  platform: NodeJS.Platform = process.platform,
): void {
  if (platform !== 'darwin') {
    return
  }

  if (typeof window.setFullScreenable === 'function') {
    window.setFullScreenable(false)
  }

  if (typeof window.setVisibleOnAllWorkspaces === 'function') {
    window.setVisibleOnAllWorkspaces(true, {
      visibleOnFullScreen: true,
      skipTransformProcessType: true,
    })
  }

  if (typeof window.setAlwaysOnTop === 'function') {
    window.setAlwaysOnTop(true, 'screen-saver', 1)
  }
}

/**
 * Attempts to create a BrowserWindow with the given config.
 * Retries up to MAX_RETRIES times on failure, then exits gracefully.
 *
 * Requirements: 10.1, 10.2
 */
function createWithRetry(config: OverlayWindowConfig, attempt: number = 1): void {
  try {
    win = new BrowserWindow({
      width: config.width,
      height: config.height,
      x: config.x,
      y: config.y,
      alwaysOnTop: config.alwaysOnTop,
      transparent: config.transparent,
      frame: config.frame,
      skipTaskbar: config.skipTaskbar,
      webPreferences: {
        contextIsolation: true,   // Requirement 11.1
        nodeIntegration: false,   // Requirement 11.1
        preload: path.join(__dirname, 'preload.js'),
      },
    })

    configureMacFullscreenOverlay(win)

    if (typeof win.loadFile === 'function') {
      win.loadFile(path.join(__dirname, '..', '..', 'renderer', 'index.html'))
    }
  } catch (err) {
    console.error(`[OverlayWindow] BrowserWindow creation failed (attempt ${attempt}/${MAX_RETRIES}):`, err)

    if (attempt < MAX_RETRIES) {
      console.log(`[OverlayWindow] Retrying in ${RETRY_DELAY_MS}ms…`)
      setTimeout(() => createWithRetry(config, attempt + 1), RETRY_DELAY_MS)
    } else {
      console.error('[OverlayWindow] All retries exhausted. Exiting gracefully.')
      app.exit(1)
    }
  }
}

// ---------------------------------------------------------------------------
// OverlayWindow singleton implementation
// ---------------------------------------------------------------------------

/**
 * Singleton object implementing the OverlayWindow interface.
 * Manages the lifecycle of the single overlay BrowserWindow.
 */
export const overlayWindow = {
  /**
   * Creates the BrowserWindow overlay.
   *
   * Restores the last saved position from configStore (Requirements 1.3, 1.4).
   * Falls back to (100, 100) if no position is saved.
   * Applies retry logic on creation failure (Requirements 10.1, 10.2).
   *
   * @param config - OverlayWindowConfig with window properties
   * @returns The created BrowserWindow instance
   */
  create(config: OverlayWindowConfig): BrowserWindow {
    // Restore last saved position from configStore (Requirements 1.3, 1.4)
    const savedConfig = getConfig()
    const x = savedConfig.window.x ?? 100
    const y = savedConfig.window.y ?? 100

    const resolvedConfig: OverlayWindowConfig = {
      ...config,
      x,
      y,
    }

    createWithRetry(resolvedConfig)

    // win may be null if the first attempt threw synchronously and retry is pending;
    // in that case we return a placeholder — callers should wait for app-ready.
    // In normal operation win is set synchronously by createWithRetry.
    return win as BrowserWindow
  },

  /**
   * Moves the overlay window to the given screen coordinates.
   * Also persists the new position to configStore.
   *
   * @param x - Screen x coordinate
   * @param y - Screen y coordinate
   */
  setPosition(x: number, y: number): void {
    if (!win) {
      console.warn('[OverlayWindow] setPosition called before window was created')
      return
    }
    win.setPosition(x, y)
    setWindowPosition(x, y)
  },

  /**
   * Toggles click-through mode on the overlay window.
   * When enabled, mouse events pass through the window to whatever is beneath it.
   *
   * Requirement 1.6
   *
   * @param enabled - true to enable click-through, false to disable
   */
  setClickThrough(enabled: boolean): void {
    if (!win) {
      console.warn('[OverlayWindow] setClickThrough called before window was created')
      return
    }
    win.setIgnoreMouseEvents(enabled)
  },

  /**
   * Shows the overlay window.
   *
   * Requirement 1.5
   */
  show(): void {
    if (!win) {
      console.warn('[OverlayWindow] show called before window was created')
      return
    }
    win.show()
  },

  /**
   * Hides the overlay window without destroying it.
   */
  hide(): void {
    if (!win) {
      console.warn('[OverlayWindow] hide called before window was created')
      return
    }
    win.hide()
  },

  getWindow(): BrowserWindow | null {
    return win
  },
}
