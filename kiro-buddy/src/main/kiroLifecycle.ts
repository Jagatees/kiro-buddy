import { app } from 'electron'
import { execFile } from 'child_process'

const WATCH_ENV = 'KIRO_BUDDY_EXIT_WITH_KIRO'
const ATTACHED_KIRO_SIGNATURE_ENV = 'KIRO_BUDDY_ATTACHED_KIRO_SIGNATURE'
const POLL_MS = 5000
const MISSING_GRACE_MS = 15000

let pollTimer: NodeJS.Timeout | null = null
let missingSince: number | null = null

const WINDOWS_PROCESS_NAMES = new Set(['kiro.exe'])
const POSIX_PROCESS_NAMES = new Set(['kiro'])

type KiroProcessInfo = {
  name: string
  commandLine: string
  signature: string | null
}

function isKiroProcessName(name: string, platform: NodeJS.Platform): boolean {
  const normalized = name.trim().toLowerCase()
  if (!normalized) {
    return false
  }

  return platform === 'win32'
    ? WINDOWS_PROCESS_NAMES.has(normalized)
    : POSIX_PROCESS_NAMES.has(normalized)
}

function isKiroCommandLine(commandLine: string, platform: NodeJS.Platform): boolean {
  if (platform === 'win32') {
    return /[\\/]Kiro[\\/]Kiro\.exe/i.test(commandLine)
  }

  return commandLine.toLowerCase().includes('/kiro.app/')
}

function parseWindowsProcesses(raw: string): KiroProcessInfo[] {
  if (!raw.trim()) {
    return []
  }

  try {
    const parsed = JSON.parse(raw)
    const records = Array.isArray(parsed) ? parsed : [parsed]
    return records
      .map((record) => {
        const processId = Number(record?.ProcessId)
        const creationDate = typeof record?.CreationDate === 'string' ? record.CreationDate : ''
        const signature = Number.isFinite(processId) && creationDate ? `${processId}:${creationDate}` : null

        return {
          name: typeof record?.Name === 'string' ? record.Name : '',
          commandLine: typeof record?.CommandLine === 'string' ? record.CommandLine : '',
          signature,
        }
      })
      .filter((record) => record.name || record.commandLine)
  } catch {
    return []
  }
}

function parsePosixProcesses(raw: string): KiroProcessInfo[] {
  return raw
    .split(/\r?\n/)
    .map((line): KiroProcessInfo | null => {
      const match = line.match(/^\s*(\d+)\s+(\S+)\s*(.*)$/)
      if (!match) {
        return null
      }

      const [, pid, commandName, commandLine] = match
      return {
        name: commandName.split('/').pop() ?? commandName,
        commandLine,
        signature: pid,
      }
    })
    .filter((record): record is KiroProcessInfo => record !== null)
}

function isKiroProcess(processInfo: KiroProcessInfo, platform: NodeJS.Platform): boolean {
  return (
    isKiroProcessName(processInfo.name, platform) ||
    isKiroCommandLine(processInfo.commandLine, platform)
  )
}

function listKiroProcesses(platform: NodeJS.Platform = process.platform): Promise<KiroProcessInfo[]> {
  return new Promise((resolve) => {
    if (platform === 'win32') {
      execFile(
        'powershell.exe',
        [
          '-NoProfile',
          '-Command',
          [
            'Get-CimInstance Win32_Process',
            "| Where-Object { $_.Name -eq 'Kiro.exe' -or $_.CommandLine -match '\\\\Kiro\\\\Kiro\\.exe|/Kiro/Kiro\\.exe' }",
            '| Select-Object ProcessId,CreationDate,Name,CommandLine',
            '| ConvertTo-Json -Compress',
          ].join(' '),
        ],
        { windowsHide: true, encoding: 'utf8' },
        (_error, stdout) => {
          resolve(parseWindowsProcesses(stdout))
        },
      )
      return
    }

    execFile('ps', ['-axo', 'pid=,comm=,command='], { encoding: 'utf8' }, (_error, stdout) => {
      resolve(parsePosixProcesses(stdout))
    })
  })
}

export async function isKiroRunning(platform: NodeJS.Platform = process.platform): Promise<boolean> {
  const processes = await listKiroProcesses(platform)
  return processes.some((processInfo) => isKiroProcess(processInfo, platform))
}

export async function isAttachedKiroRunning(
  signature: string | null | undefined,
  platform: NodeJS.Platform = process.platform,
): Promise<boolean> {
  const attachedSignature = signature?.trim()
  if (!attachedSignature) {
    return isKiroRunning(platform)
  }

  const processes = await listKiroProcesses(platform)
  return processes.some(
    (processInfo) =>
      processInfo.signature === attachedSignature && isKiroProcess(processInfo, platform),
  )
}

export function startKiroLifecycleWatcher(): void {
  if (process.env[WATCH_ENV] !== '1' || pollTimer) {
    return
  }

  const attachedKiroSignature = process.env[ATTACHED_KIRO_SIGNATURE_ENV] || null

  const poll = async (): Promise<void> => {
    const running = await isAttachedKiroRunning(attachedKiroSignature)
    if (running) {
      missingSince = null
      return
    }

    missingSince ??= Date.now()
    if (Date.now() - missingSince >= MISSING_GRACE_MS) {
      stopKiroLifecycleWatcher()
      app.quit()
    }
  }

  pollTimer = setInterval(() => {
    void poll()
  }, POLL_MS)
  pollTimer.unref?.()
  void poll()
}

export function stopKiroLifecycleWatcher(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  missingSince = null
}
