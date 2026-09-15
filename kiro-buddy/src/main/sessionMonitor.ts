import fs from 'fs'
import path from 'path'
import os from 'os'
import { StringDecoder } from 'string_decoder'
import { SessionFlow, object } from './sessionFlow'
import { statusManager } from './statusManager'
import type { StatusPayload } from '../shared/types'

const MAX_READ = 8 * 1024 * 1024

/** Keeps incomplete JSON lines until the next append and never replays old bytes. */
export class SessionTail {
  private offset = 0
  private remainder = ''
  private decoder = new StringDecoder('utf8')
  constructor(readonly file: string) {}
  read(): unknown[] {
    const size = fs.statSync(this.file).size
    if (size < this.offset) { this.offset = 0; this.remainder = ''; this.decoder = new StringDecoder('utf8') }
    if (size === this.offset) return []
    const skip = size - this.offset > MAX_READ
    const start = skip ? size - MAX_READ : this.offset
    if (skip) this.decoder = new StringDecoder('utf8')
    const fd = fs.openSync(this.file, 'r')
    let text: string
    try {
      const buffer = Buffer.alloc(size - start)
      const count = fs.readSync(fd, buffer, 0, buffer.length, start)
      this.offset = start + count
      text = (skip ? '' : this.remainder) + this.decoder.write(buffer.subarray(0, count))
    } finally { fs.closeSync(fd) }
    const lines = text.split('\n')
    if (skip) lines.shift()
    this.remainder = lines.pop() ?? ''
    return lines.flatMap(line => {
      try { return [JSON.parse(line)] } catch { return [] }
    })
  }
}

/** Reads only child streams explicitly linked by this session's events. */
export class SessionRecords {
  private main: SessionTail
  private children = new Map<string, { tail: SessionTail; executionId: string }>()
  constructor(private readonly file: string) { this.main = new SessionTail(file) }

  read(): unknown[] {
    const records = this.main.read()
    const discover = (values: unknown[]): void => {
      for (const record of values) {
        const p = object(object(record).payload)
        if (p.type !== 'sub_agent_start' || typeof p.subSessionId !== 'string' ||
            !/^[a-zA-Z0-9_-]{1,160}$/.test(p.subSessionId) || typeof p.parentExecutionId !== 'string') continue
        if (!this.children.has(p.subSessionId)) this.children.set(p.subSessionId, {
          tail: new SessionTail(path.join(path.dirname(this.file), 'sub-executions', `${p.subSessionId}.jsonl`)),
          executionId: p.parentExecutionId,
        })
      }
    }
    discover(records)
    for (const { tail, executionId } of this.children.values()) {
      try {
        const child = tail.read().filter(record => {
          const p = object(object(record).payload)
          // Only the parent can start/finish the user turn.
          return !['user', 'turn_start', 'turn_end'].includes(String(p.type)) &&
            (p.executionId === executionId || p.parentExecutionId === executionId)
        })
        discover(child)
        records.push(...child)
      } catch { /* A declared child may not have written its first event yet. */ }
    }
    return records.sort((a, b) => Date.parse(String(object(a).timestamp)) - Date.parse(String(object(b).timestamp)))
  }
}

export function discoverSessions(root: string, workspace: string): Array<{ id: string; file: string }> {
  const result: Array<{ id: string; file: string }> = []
  const dirs = (dir: string): string[] => {
    try { return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name) }
    catch { return [] }
  }
  for (const group of dirs(root)) {
    for (const id of dirs(path.join(root, group))) {
      const dir = path.join(root, group, id)
      try {
        const meta = object(JSON.parse(fs.readFileSync(path.join(dir, 'session.json'), 'utf8')))
        if (meta.id !== id || !Array.isArray(meta.workspacePaths) || !meta.workspacePaths.some(
          value => typeof value === 'string' && path.resolve(value) === path.resolve(workspace),
        )) continue
        result.push({ id, file: path.join(dir, 'messages.jsonl') })
      } catch { /* Missing or partially saved metadata is retried on the next scan. */ }
    }
  }
  return result
}

export class KiroSessionMonitor {
  private sessions = new Map<string, { tail: SessionRecords; flow: SessionFlow }>()
  private timer: NodeJS.Timeout | null = null
  private lastDiscover = 0
  private readonly beganAt = Date.now()
  private selectedStart = 0

  constructor(
    private readonly workspace: string,
    private readonly publish: (payload: StatusPayload) => void,
    private readonly current: () => StatusPayload | null,
    private readonly root = path.join(os.homedir(), '.kiro', 'sessions'),
  ) {}

  tick(): void {
    if (Date.now() - this.lastDiscover >= 1000) {
      this.lastDiscover = Date.now()
      for (const session of discoverSessions(this.root, this.workspace)) {
        if (!this.sessions.has(session.id)) this.sessions.set(session.id, {
          tail: new SessionRecords(session.file), flow: new SessionFlow(session.id),
        })
      }
    }
    const updates: StatusPayload[] = []
    for (const { tail, flow } of this.sessions.values()) {
      try {
        let update: StatusPayload | null = null
        for (const record of tail.read()) update = flow.consume(record) ?? update
        const active = this.current()
        const restoring = update && active?.source === 'session-event' &&
          active.sessionId === update.sessionId && active.turnId === update.turnId &&
          update.timestamp >= active.timestamp
        if (update && (update.timestamp >= this.beganAt || restoring)) updates.push(update)
      } catch { /* Rotating/missing files are retried; never turn IO failures into agent errors. */ }
    }
    updates.sort((a, b) => (a.turnStartedAt ?? 0) - (b.turnStartedAt ?? 0) || a.timestamp - b.timestamp)
    for (const payload of updates) {
      const current = this.current()
      if ((payload.turnStartedAt ?? 0) < this.selectedStart) continue
      // A newer prompt's fast hook may arrive before its turn_start is persisted.
      if (current?.source === 'prompt-submit' && current.timestamp > payload.timestamp) continue
      if (current?.source === 'prompt-submit' && current.sessionId !== payload.sessionId &&
          current.timestamp > (payload.turnStartedAt ?? 0)) continue
      this.selectedStart = payload.turnStartedAt ?? 0
      this.publish(payload)
    }
  }

  start(): void {
    this.tick()
    this.timer = setInterval(() => this.tick(), 200)
    this.timer.unref?.()
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.sessions.clear()
  }
}

let monitor: KiroSessionMonitor | null = null
export function startKiroSessionMonitor(workspace?: string | null): void {
  if (!workspace || monitor) return
  monitor = new KiroSessionMonitor(workspace, p => statusManager.writeStatus(p), () => statusManager.getCurrentStatus())
  monitor.start()
}
export function stopKiroSessionMonitor(): void { monitor?.stop(); monitor = null }
