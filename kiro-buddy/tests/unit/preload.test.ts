const exposeInMainWorldMock = jest.fn()
const sendMock = jest.fn()
const invokeMock = jest.fn()
const onMock = jest.fn()
const removeListenerMock = jest.fn()

jest.mock('electron', () => ({
  contextBridge: {
    exposeInMainWorld: exposeInMainWorldMock,
  },
  ipcRenderer: {
    send: sendMock,
    invoke: invokeMock,
    on: onMock,
    removeListener: removeListenerMock,
  },
}))

import { IPC_CHANNELS } from '../../src/shared/ipc'

describe('preload IPC bridge', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    jest.isolateModules(() => {
      require('../../src/main/preload')
    })
  })

  function exposedApi(): {
    onStatusUpdate(handler: (payload: unknown) => void): () => void
    moveWindow(payload: unknown): void
    getSettings(): Promise<unknown>
    setPetScale(scale: number): Promise<unknown>
    setPetOpacity(opacity: number): Promise<unknown>
    setPositionLocked(locked: boolean): Promise<unknown>
    setSettingsMenuOpen(open: boolean): void
    resetWindowPosition(): Promise<unknown>
  } {
    const [, api] = exposeInMainWorldMock.mock.calls[0]
    return api
  }

  it('exposes only status, move-window, and settings behavior', () => {
    expect(exposeInMainWorldMock).toHaveBeenCalledWith('kiroBuddy', expect.any(Object))
    expect(Object.keys(exposedApi()).sort()).toEqual([
      'getSettings',
      'moveWindow',
      'onStatusUpdate',
      'resetWindowPosition',
      'setPetOpacity',
      'setPetScale',
      'setPositionLocked',
      'setSettingsMenuOpen',
    ])
  })

  it('sends only valid move-window payloads', () => {
    const api = exposedApi()

    api.moveWindow({ x: 10, y: 20 })
    api.moveWindow({ x: 10, y: 20, extra: true })
    api.moveWindow({ x: Number.NaN, y: 20 })

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith(IPC_CHANNELS.moveWindow, { x: 10, y: 20 })
  })

  it('invokes settings channels with strict validation', async () => {
    const api = exposedApi()
    invokeMock.mockResolvedValue({
      petScale: 1,
      petOpacity: 1,
      positionLocked: false,
      projectPath: 'D:\\Github-Local\\kiro-pets',
      statusFilePath: 'C:\\Users\\jagat\\.kiro\\status.json',
    })

    await api.getSettings()
    await api.setPetScale(1.2)
    await api.setPetScale(Number.NaN)
    await api.setPetOpacity(0.7)
    await api.setPetOpacity(Number.NaN)
    await api.setPositionLocked(true)
    await api.setPositionLocked('yes' as unknown as boolean)
    await api.resetWindowPosition()

    expect(invokeMock).toHaveBeenCalledTimes(5)
    expect(invokeMock).toHaveBeenNthCalledWith(1, IPC_CHANNELS.getSettings)
    expect(invokeMock).toHaveBeenNthCalledWith(2, IPC_CHANNELS.setPetScale, { scale: 1.2 })
    expect(invokeMock).toHaveBeenNthCalledWith(3, IPC_CHANNELS.setPetOpacity, { opacity: 0.7 })
    expect(invokeMock).toHaveBeenNthCalledWith(4, IPC_CHANNELS.setPositionLocked, { locked: true })
    expect(invokeMock).toHaveBeenNthCalledWith(5, IPC_CHANNELS.resetWindowPosition)
  })

  it('sends only valid settings menu resize payloads', () => {
    const api = exposedApi()

    api.setSettingsMenuOpen(true)
    api.setSettingsMenuOpen('yes' as unknown as boolean)

    expect(sendMock).toHaveBeenCalledTimes(1)
    expect(sendMock).toHaveBeenCalledWith(IPC_CHANNELS.setSettingsMenuOpen, { open: true })
  })

  it('subscribes to status-update and unregisters the same listener', () => {
    const api = exposedApi()
    const handler = jest.fn()
    const unsubscribe = api.onStatusUpdate(handler)
    const listener = onMock.mock.calls[0][1]

    listener({}, { status: 'idle', message: 'ready', timestamp: 1 })
    unsubscribe()

    expect(onMock).toHaveBeenCalledWith(IPC_CHANNELS.statusUpdate, listener)
    expect(handler).toHaveBeenCalledWith({ status: 'idle', message: 'ready', timestamp: 1 })
    expect(removeListenerMock).toHaveBeenCalledWith(IPC_CHANNELS.statusUpdate, listener)
  })

  it('drops malformed status-update payloads before renderer callbacks', () => {
    const api = exposedApi()
    const handler = jest.fn()
    api.onStatusUpdate(handler)
    const listener = onMock.mock.calls[0][1]

    listener({}, { status: 'idle', message: '', timestamp: 1 })
    listener({}, { status: 'idle', message: 'ready', timestamp: 1 })

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith({ status: 'idle', message: 'ready', timestamp: 1 })
  })
})
