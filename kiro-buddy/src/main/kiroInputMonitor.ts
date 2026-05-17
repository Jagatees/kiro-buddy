import fs from 'fs'
import path from 'path'
import os from 'os'
import chokidar, { FSWatcher } from 'chokidar'
import type { StatusPayload } from '../shared/types'
import { statusManager } from './statusManager'

const DISABLE_ENV = 'KIRO_BUDDY_DISABLE_INPUT_MONITOR'
const INPUT_REQUIRED_PATTERN = /Showed native inputRequired notification for execution ([\w-]+)/i
const INPUT_REQUIRED_GLOBAL_PATTERN =
  /Showed native inputRequired notification for execution\s+([\w-]+)/gi
const INPUT_RESOLVED_GLOBAL_PATTERN =
  /(?:\[Terminal\] Executing command|\[Terminal\] execute terminal command done|\[Terminal\] Command execution completed|Notification closed for execution\s+([\w-]+))/gi
const MIN_ASKING_INTERVAL_MS = 1200
const POLL_MS = 1000
const TAIL_BYTES = 64 * 1024
const MAX_SEEN_EXECUTIONS = 80

let watcher: FSWatcher | null = null
let pollTimer: NodeJS.Timeout | null = null
let activeLogPath: string | null = null
let activeOffset = 0
let lastExecutionId: string | null = null
let lastAskingAt = 0
let inputPending = false
const seenExecutionIds: string[] = []
const seenResolvedEventKeys: string[] = []

function kiroLogRoot(): string {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Kiro', 'logs')
  }

  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Kiro', 'logs')
  }

  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'Kiro', 'logs')
}

function findNewestKiroLog(root: string = kiroLogRoot()): string | null {
  const candidates: Array<{ filePath: string; mtimeMs: number }> = []

  function walk(dir: string): void {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const filePath = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        walk(filePath)
        continue
      }

      if (entry.isFile() && entry.name === 'Kiro Logs.log') {
        try {
          candidates.push({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs })
        } catch {
          // Ignore files that disappear while scanning.
        }
      }
    }
  }

  walk(root)
  candidates.sort((left, right) => right.mtimeMs - left.mtimeMs)
  return candidates[0]?.filePath ?? null
}

function readNewText(filePath: string): string {
  const stats = fs.statSync(filePath)
  if (filePath !== activeLogPath || stats.size < activeOffset) {
    activeLogPath = filePath
    activeOffset = stats.size
    return ''
  }

  if (stats.size === activeOffset) {
    return ''
  }

  const fd = fs.openSync(filePath, 'r')
  try {
    const length = stats.size - activeOffset
    const buffer = Buffer.alloc(length)
    fs.readSync(fd, buffer, 0, length, activeOffset)
    activeOffset = stats.size
    return buffer.toString('utf8')
  } finally {
    fs.closeSync(fd)
  }
}

export function detectInputRequired(text: string): string | null {
  const match = INPUT_REQUIRED_PATTERN.exec(text) ?? INPUT_REQUIRED_GLOBAL_PATTERN.exec(text)
  INPUT_REQUIRED_GLOBAL_PATTERN.lastIndex = 0
  return match?.[1] ?? null
}

function detectInputRequiredExecutions(text: string): string[] {
  const executionIds: string[] = []
  let match: RegExpExecArray | null
  INPUT_REQUIRED_GLOBAL_PATTERN.lastIndex = 0
  while ((match = INPUT_REQUIRED_GLOBAL_PATTERN.exec(text)) !== null) {
    executionIds.push(match[1])
  }
  INPUT_REQUIRED_GLOBAL_PATTERN.lastIndex = 0
  return executionIds
}

type InputMonitorEvent =
  | { type: 'required'; executionId: string; index: number }
  | { type: 'resolved'; executionId?: string; index: number }

function detectInputMonitorEvents(text: string): InputMonitorEvent[] {
  const events: InputMonitorEvent[] = []
  let inputMatch: RegExpExecArray | null
  let resolvedMatch: RegExpExecArray | null

  INPUT_REQUIRED_GLOBAL_PATTERN.lastIndex = 0
  while ((inputMatch = INPUT_REQUIRED_GLOBAL_PATTERN.exec(text)) !== null) {
    events.push({ type: 'required', executionId: inputMatch[1], index: inputMatch.index })
  }
  INPUT_REQUIRED_GLOBAL_PATTERN.lastIndex = 0

  INPUT_RESOLVED_GLOBAL_PATTERN.lastIndex = 0
  while ((resolvedMatch = INPUT_RESOLVED_GLOBAL_PATTERN.exec(text)) !== null) {
    events.push({
      type: 'resolved',
      executionId: resolvedMatch[1],
      index: resolvedMatch.index,
    })
  }
  INPUT_RESOLVED_GLOBAL_PATTERN.lastIndex = 0

  events.sort((left, right) => left.index - right.index)
  return events
}

