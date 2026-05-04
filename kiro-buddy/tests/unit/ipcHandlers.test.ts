const listeners = new Map<string, (_event: unknown, payload: unknown) => void>()
const setPositionMock = jest.fn()
const getWindowMock = jest.fn()
const warnMock = jest.spyOn(console, 'warn').mockImplementation(() => {})

jest.mock('electron', () => ({
  ipcMain: {
    removeAllListeners: jest.fn((channel: string) => listeners.delete(channel)),
    on: jest.fn((channel: string, handler: (_event: unknown, payload: unknown) => void) => {
      listeners.set(channel, handler)
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
    window: { x: 100, y: 100, width: 120, height: 120 },
    statusFilePath: 'C:\\Users\\jagat\\.kiro\\status.json',
    notifications: { enabled: true, onDone: true, onError: true },
    clickThrough: false,
    pollIntervalMs: 500,
  })),
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

describe('registerIpcHandlers', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    listeners.clear()
    getWindowMock.mockReturnValue({
      getBounds: jest.fn(() => ({ x: 100, y: 100, width: 120, height: 120 })),
    })
    registerIpcHandlers()
  })

  afterAll(() => {
    warnMock.mockRestore()
  })

  it('registers only the move-window handler', () => {
    expect(ipcMain.removeAllListeners).toHaveBeenCalledWith('move-window')
    expect(ipcMain.on).toHaveBeenCalledWith('move-window', expect.any(Function))
  })

  it('clamps requested positions inside the display work area', () => {
    emitMove({ x: 900, y: -50 })

    expect(setPositionMock).toHaveBeenCalledWith(580, 0)
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
})
