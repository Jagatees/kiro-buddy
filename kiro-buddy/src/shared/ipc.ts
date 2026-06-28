export const IPC_CHANNELS = {
  moveWindow: 'move-window',
  getSettings: 'get-settings',
  setPetScale: 'set-pet-scale',
  setPetOpacity: 'set-pet-opacity',
  setPositionLocked: 'set-position-locked',
  setSettingsMenuOpen: 'set-settings-menu-open',
  resetWindowPosition: 'reset-window-position',
  statusUpdate: 'status-update',
} as const

export interface MoveWindowPayload {
  x: number
  y: number
}

export interface KiroBuddySettings {
  petScale: number
  petOpacity: number
  positionLocked: boolean
  projectPath: string | null
  statusFilePath: string
}

export interface SetPetScalePayload {
  scale: number
}

export interface SetPetOpacityPayload {
  opacity: number
}

export interface SetPositionLockedPayload {
  locked: boolean
}

export interface SetSettingsMenuOpenPayload {
  open: boolean
}

const MAX_ABS_WINDOW_COORDINATE = 100000

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }

  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

function isAllowedCoordinate(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    Math.abs(value) <= MAX_ABS_WINDOW_COORDINATE
  )
}

export function isMoveWindowPayload(payload: unknown): payload is MoveWindowPayload {
  if (!isPlainRecord(payload)) {
    return false
  }

  const keys = Object.keys(payload)
  return (
    keys.length === 2 &&
    keys.includes('x') &&
    keys.includes('y') &&
    isAllowedCoordinate(payload.x) &&
    isAllowedCoordinate(payload.y)
  )
}

export function isSetPetScalePayload(payload: unknown): payload is SetPetScalePayload {
  if (!isPlainRecord(payload)) {
    return false
  }

  const keys = Object.keys(payload)
  return (
    keys.length === 1 &&
    keys.includes('scale') &&
    typeof payload.scale === 'number' &&
    Number.isFinite(payload.scale)
  )
}

export function isSetPetOpacityPayload(payload: unknown): payload is SetPetOpacityPayload {
  if (!isPlainRecord(payload)) {
    return false
  }

  const keys = Object.keys(payload)
  return (
    keys.length === 1 &&
    keys.includes('opacity') &&
    typeof payload.opacity === 'number' &&
    Number.isFinite(payload.opacity)
  )
}

export function isSetPositionLockedPayload(payload: unknown): payload is SetPositionLockedPayload {
  if (!isPlainRecord(payload)) {
    return false
  }

  const keys = Object.keys(payload)
  return keys.length === 1 && keys.includes('locked') && typeof payload.locked === 'boolean'
}

export function isSetSettingsMenuOpenPayload(payload: unknown): payload is SetSettingsMenuOpenPayload {
  if (!isPlainRecord(payload)) {
    return false
  }

  const keys = Object.keys(payload)
  return keys.length === 1 && keys.includes('open') && typeof payload.open === 'boolean'
}
