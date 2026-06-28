const listeners = new Map<string, (_event: unknown, payload: unknown) => void>()
const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
const setPositionMock = jest.fn()
const resizeMock = jest.fn()
const getWindowMock = jest.fn()
let mockPetScale = 1
let mockPetOpacity = 1
let mockPositionLocked = false
let mockProjectPath: string | null = 'D:\\Github-Local\\kiro-pets'
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
    getAllDisplays: jest.fn(() => [
      { bounds: { x: 0, y: 0, width: 800, height: 600 } },
    ]),
  },
}))

jest.mock('../../src/main/overlayWindow', () => ({
  overlayWindow: {
    getWindow: getWindowMock,
    setPosition: setPositionMock,
    resize: resizeMock,
  },
}))

jest.mock('../../src/main/configStore', () => ({
  getConfig: jest.fn(() => ({
    window: { x: 100, y: 100, width: 360, height: 300 },
    statusFilePath: 'C:\\Users\\jagat\\.kiro\\status.json',
    notifications: { enabled: true, onDone: true, onError: true },
    pollIntervalMs: 500,
    petScale: mockPetScale,
    petOpacity: mockPetOpacity,
    positionLocked: mockPositionLocked,
  })),
  getProjectPath: jest.fn(() => mockProjectPath),
  setPetScale: jest.fn((scale: number) => {
    mockPetScale = Math.round(Math.max(0.6, Math.min(scale, 1.4)) * 100) / 100
    return mockPetScale
  }),
  setPetOpacity: jest.fn((opacity: number) => {
    mockPetOpacity = Math.round(Math.max(0.35, Math.min(opacity, 1)) * 100) / 100
    return mockPetOpacity
  }),
  setPositionLocked: jest.fn((locked: boolean) => {
    mockPositionLocked = locked
    return mockPositionLocked
  }),
}))

import { ipcMain, screen } from 'electron'
import { registerIpcHandlers } from '../../src/main/ipcHandlers'
import {
  IPC_CHANNELS,
  isMoveWindowPayload,
  isSetPetOpacityPayload,
  isSetPetScalePayload,
  isSetPositionLockedPayload,
  isSetSettingsMenuOpenPayload,
} from '../../src/shared/ipc'

