import { app } from 'electron'
import { execFile } from 'child_process'
import {
  isAttachedKiroRunning,
  isKiroRunning,
  startKiroLifecycleWatcher,
  stopKiroLifecycleWatcher,
} from '../../src/main/kiroLifecycle'

jest.mock('electron', () => ({
  app: {
    quit: jest.fn(),
  },
}))

jest.mock('child_process', () => ({
  execFile: jest.fn(),
}))

const execFileMock = execFile as unknown as jest.Mock
const quitMock = app.quit as jest.Mock

function mockProcessOutputs(outputs: string[]): void {
  execFileMock.mockImplementation((_file, _args, _options, callback) => {
    const stdout = outputs.length > 1 ? outputs.shift() : outputs[0] ?? ''
    callback(null, stdout, '')
  })
}

async function flushAsync(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

describe('kiroLifecycle', () => {
  const originalExitWithKiro = process.env.KIRO_BUDDY_EXIT_WITH_KIRO
  const originalAttachedSignature = process.env.KIRO_BUDDY_ATTACHED_KIRO_SIGNATURE

  beforeEach(() => {
    jest.useFakeTimers()
    jest.setSystemTime(0)
    execFileMock.mockReset()
    quitMock.mockClear()
    delete process.env.KIRO_BUDDY_EXIT_WITH_KIRO
    delete process.env.KIRO_BUDDY_ATTACHED_KIRO_SIGNATURE
    stopKiroLifecycleWatcher()
  })

  afterEach(() => {
    stopKiroLifecycleWatcher()
    jest.useRealTimers()
    if (originalExitWithKiro === undefined) {
      delete process.env.KIRO_BUDDY_EXIT_WITH_KIRO
    } else {
      process.env.KIRO_BUDDY_EXIT_WITH_KIRO = originalExitWithKiro
    }
    if (originalAttachedSignature === undefined) {
      delete process.env.KIRO_BUDDY_ATTACHED_KIRO_SIGNATURE
    } else {
      process.env.KIRO_BUDDY_ATTACHED_KIRO_SIGNATURE = originalAttachedSignature
    }
  })

  it('detects Kiro from Windows process snapshots', async () => {
    mockProcessOutputs([
      JSON.stringify({
        ProcessId: 123,
        CreationDate: '20260625090000.000000+480',
        Name: 'Kiro.exe',
        CommandLine: 'C:\\Users\\jagat\\AppData\\Local\\Programs\\Kiro\\Kiro.exe',
      }),
    ])

    await expect(isKiroRunning('win32')).resolves.toBe(true)
    await expect(
      isAttachedKiroRunning('123:20260625090000.000000+480', 'win32'),
    ).resolves.toBe(true)
  })

  it('requires the exact attached Kiro signature when one is present', async () => {
    mockProcessOutputs([
      JSON.stringify({
        ProcessId: 124,
        CreationDate: '20260625090100.000000+480',
        Name: 'Kiro.exe',
        CommandLine: 'C:\\Users\\jagat\\AppData\\Local\\Programs\\Kiro\\Kiro.exe',
      }),
    ])

    await expect(
      isAttachedKiroRunning('123:20260625090000.000000+480', 'win32'),
    ).resolves.toBe(false)
  })

  it('does not start watching unless the attached-mode env var is enabled', async () => {
    startKiroLifecycleWatcher()
    await flushAsync()

    expect(execFileMock).not.toHaveBeenCalled()
    expect(quitMock).not.toHaveBeenCalled()
  })

  it('quits after the attached Kiro process is gone for the grace period', async () => {
    process.env.KIRO_BUDDY_EXIT_WITH_KIRO = '1'
    process.env.KIRO_BUDDY_ATTACHED_KIRO_SIGNATURE = '123:20260625090000.000000+480'
    mockProcessOutputs([
      JSON.stringify({
        ProcessId: 123,
        CreationDate: '20260625090000.000000+480',
        Name: 'Kiro.exe',
        CommandLine: 'C:\\Users\\jagat\\AppData\\Local\\Programs\\Kiro\\Kiro.exe',
      }),
      '',
      '',
    ])

    startKiroLifecycleWatcher()
    await flushAsync()
    expect(quitMock).not.toHaveBeenCalled()

    jest.advanceTimersByTime(5000)
    await flushAsync()
    expect(quitMock).not.toHaveBeenCalled()

    jest.advanceTimersByTime(15000)
    await flushAsync()
    expect(quitMock).toHaveBeenCalledTimes(1)
  })
})
