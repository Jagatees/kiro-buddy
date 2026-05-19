const listeners = new Map<string, (_event: unknown, payload: unknown) => void>()
const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
const setPositionMock = jest.fn()
const resizeMock = jest.fn()
const getWindowMock = jest.fn()
const writeTextMock = jest.fn()
const menuPopupMock = jest.fn()
const buildFromTemplateMock = jest.fn(() => ({ popup: menuPopupMock }))
let mockPetScale = 1
const warnMock = jest.spyOn(console, 'warn').mockImplementation(() => {})

jest.mock('electron', () => ({
  app: {
    quit: jest.fn(),
  },
  clipboard: {
    writeText: writeTextMock,
  },
  Menu: {
    buildFromTemplate: buildFromTemplateMock,
  },
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
    resize: resizeMock,
  },
}))

jest.mock('../../src/main/statusManager', () => ({
  statusManager: {
    getCurrentStatus: jest.fn(() => ({
      status: 'working',
      message: 'Running tests',
      timestamp: 1700000000000,
      phase: 'tasks',
    })),
    getStatusFilePath: jest.fn(() => '/Users/test/.kiro/status.json'),
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
  setPetScale: jest.fn((scale: number) => {
    mockPetScale = Math.max(0.6, Math.min(scale, 1.4))
  }),
}))

import { ipcMain } from 'electron'
import { registerIpcHandlers } from '../../src/main/ipcHandlers'

function emitMove(payload: unknown): void {
  const handler = listeners.get('move-window')
  if (!handler) {
    throw new Error('move-window handler was not registered')
  }

  handler({}, payload)
}

function invoke(channel: string, payload?: unknown): unknown {
  const handler = handlers.get(channel)
  if (!handler) {
    throw new Error(`${channel} handler was not registered`)
  }

  return handler({}, payload)
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

  it('registers window and panel IPC handlers', () => {
    expect(ipcMain.removeAllListeners).toHaveBeenCalledWith('move-window')
    expect(ipcMain.removeAllListeners).toHaveBeenCalledWith('show-context-menu')
    expect(ipcMain.on).toHaveBeenCalledWith('move-window', expect.any(Function))
    expect(ipcMain.on).toHaveBeenCalledWith('show-context-menu', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('get-debug-info', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('get-pet-scale', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('set-pet-scale', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('copy-reply', expect.any(Function))
    expect(ipcMain.handle).toHaveBeenCalledWith('reply-to-kiro', expect.any(Function))
  })

  it('clamps requested positions inside the display work area', () => {
    emitMove({ x: 900, y: -50 })

    expect(setPositionMock).toHaveBeenCalledWith(410, 0)
  })

  it('rounds valid finite coordinates before moving', () => {
    emitMove({ x: 10.4, y: 20.6 })

    expect(setPositionMock).toHaveBeenCalledWith(10, 21)
  })

  it('rejects invalid payloads', () => {
    emitMove({ x: Number.NaN, y: 20 })

    expect(setPositionMock).not.toHaveBeenCalled()
  })

  it('does not move when the overlay window is unavailable', () => {
    getWindowMock.mockReturnValue(null)

    emitMove({ x: 10, y: 20 })

    expect(setPositionMock).not.toHaveBeenCalled()
  })

  it('opens a context menu with a close action', () => {
    const handler = listeners.get('show-context-menu')
    if (!handler) {
      throw new Error('show-context-menu handler was not registered')
    }

    handler({}, undefined)

    expect(buildFromTemplateMock).toHaveBeenCalledWith([
      expect.objectContaining({ label: 'Close Kiro Buddy' }),
    ])
    expect(menuPopupMock).toHaveBeenCalled()
  })

  it('ignores invalid pet scale requests without resizing the window', () => {
    expect(invoke('set-pet-scale', 99)).toBe(1)
    expect(resizeMock).not.toHaveBeenCalled()
  })

  it('resizes the overlay for valid pet scale requests', () => {
    expect(invoke('set-pet-scale', 0.8)).toBe(0.8)
    expect(resizeMock).toHaveBeenCalledWith(312, 288)
  })

  it('returns debug info for the in-app panel', () => {
    expect(invoke('get-debug-info')).toMatchObject({
      status: 'working',
      message: 'Running tests',
      phase: 'tasks',
      statusFilePath: '/Users/test/.kiro/status.json',
    })
  })

  it('copies reply text through the clipboard bridge', () => {
    expect(invoke('copy-reply', ' continue please ')).toEqual({
      ok: true,
      message: 'Copied reply.',
    })
    expect(writeTextMock).toHaveBeenCalledWith('continue please')
  })

  it('rejects empty reply text', () => {
    expect(invoke('copy-reply', '   ')).toEqual({
      ok: false,
      message: 'Type a reply first.',
    })
    expect(writeTextMock).not.toHaveBeenCalled()
  })
})
