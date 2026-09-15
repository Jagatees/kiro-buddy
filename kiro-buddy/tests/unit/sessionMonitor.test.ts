import fs from 'fs'
import os from 'os'
import path from 'path'
import { SessionTail, SessionRecords, discoverSessions, KiroSessionMonitor } from '../../src/main/sessionMonitor'
import { SessionFlow } from '../../src/main/sessionFlow'
import type { StatusPayload } from '../../src/shared/types'

let root: string
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-session-')) })
afterEach(() => { fs.rmSync(root, { recursive: true, force: true }) })
function session(id: string, workspace = '/qa') {
  const dir = path.join(root, 'group', id)
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(path.join(dir, 'session.json'), JSON.stringify({ id, workspacePaths: [workspace] }))
  const file = path.join(dir, 'messages.jsonl')
  fs.writeFileSync(file, '')
  return file
}
it('selects only the matching workspace', () => {
  session('ours'); session('other', '/different')
  expect(discoverSessions(root, '/qa').map(s => s.id)).toEqual(['ours'])
})
it('buffers incomplete records and never replays an append', () => {
  const file = session('ours')
  const tail = new SessionTail(file)
  fs.appendFileSync(file, '{"payload":')
  expect(tail.read()).toEqual([])
  fs.appendFileSync(file, '{"type":"turn_end"}}\n')
  expect(tail.read()).toEqual([{ payload: { type: 'turn_end' } }])
  expect(tail.read()).toEqual([])
})
it('preserves a UTF-8 character split across writes and resets after truncation', () => {
  const file = session('unicode')
  const tail = new SessionTail(file)
  const bytes = Buffer.from('{"content":"你好"}\n')
  const split = bytes.indexOf(Buffer.from('你')) + 1
  fs.appendFileSync(file, bytes.subarray(0, split))
  expect(tail.read()).toEqual([])
  fs.appendFileSync(file, bytes.subarray(split))
  expect(tail.read()).toEqual([{ content: '你好' }])
  fs.writeFileSync(file, '{}\n')
  expect(tail.read()).toEqual([{}])
})
it('routes a final question from disk and ignores an older session finishing late', () => {
  const file = session('ours')
  const other = session('older')
  let current: StatusPayload | null = null
  const monitor = new KiroSessionMonitor('/qa', value => { current = value }, () => current, root)
  const now = Date.now() + 10
  const append = (f: string, type: string, n: number, payload = {}) => fs.appendFileSync(f,
    JSON.stringify({ timestamp: new Date(now + n).toISOString(), payload: { type, executionId: f, ...payload } }) + '\n')
  append(other, 'turn_start', 0)
  append(file, 'turn_start', 1)
  append(file, 'assistant', 2, { content: 'Please choose Friendly or Formal.' })
  append(file, 'turn_end', 3, { stopReason: 'end_turn' })
  monitor.tick()
  expect(current).toMatchObject({ sessionId: 'ours', status: 'asking' })
  append(other, 'turn_end', 4, { stopReason: 'error' })
  monitor.tick()
  expect(current).toMatchObject({ sessionId: 'ours', status: 'asking' })
  monitor.stop()
})
it('follows declared Spec subagents, holds their input, and ignores child completion', () => {
  const file = session('spec')
  const now = Date.now()
  const record = (type: string, n: number, extra = {}) => JSON.stringify({
    timestamp: new Date(now + n).toISOString(), payload: { type, executionId: 'parent', ...extra },
  }) + '\n'
  fs.writeFileSync(file, record('turn_start', 0) + record('sub_agent_start', 1, {
    parentExecutionId: 'parent', subSessionId: 'child', subAgentName: 'feature-requirements-first-workflow',
  }))
  const dir = path.join(path.dirname(file), 'sub-executions')
  fs.mkdirSync(dir)
  fs.writeFileSync(path.join(dir, 'child.jsonl'), record('pending_interaction', 2, { toolCallId: 'choice' }) +
    record('turn_end', 3, { stopReason: 'end_turn' }))
  fs.writeFileSync(path.join(dir, 'unrelated.jsonl'), record('turn_end', 4, { stopReason: 'error' }))
  const reader = new SessionRecords(file)
  const flow = new SessionFlow('spec')
  for (const event of reader.read()) flow.consume(event)
  expect(flow.current).toMatchObject({ status: 'asking', phase: 'requirements', turnId: 'parent' })
  expect(reader.read()).toEqual([])
  fs.appendFileSync(file, record('user', 5) + record('turn_start', 6, { executionId: 'next' }))
  fs.appendFileSync(path.join(dir, 'child.jsonl'), record('interaction_resolved', 7, {
    toolCallId: 'choice', selectedOption: 'reject',
  }))
  for (const event of reader.read()) flow.consume(event)
  expect(flow.current).toMatchObject({ status: 'working', turnId: 'next' })
})
it('restores only the persisted active turn when restarting during a pending approval', () => {
  const file = session('active')
  const then = Date.now() - 10000
  const records = [
    { timestamp: new Date(then).toISOString(), payload: { type: 'turn_start', executionId: 'turn' } },
    { timestamp: new Date(then + 1).toISOString(), payload: { type: 'pending_interaction', executionId: 'turn', toolCallId: 'approve' } },
  ]
  fs.writeFileSync(file, records.map(r => JSON.stringify(r)).join('\n') + '\n')
  let current: StatusPayload = { status: 'asking', message: 'Old wording', timestamp: then + 1,
    source: 'session-event', sessionId: 'active', turnId: 'turn', turnStartedAt: then }
  const publish = jest.fn((value: StatusPayload) => { current = value })
  new KiroSessionMonitor('/qa', publish, () => current, root).tick()
  expect(publish).toHaveBeenCalledTimes(1)
  expect(current).toMatchObject({ status: 'asking', message: 'Kiro is waiting for your input' })
  publish.mockClear()
  current = { status: 'idle', message: 'Manually reset', timestamp: Date.now(), source: 'manual' }
  new KiroSessionMonitor('/qa', publish, () => current, root).tick()
  expect(publish).not.toHaveBeenCalled()
})