function rememberExecutionId(executionId: string): void {
  if (seenExecutionIds.includes(executionId)) {
    return
  }

  seenExecutionIds.push(executionId)
  while (seenExecutionIds.length > MAX_SEEN_EXECUTIONS) {
    seenExecutionIds.shift()
  }
}

function hasSeenExecutionId(executionId: string): boolean {
  return seenExecutionIds.includes(executionId)
}

function rememberResolvedEvent(key: string): void {
  if (seenResolvedEventKeys.includes(key)) {
    return
  }

  seenResolvedEventKeys.push(key)
  while (seenResolvedEventKeys.length > MAX_SEEN_EXECUTIONS) {
    seenResolvedEventKeys.shift()
  }
}

function hasSeenResolvedEvent(key: string): boolean {
  return seenResolvedEventKeys.includes(key)
}

function readTail(filePath: string): string {
  const stats = fs.statSync(filePath)
  const start = Math.max(0, stats.size - TAIL_BYTES)
  const length = stats.size - start
  if (length <= 0) {
    return ''
  }

  const fd = fs.openSync(filePath, 'r')
  try {
    const buffer = Buffer.alloc(length)
    fs.readSync(fd, buffer, 0, length, start)
    return buffer.toString('utf8')
  } finally {
    fs.closeSync(fd)
  }
}

function publishAsking(executionId: string): void {
  const now = Date.now()
  if (lastExecutionId === executionId && now - lastAskingAt < MIN_ASKING_INTERVAL_MS) {
    return
  }

  lastExecutionId = executionId
  lastAskingAt = now
  inputPending = true

  const payload: StatusPayload = {
    status: 'asking',
    message: 'Kiro is waiting for your input',
    timestamp: now,
  }
  statusManager.writeStatus(payload)
}

function publishWorkingAfterInputResolved(): void {
  if (!inputPending) {
    return
  }

  const currentStatus = statusManager.getCurrentStatus()
  if (currentStatus?.status !== 'asking' && currentStatus?.status !== 'waiting') {
    inputPending = false
    return
  }

  inputPending = false
  const payload: StatusPayload = {
    status: 'working',
    message: 'Kiro is working',
    timestamp: Date.now(),
  }
  statusManager.writeStatus(payload)
}

function processLogEvents(text: string, markExistingOnly: boolean): void {
  for (const event of detectInputMonitorEvents(text)) {
    if (event.type === 'required') {
      if (hasSeenExecutionId(event.executionId)) {
        continue
      }

      rememberExecutionId(event.executionId)
      if (!markExistingOnly) {
        publishAsking(event.executionId)
      }
      continue
    }

    const resolvedKey = `${event.executionId ?? 'terminal'}:${event.index}`
    if (hasSeenResolvedEvent(resolvedKey)) {
      continue
    }

    rememberResolvedEvent(resolvedKey)
    if (!markExistingOnly) {
      publishWorkingAfterInputResolved()
    }
  }
}

function processLogText(text: string): void {
  processLogEvents(text, false)
}

function scanNewestLog(markExistingOnly: boolean): void {
  const newestLog = findNewestKiroLog()
  if (!newestLog) {
    return
  }

  let text = ''
  try {
    text = readTail(newestLog)
  } catch {
    return
  }

  processLogEvents(text, markExistingOnly)
}

export function startKiroInputMonitor(): void {
  if (process.env[DISABLE_ENV] === '1' || watcher !== null) {
    return
  }

  const root = kiroLogRoot()
  const newestLog = findNewestKiroLog(root)
  if (newestLog) {
    try {
      activeLogPath = newestLog
      activeOffset = fs.statSync(newestLog).size
      scanNewestLog(true)
    } catch {
      activeLogPath = null
      activeOffset = 0
    }
  }

  watcher = chokidar.watch(root, {
    persistent: true,
    ignoreInitial: true,
    depth: 6,
    awaitWriteFinish: {
      stabilityThreshold: 60,
      pollInterval: 20,
    },
  })

  const handleChange = (filePath: string): void => {
    if (path.basename(filePath) !== 'Kiro Logs.log') {
      return
    }

    try {
      processLogText(readNewText(filePath))
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[KiroInputMonitor] Failed to process Kiro log: ${message}`)
    }
  }

  watcher.on('add', handleChange)
  watcher.on('change', handleChange)
  watcher.on('error', (error) => {
    console.warn(`[KiroInputMonitor] Watcher error: ${error.message}`)
  })

  pollTimer = setInterval(() => scanNewestLog(false), POLL_MS)
  pollTimer.unref?.()
}

export function stopKiroInputMonitor(): void {
  if (watcher !== null) {
    watcher.close()
    watcher = null
  }
  if (pollTimer !== null) {
    clearInterval(pollTimer)
    pollTimer = null
  }
  activeLogPath = null
  activeOffset = 0
  lastExecutionId = null
  lastAskingAt = 0
  inputPending = false
  seenExecutionIds.length = 0
  seenResolvedEventKeys.length = 0
}
