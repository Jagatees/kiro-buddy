/**
 * configStore.ts
 *
 * Wraps `electron-store` to provide typed, persistent AppConfig storage.
 * Config is stored at ~/.kiro-buddy/config.json (via the `cwd` option).
 *
 * Requirements: 9.1, 9.2, 9.5
 */

import path from 'path'
import os from 'os'
import fs from 'fs'
import ElectronStore from 'electron-store'
import type { AppConfig, NotificationConfig } from '../shared/types'
import {
  BASE_WINDOW_HEIGHT,
  BASE_WINDOW_WIDTH,
  DEFAULT_WINDOW_X,
  DEFAULT_WINDOW_Y,
  PET_SCALE_MAX,
  PET_SCALE_MIN,
  PET_OPACITY_MAX,
  PET_OPACITY_MIN,
  roundPetOpacity,
  roundPetScale,
} from '../shared/constants'

// ---------------------------------------------------------------------------
// Schema definition (mirrors AppConfig interface)
// ---------------------------------------------------------------------------

type AppConfigSchema = AppConfig

const schema: ElectronStore.Schema<AppConfigSchema> = {
  window: {
    type: 'object',
    properties: {
      x:      { type: 'number' },
      y:      { type: 'number' },
      width:  { type: 'number' },
      height: { type: 'number' },
    },
    required: ['x', 'y', 'width', 'height'],
    additionalProperties: false,
  },
  statusFilePath: {
    type: 'string',
  },
  notifications: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean' },
      onDone:  { type: 'boolean' },
      onError: { type: 'boolean' },
    },
    required: ['enabled', 'onDone', 'onError'],
    additionalProperties: false,
  },
  pollIntervalMs: {
    type: 'number',
  },
  petScale: {
    type: 'number',
    minimum: PET_SCALE_MIN,
    maximum: PET_SCALE_MAX,
  },
  petOpacity: {
    type: 'number',
    minimum: PET_OPACITY_MIN,
    maximum: PET_OPACITY_MAX,
  },
  positionLocked: {
    type: 'boolean',
  },
}

// ---------------------------------------------------------------------------
// Default values (Requirement 9.5)
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: AppConfigSchema = {
  window: {
    x:      DEFAULT_WINDOW_X,
    y:      DEFAULT_WINDOW_Y,
    width:  BASE_WINDOW_WIDTH,
    height: BASE_WINDOW_HEIGHT,
  },
  statusFilePath: path.join(os.homedir(), '.kiro', 'status.json'),
  notifications: {
    enabled: true,
    onDone:  true,
    onError: true,
  },
  pollIntervalMs: 500,
  petScale:       1,
  petOpacity:     1,
  positionLocked: false,
}

function envStatusFilePath(): string | null {
  const value = process.env.KIRO_BUDDY_STATUS_FILE
  return value && path.isAbsolute(value) ? value : null
}

function argvAbsolutePath(prefix: string): string | null {
  const arg = process.argv.find((value) => value.startsWith(prefix))
  const value = arg?.slice(prefix.length)
  return value && path.isAbsolute(value) ? path.normalize(value) : null
}

function launchStatusFilePath(): string | null {
  return argvAbsolutePath('--kiro-buddy-status-file=')
}

function envAbsolutePath(name: string): string | null {
  const value = process.env[name]
  return value && path.isAbsolute(value) ? path.normalize(value) : null
}

function envProjectPath(): string | null {
  return envAbsolutePath('KIRO_BUDDY_PROJECT_PATH') ?? envAbsolutePath('KIRO_BUDDY_WORKSPACE')
}

const configDir = path.join(os.homedir(), '.kiro-buddy')
const configFilePath = path.join(configDir, 'config.json')
const UTF8_BOM = Buffer.from([0xef, 0xbb, 0xbf])

export function repairConfigFileEncoding(filePath: string = configFilePath): void {
  let buffer: Buffer
  try {
    buffer = fs.readFileSync(filePath)
  } catch {
    return
  }

  if (buffer.subarray(0, UTF8_BOM.length).equals(UTF8_BOM)) {
    fs.writeFileSync(filePath, buffer.subarray(UTF8_BOM.length))
  }
}

// ---------------------------------------------------------------------------
// Store instance
// Store at ~/.kiro-buddy/config.json (Requirement 9.1)
// ---------------------------------------------------------------------------

repairConfigFileEncoding()

const store = new ElectronStore<AppConfigSchema>({
  name:     'config',
  cwd:      configDir,
  schema,
  defaults: DEFAULT_CONFIG,
})

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/**
 * Returns the full AppConfig, merging stored values with defaults.
 * On first run (no existing config), electron-store writes the defaults
 * automatically via the `defaults` option.
 */
export function getConfig(): AppConfigSchema {
  return {
    window: {
      x:      store.get('window.x',      DEFAULT_CONFIG.window.x),
      y:      store.get('window.y',      DEFAULT_CONFIG.window.y),
      width:  store.get('window.width',  DEFAULT_CONFIG.window.width),
      height: store.get('window.height', DEFAULT_CONFIG.window.height),
    },
    statusFilePath:
      launchStatusFilePath() ??
      envStatusFilePath() ??
      store.get('statusFilePath', DEFAULT_CONFIG.statusFilePath),
    notifications: {
      enabled: store.get('notifications.enabled', DEFAULT_CONFIG.notifications.enabled),
      onDone:  store.get('notifications.onDone',  DEFAULT_CONFIG.notifications.onDone),
      onError: store.get('notifications.onError', DEFAULT_CONFIG.notifications.onError),
    },
    pollIntervalMs: store.get('pollIntervalMs', DEFAULT_CONFIG.pollIntervalMs),
    petScale:       store.get('petScale',       DEFAULT_CONFIG.petScale),
    petOpacity:     store.get('petOpacity',     DEFAULT_CONFIG.petOpacity),
    positionLocked: store.get('positionLocked', DEFAULT_CONFIG.positionLocked),
  }
}

export function getProjectPath(): string | null {
  return envProjectPath()
}

/**
 * Persists the window position to AppConfig.
 * Called on mouseup after a drag operation (Requirement 9.3).
 */
export function setWindowPosition(x: number, y: number): void {
  store.set('window.x', x)
  store.set('window.y', y)
}

/**
 * Persists updated notification preferences to AppConfig.
 * Called immediately when preferences change (Requirement 9.4).
 */
export function setNotificationPrefs(prefs: NotificationConfig): void {
  store.set('notifications', prefs)
}

/**
 * Persists the pet/window scale setting.
 */
export function setPetScale(scale: number): number {
  const roundedScale = roundPetScale(scale)
  store.set('petScale', roundedScale)
  return roundedScale
}

/**
 * Persists the pet visual opacity setting.
 */
export function setPetOpacity(opacity: number): number {
  const roundedOpacity = roundPetOpacity(opacity)
  store.set('petOpacity', roundedOpacity)
  return roundedOpacity
}

/**
 * Persists whether dragging is locked.
 */
export function setPositionLocked(locked: boolean): boolean {
  store.set('positionLocked', locked)
  return locked
}

// Export the raw store instance for advanced use cases (e.g., watching changes)
export { store }
