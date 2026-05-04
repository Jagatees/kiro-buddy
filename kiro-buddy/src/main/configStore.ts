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
import ElectronStore from 'electron-store'
import type { AppConfig, NotificationConfig } from '../shared/types'

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
  clickThrough: {
    type: 'boolean',
  },
  pollIntervalMs: {
    type: 'number',
  },
}

// ---------------------------------------------------------------------------
// Default values (Requirement 9.5)
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: AppConfigSchema = {
  window: {
    x:      100,
    y:      100,
    width:  120,
    height: 120,
  },
  statusFilePath: path.join(os.homedir(), '.kiro', 'status.json'),
  notifications: {
    enabled: true,
    onDone:  true,
    onError: true,
  },
  clickThrough:   false,
  pollIntervalMs: 500,
}

// ---------------------------------------------------------------------------
// Store instance
// Store at ~/.kiro-buddy/config.json (Requirement 9.1)
// ---------------------------------------------------------------------------

const store = new ElectronStore<AppConfigSchema>({
  name:     'config',
  cwd:      path.join(os.homedir(), '.kiro-buddy'),
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
    statusFilePath: store.get('statusFilePath', DEFAULT_CONFIG.statusFilePath),
    notifications: {
      enabled: store.get('notifications.enabled', DEFAULT_CONFIG.notifications.enabled),
      onDone:  store.get('notifications.onDone',  DEFAULT_CONFIG.notifications.onDone),
      onError: store.get('notifications.onError', DEFAULT_CONFIG.notifications.onError),
    },
    clickThrough:   store.get('clickThrough',   DEFAULT_CONFIG.clickThrough),
    pollIntervalMs: store.get('pollIntervalMs', DEFAULT_CONFIG.pollIntervalMs),
  }
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
 * Persists the click-through mode setting to AppConfig.
 */
export function setClickThrough(enabled: boolean): void {
  store.set('clickThrough', enabled)
}

// Export the raw store instance for advanced use cases (e.g., watching changes)
export { store }