const removedChannels = [
  'close-app',
  'show-context-menu',
  'get-debug-info',
  'get-pet-scale',
  'set-click-through',
  'suspend-click-through',
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

function emitSettingsMenuOpen(payload: unknown): void {
  const handler = listeners.get(IPC_CHANNELS.setSettingsMenuOpen)
  if (!handler) {
    throw new Error('set-settings-menu-open handler was not registered')
  }

  handler({}, payload)
}

function invokeHandler(channel: string, payload?: unknown): unknown {
  const handler = handlers.get(channel)
  if (!handler) {
    throw new Error(`${channel} handler was not registered`)
  }

  return handler({}, payload)
}

function expectedSettings(overrides: Partial<{
  petScale: number
  petOpacity: number
  positionLocked: boolean
  projectPath: string | null
  statusFilePath: string
}> = {}) {
  return {
    petScale: mockPetScale,
    petOpacity: mockPetOpacity,
    positionLocked: mockPositionLocked,
    projectPath: mockProjectPath,
    statusFilePath: 'C:\\Users\\jagat\\.kiro\\status.json',
    ...overrides,
  }
}

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    listeners.clear()
    handlers.clear()
    mockPetScale = 1
    mockPetOpacity = 1
    mockPositionLocked = false
    mockProjectPath = 'D:\\Github-Local\\kiro-pets'
    ;(screen.getAllDisplays as jest.Mock).mockReturnValue([
      { bounds: { x: 0, y: 0, width: 800, height: 600 } },
    ])
    getWindowMock.mockReturnValue({
      getBounds: jest.fn(() => ({ x: 100, y: 100, width: 360, height: 300 })),
    })
    registerIpcHandlers()
  })

  afterAll(() => {
    warnMock.mockRestore()
  })

  it('registers movement and settings IPC channels', () => {
    expect(ipcMain.removeAllListeners).toHaveBeenCalledTimes(2)
    expect(ipcMain.removeAllListeners).toHaveBeenCalledWith(IPC_CHANNELS.moveWindow)
    expect(ipcMain.removeAllListeners).toHaveBeenCalledWith(IPC_CHANNELS.setSettingsMenuOpen)
    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(5)
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.getSettings)
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.setPetScale)
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.setPetOpacity)
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.setPositionLocked)
    expect(ipcMain.removeHandler).toHaveBeenCalledWith(IPC_CHANNELS.resetWindowPosition)
    expect(ipcMain.on).toHaveBeenCalledTimes(2)
    expect(ipcMain.on).toHaveBeenCalledWith(IPC_CHANNELS.moveWindow, expect.any(Function))
    expect(ipcMain.on).toHaveBeenCalledWith(IPC_CHANNELS.setSettingsMenuOpen, expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledTimes(5)
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.getSettings, expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.setPetScale, expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.setPetOpacity, expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.setPositionLocked, expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith(IPC_CHANNELS.resetWindowPosition, expect.any(Function))
    expect(handlers.size).toBe(5)
  })

  it('does not register removed or unexpected IPC channels', () => {
    for (const channel of removedChannels) {
      expect(listeners.has(channel)).toBe(false)
      expect(handlers.has(channel)).toBe(false)
    }

    expect(listeners.has('unexpected-channel')).toBe(false)
    expect(handlers.has('unexpected-channel')).toBe(false)
  })

  it('clamps requested positions inside the virtual desktop bounds', () => {
    emitMove({ x: 900, y: -50 })

    expect(setPositionMock).toHaveBeenCalledWith(580, 0)
  })

  it('allows dragging onto displays with negative coordinates', () => {
    ;(screen.getAllDisplays as jest.Mock).mockReturnValue([
      { bounds: { x: -1024, y: 0, width: 1024, height: 768 } },
      { bounds: { x: 0, y: 0, width: 1920, height: 1080 } },
    ])

    emitMove({ x: -900, y: 850 })

    expect(setPositionMock).toHaveBeenCalledWith(-900, 850)
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

  it('does not move while position is locked', () => {
    mockPositionLocked = true

    emitMove({ x: 10, y: 20 })

    expect(setPositionMock).not.toHaveBeenCalled()
  })

  it('returns live settings through get-settings', () => {
    mockPetScale = 0.85

    expect(invokeHandler(IPC_CHANNELS.getSettings)).toEqual(expectedSettings({ petScale: 0.85 }))
  })

  it('persists scale changes and resizes the overlay', () => {
    expect(invokeHandler(IPC_CHANNELS.setPetScale, { scale: 1.25 })).toEqual(expectedSettings({
      petScale: 1.25,
    }))

    expect(resizeMock).toHaveBeenCalledWith(275, 275)
  })

  it('persists opacity changes', () => {
    expect(invokeHandler(IPC_CHANNELS.setPetOpacity, { opacity: 0.65 })).toEqual(expectedSettings({
      petOpacity: 0.65,
    }))
  })

  it('persists position lock changes', () => {
    expect(invokeHandler(IPC_CHANNELS.setPositionLocked, { locked: true })).toEqual(expectedSettings({
      positionLocked: true,
    }))
  })

  it('expands below the buddy while the settings menu is open', () => {
    emitSettingsMenuOpen({ open: true })
    emitSettingsMenuOpen({ open: false })

    expect(resizeMock).toHaveBeenNthCalledWith(1, 280, 456)
    expect(resizeMock).toHaveBeenNthCalledWith(2, 220, 220)
  })

  it('keeps the settings menu wide enough at small pet scales', () => {
    mockPetScale = 0.6

    emitSettingsMenuOpen({ open: true })

    expect(resizeMock).toHaveBeenCalledWith(280, 368)
  })

  it('resizes the open settings menu when scale changes', () => {
    emitSettingsMenuOpen({ open: true })
    resizeMock.mockClear()

    invokeHandler(IPC_CHANNELS.setPetScale, { scale: 1.25 })

    expect(resizeMock).toHaveBeenCalledWith(280, 511)
  })

  it('rejects malformed scale changes', () => {
    expect(invokeHandler(IPC_CHANNELS.setPetScale, { scale: Number.NaN })).toEqual(expectedSettings())

    expect(resizeMock).not.toHaveBeenCalled()
    expect(warnMock).toHaveBeenCalledWith('[IPC] Rejected invalid set-pet-scale payload')
  })

  it('rejects malformed opacity changes', () => {
    expect(invokeHandler(IPC_CHANNELS.setPetOpacity, { opacity: Number.NaN })).toEqual(expectedSettings())

    expect(warnMock).toHaveBeenCalledWith('[IPC] Rejected invalid set-pet-opacity payload')
  })

  it('rejects malformed position lock changes', () => {
    expect(invokeHandler(IPC_CHANNELS.setPositionLocked, { locked: 'yes' })).toEqual(expectedSettings())

    expect(warnMock).toHaveBeenCalledWith('[IPC] Rejected invalid set-position-locked payload')
  })

  it('rejects malformed settings menu resize payloads', () => {
    emitSettingsMenuOpen({ open: 'yes' })

    expect(resizeMock).not.toHaveBeenCalled()
    expect(warnMock).toHaveBeenCalledWith('[IPC] Rejected invalid set-settings-menu-open payload')
  })

  it('resets the overlay position to the default saved origin', () => {
    expect(invokeHandler(IPC_CHANNELS.resetWindowPosition)).toEqual(expectedSettings())

    expect(setPositionMock).toHaveBeenCalledWith(100, 100)
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

  it('accepts only strict scale payloads', () => {
    expect(isSetPetScalePayload({ scale: 1 })).toBe(true)
    expect(isSetPetScalePayload({ scale: 0.2 })).toBe(true)
    expect(isSetPetScalePayload({ scale: Number.NaN })).toBe(false)
    expect(isSetPetScalePayload({ scale: 1, extra: true })).toBe(false)
  })

  it('accepts only strict opacity payloads', () => {
    expect(isSetPetOpacityPayload({ opacity: 1 })).toBe(true)
    expect(isSetPetOpacityPayload({ opacity: 0.2 })).toBe(true)
    expect(isSetPetOpacityPayload({ opacity: Number.NaN })).toBe(false)
    expect(isSetPetOpacityPayload({ opacity: 1, extra: true })).toBe(false)
  })

  it('accepts only strict position lock payloads', () => {
    expect(isSetPositionLockedPayload({ locked: true })).toBe(true)
    expect(isSetPositionLockedPayload({ locked: false })).toBe(true)
    expect(isSetPositionLockedPayload({ locked: 'true' })).toBe(false)
    expect(isSetPositionLockedPayload({ locked: true, extra: false })).toBe(false)
  })

  it('accepts only strict settings menu payloads', () => {
    expect(isSetSettingsMenuOpenPayload({ open: true })).toBe(true)
    expect(isSetSettingsMenuOpenPayload({ open: 'true' })).toBe(false)
  })
})
