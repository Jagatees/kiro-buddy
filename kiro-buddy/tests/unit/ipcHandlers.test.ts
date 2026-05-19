const listeners = new Map<string, (_event: unknown, payload: unknown) => void>()
const handlers = new Map<string, (_event: unknown, payload?: unknown) => unknown>()
const setPositionMock = jest.fn()
const resizeMock = jest.fn()
const getWindowMock = jest.fn()
const writeTextMock = jest.fn()
const warnMock = jest.spyOn(console, 'warn').mockImplementation(() => {})

jest.mock('electron', () => ({
  app: {
    quit: jest.fn(),
  },
  clipboard: {
    writeText: writeTextMock,
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
    petScale: 1,
  })),
  setPetScale: jest.fn(),
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
    expect(ipcMain.on).toHaveBeenCalledWith('move-window', expect.any(Function))
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
