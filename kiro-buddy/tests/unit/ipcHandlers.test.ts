const listeners = new Map<string, (_event: unknown, payload: unknown) => void>()
const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
const setPositionMock = jest.fn()
const getWindowMock = jest.fn()
let mockPetScale = 1
const warnMock = jest.spyOn(console, 'warn').mockImplementation(() => {})

jest.mock('electron', () => ({
  ipcMain: {
    removeAllListeners: jest.fn((channel: string) => listeners.delete(channel)),
    removeHandler: jest.fn((channel: string) => handlers.delete(channel)),
    on: jest.fn((channel: string, handler: (_event: unknown, payload: unknown) => void) => {
      listeners.set(channel, handler)
    }),
    handle: jest.fn((channel: string, handler: (_event: unknown, payload?: unknown) => unknown) => {
      handlers.set(channel, handler)
    }),
  },
  screen: {
    getDisplayMatching: jest.fn(() => ({
      workArea: { x: 0, y: 0, width: 800, height: 600 },
    })),
  },
}))

jest.mock('../../src/main/overlayWindow', () => ({
  overlayWindow: {
    getWindow: getWindowMock,
    setPosition: setPositionMock,
  },
}))

jest.mock('../../src/main/configStore', () => ({
  getConfig: jest.fn(() => ({
    window: { x: 100, y: 100, width: 360, height: 300 },
    statusFilePath: 'C:\\Users\\jagat\\.kiro\\status.json',
    notifications: { enabled: true, onDone: true, onError: true },
    clickThrough: false,
    pollIntervalMs: 500,
    petScale: mockPetScale,
  })),
}))

import { ipcMain } from 'electron'
import { registerIpcHandlers } from '../../src/main/ipcHandlers'
import { IPC_CHANNELS, isMoveWindowPayload } from '../../src/shared/ipc'

const removedChannels = [
  'close-app',
  'show-context-menu',
  'get-debug-info',
  'get-pet-scale',
  'set-pet-scale',
  'copy-reply',
  'reply-to-kiro',
]

function emitMove(payload: unknown): void {
  const handler = listeners.get(IPC_CHANNELS.moveWindow)
  if (!handler) {
    throw new Error('move-window handler was not registered')
  }

  handler({}, payload)
}

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    listeners.clear()
    handlers.clear()
    mockPetScale = 1
    getWindowMock.mockReturnValue({
      getBounds: jest.fn(() => ({ x: 100, y: 100, width: 360, height: 300 })),
    })
    registerIpcHandlers()
  })

  afterAll(() => {
    warnMock.mockRestore()
  })

  it('registers only the required renderer-to-main move-window IPC channel', () => {
    expect(ipcMain.removeAllListeners).toHaveBeenCalledTimes(1)
    expect(ipcMain.removeAllListeners).toHaveBeenCalledWith(IPC_CHANNELS.moveWindow)
    expect(ipcMain.on).toHaveBeenCalledTimes(1)
    expect(ipcMain.on).toHaveBeenCalledWith(IPC_CHANNELS.moveWindow, expect.any(Function))
    expect(ipcMain.handle).not.toHaveBeenCalled()
    expect(handlers.size).toBe(0)
  })

  it('does not register removed or unexpected IPC channels', () => {
    for (const channel of removedChannels) {
      expect(listeners.has(channel)).toBe(false)
      expect(handlers.has(channel)).toBe(false)
    }

    expect(listeners.has('unexpected-channel')).toBe(false)
    expect(handlers.has('unexpected-channel')).toBe(false)
  })

  it('clamps requested positions inside the display work area', () => {
    emitMove({ x: 900, y: -50 })

    expect(setPositionMock).toHaveBeenCalledWith(410, 0)
  })

  it('rounds valid finite coordinates before moving', () => {
    emitMove({ x: 10.4, y: 20.6 })

    expect(setPositionMock).toHaveBeenCalledWith(10, 21)
  })

  it.each([
    null,
    [],
    { x: 10 },
    { y: 20 },
    { x: 10, y: 20, z: 30 },
    { x: '10', y: 20 },
    { x: Number.NaN, y: 20 },
    { x: Number.POSITIVE_INFINITY, y: 20 },
    { x: 100001, y: 20 },
  ])('rejects invalid move-window payload %#', (payload) => {
    emitMove(payload)

    expect(setPositionMock).not.toHaveBeenCalled()
    expect(warnMock).toHaveBeenCalledWith('[IPC] Rejected invalid move-window payload')
  })

  it('does not move when the overlay window is unavailable', () => {
    getWindowMock.mockReturnValue(null)

    emitMove({ x: 10, y: 20 })

    expect(setPositionMock).not.toHaveBeenCalled()
  })
})

describe('isMoveWindowPayload', () => {
  it('accepts only strict finite x/y coordinate payloads', () => {
    expect(isMoveWindowPayload({ x: 0, y: 0 })).toBe(true)
    expect(isMoveWindowPayload(Object.assign(Object.create(null), { x: -10, y: 10 }))).toBe(true)
    expect(isMoveWindowPayload({ x: 0, y: 0, extra: true })).toBe(false)
    expect(isMoveWindowPayload({ x: 0, y: Number.NaN })).toBe(false)
    expect(isMoveWindowPayload({ x: 100001, y: 0 })).toBe(false)
  })
})
