export const IPC_CHANNELS = {
  moveWindow: 'move-window',
  statusUpdate: 'status-update',
} as const

export interface MoveWindowPayload {
  x: number
  y: number
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
