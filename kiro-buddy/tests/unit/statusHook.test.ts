import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import type { SpecPhase, StatusPayload } from '../../src/shared/types'

const projectRoot = path.resolve(__dirname, '..', '..')
const hookPath = path.join(projectRoot, 'scripts', 'kiro-status-hook.cjs')

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kiro-buddy-status-hook-'))
}

function runHook(
  tempDir: string,
  args: string[],
  env: Record<string, string> = {},
): { result: ReturnType<typeof spawnSync>; statusFilePath: string } {
  const statusFilePath = path.join(tempDir, 'status.json')
  const result = spawnSync(process.execPath, [hookPath, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      KIRO_BUDDY_NO_AUTOSTART: '1',
      KIRO_BUDDY_STATUS_FILE: statusFilePath,
      ...env,
    },
  })

  return { result, statusFilePath }
}

function readPayload(statusFilePath: string): StatusPayload {
  return JSON.parse(fs.readFileSync(statusFilePath, 'utf8')) as StatusPayload
}

describe('kiro-status-hook spec phase payloads', () => {
  let tempDir: string
  const explicitPhaseCases: Array<[SpecPhase, string]> = [
    ['design', 'Design in progress'],
    ['requirements', 'Requirements in progress'],
    ['tasks', 'Task List in progress'],
  ]
  const userPromptCases: Array<[SpecPhase, string]> = [
    ['design', 'Please update design.md'],
    ['requirements', 'Revise the requirements acceptance criteria'],
    ['tasks', 'Continue the task list implementation'],
  ]
  const eventJsonCases: Array<[SpecPhase, string]> = [
    ['design', '{"tool":"write","path":"/repo/.kiro/specs/demo/design.md"}'],
    ['requirements', '{"tool":"write","path":"/repo/.kiro/specs/demo/requirements.md"}'],
    ['tasks', '{"tool":"write","path":"/repo/.kiro/specs/demo/tasks.md"}'],
  ]

  beforeEach(() => {
    tempDir = makeTempDir()
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })
  it('preserves structured waiting against a late modern Stop, then admits a new prompt', () => {
    const file = path.join(tempDir, 'status.json')
    const waiting = { status: 'asking', message: 'Kiro needs your answer', timestamp: Date.now(), source: 'session-event' }
    fs.writeFileSync(file, JSON.stringify(waiting))
    runHook(tempDir, ['done', '--source=agent-stop', '--session-events'])
    expect(readPayload(file)).toEqual(waiting)
    runHook(tempDir, ['working', '--source=prompt-submit', '--session-events'], {
      KIRO_BUDDY_EVENT_JSON: JSON.stringify({ session_id: 'sess-next', prompt: 'Continue' }),
    })
    expect(readPayload(file)).toMatchObject({ status: 'working', source: 'prompt-submit', sessionId: 'sess-next' })
  })

  it.each(explicitPhaseCases)('writes explicit %s working phase payloads', (phase, expectedMessage) => {
    const { result, statusFilePath } = runHook(tempDir, ['working', phase])

    expect(result.status).toBe(0)
    expect(readPayload(statusFilePath)).toMatchObject({
      status: 'working',
      phase,
      message: expectedMessage,
    })
  })

  it.each(userPromptCases)('infers %s phase from USER_PROMPT', (phase, userPrompt) => {
    const { result, statusFilePath } = runHook(tempDir, ['working'], {
      USER_PROMPT: userPrompt,
    })

    expect(result.status).toBe(0)
    expect(readPayload(statusFilePath)).toMatchObject({
      status: 'working',
      phase,
    })
  })

  it.each(eventJsonCases)('infers %s phase from Kiro event JSON', (phase, eventJson) => {
    const { result, statusFilePath } = runHook(tempDir, ['working'], {
      KIRO_BUDDY_EVENT_JSON: eventJson,
    })

    expect(result.status).toBe(0)
    expect(readPayload(statusFilePath)).toMatchObject({
      status: 'working',
      phase,
    })
  })

  it('uses a useful default when Kiro submits an empty prompt field', () => {
    const { statusFilePath } = runHook(tempDir, ['working', '--source=prompt-submit'], {
      KIRO_BUDDY_EVENT_JSON: JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: '' }),
    })
    expect(readPayload(statusFilePath).message).toBe('Kiro is working')
    expect(readPayload(statusFilePath).context).not.toBe('Prompt:')
  })

  it('records detected context for the debug panel', () => {
    const { result, statusFilePath } = runHook(tempDir, ['working'], {
      KIRO_ACTIVE_FILE: '/repo/.kiro/specs/demo/tasks.md',
    })

    expect(result.status).toBe(0)
    expect(readPayload(statusFilePath)).toMatchObject({
      status: 'working',
      phase: 'tasks',
      context: 'tasks.md',
    })
  })

  it('uses Kiro CLI prompt hook JSON for message and context', () => {
    const { result, statusFilePath } = runHook(tempDir, ['working'], {
      KIRO_BUDDY_EVENT_JSON: JSON.stringify({
        hook_event_name: 'userPromptSubmit',
        prompt: 'run the next cli test',
      }),
    })

    expect(result.status).toBe(0)
    expect(readPayload(statusFilePath)).toMatchObject({
      status: 'working',
      message: 'Prompt: run the next cli test',
      context: 'Prompt: run the next cli test',
    })
  })

  it('skips require-phase updates when no phase can be detected', () => {
    const { result, statusFilePath } = runHook(tempDir, ['working', '--require-phase'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Kiro Buddy: skipped working without phase')
    expect(fs.existsSync(statusFilePath)).toBe(false)
  })

  it('writes status silently when quiet mode is enabled', () => {
    const { result, statusFilePath } = runHook(tempDir, ['working', '--quiet'])

    expect(result.status).toBe(0)
    expect(result.stdout).toBe('')
    expect(readPayload(statusFilePath)).toMatchObject({
      status: 'working',
      message: 'Kiro is working',
    })
  })

  it('preserves the last phase when writing done', () => {
    const first = runHook(tempDir, ['working', 'design'])
    expect(first.result.status).toBe(0)

    const second = runHook(tempDir, ['done'])
    expect(second.result.status).toBe(0)

    expect(readPayload(second.statusFilePath)).toMatchObject({
      status: 'done',
      phase: 'design',
    })
  })

  it('preserves the last phase when switching to asking', () => {
    const first = runHook(tempDir, ['working', 'tasks'])
    expect(first.result.status).toBe(0)

    const second = runHook(tempDir, ['asking'])
    expect(second.result.status).toBe(0)

    expect(readPayload(second.statusFilePath)).toMatchObject({
      status: 'asking',
      phase: 'tasks',
    })
  })

  it('does not clobber asking state when spec activity happens during input', () => {
    const first = runHook(tempDir, ['working', 'requirements'])
    expect(first.result.status).toBe(0)

    const second = runHook(tempDir, ['asking'], {
      KIRO_BUDDY_MESSAGE: 'Kiro is waiting for your input',
    })
    expect(second.result.status).toBe(0)

    const third = runHook(tempDir, ['working', 'tasks'])
    expect(third.result.status).toBe(0)
    expect(third.result.stdout).toContain('Kiro Buddy: skipped spec activity during input')

    expect(readPayload(third.statusFilePath)).toMatchObject({
      status: 'asking',
      phase: 'requirements',
    })
  })

  it('allows spec activity to resume from pre-tool asking state', () => {
    const first = runHook(tempDir, ['working', 'requirements'])
    expect(first.result.status).toBe(0)

    const second = runHook(tempDir, ['asking'])
    expect(second.result.status).toBe(0)

    const third = runHook(tempDir, [
      'working',
      'requirements',
      '--source=spec-activity',
      '--require-phase',
    ])
    expect(third.result.status).toBe(0)
    expect(third.result.stdout).toContain('Kiro Buddy: working')

    expect(readPayload(third.statusFilePath)).toMatchObject({
      status: 'working',
      phase: 'requirements',
      message: 'Requirements in progress',
    })
  })

  it('does not clobber done state when late spec activity arrives', () => {
    const first = runHook(tempDir, ['working', 'tasks'])
    expect(first.result.status).toBe(0)

    const second = runHook(tempDir, ['done'])
    expect(second.result.status).toBe(0)

    const third = runHook(tempDir, ['working', '--require-phase'], {
      KIRO_BUDDY_EVENT_JSON: JSON.stringify({
        path: '/repo/.kiro/specs/demo/tasks.md',
      }),
    })
    expect(third.result.status).toBe(0)
    expect(third.result.stdout).toContain('Kiro Buddy: skipped spec activity after done')

    expect(readPayload(third.statusFilePath)).toMatchObject({
      status: 'done',
      phase: 'tasks',
    })
  })

  it('does not clobber done state when late post-tool activity arrives', () => {
    const first = runHook(tempDir, ['working'])
    expect(first.result.status).toBe(0)

    const second = runHook(tempDir, ['done'])
    expect(second.result.status).toBe(0)

    const third = runHook(tempDir, ['working', '--source=post-tool'])
    expect(third.result.status).toBe(0)
    expect(third.result.stdout).toContain('Kiro Buddy: skipped tool activity after done')

    expect(readPayload(third.statusFilePath)).toMatchObject({
      status: 'done',
    })
  })

  it('allows a new prompt to start working after done state', () => {
    const first = runHook(tempDir, ['working'])
    expect(first.result.status).toBe(0)

    const second = runHook(tempDir, ['done'])
    expect(second.result.status).toBe(0)

    const third = runHook(tempDir, ['working', '--source=prompt-submit'])
    expect(third.result.status).toBe(0)

    expect(readPayload(third.statusFilePath)).toMatchObject({
      status: 'working',
      message: 'Kiro is working',
    })
  })
})


describe('new prompts resume work', () => {
  let tempDir: string
  beforeEach(() => { tempDir = makeTempDir() })
  afterEach(() => { fs.rmSync(tempDir, { recursive: true, force: true }) })

  it.each(['waiting', 'asking'])('resumes a requirements prompt from %s', (status) => {
    runHook(tempDir, [status], { KIRO_BUDDY_MESSAGE: 'Waiting for your input' })
    const { result, statusFilePath } = runHook(tempDir, ['working', '--source=prompt-submit'], {
      USER_PROMPT: 'Update requirements',
    })
    expect(result.status).toBe(0)
    expect(readPayload(statusFilePath)).toMatchObject({ status: 'working', phase: 'requirements' })
  })

  it('accepts a prompt without text even when a phase filter is present', () => {
    runHook(tempDir, ['done'])
    const { statusFilePath } = runHook(tempDir, ['working', '--source=prompt-submit', '--require-phase'])
    expect(readPayload(statusFilePath).status).toBe('working')
  })

  it('recognizes prompt JSON when the event source is absent', () => {
    runHook(tempDir, ['waiting'])
    const { statusFilePath } = runHook(tempDir, ['working'], {
      KIRO_BUDDY_EVENT_JSON: JSON.stringify({ prompt: 'Revise requirements' }),
    })
    expect(readPayload(statusFilePath)).toMatchObject({ status: 'working', phase: 'requirements' })
  })

  it('still ignores background spec writes while waiting', () => {
    runHook(tempDir, ['waiting'])
    const { statusFilePath } = runHook(tempDir, ['working', 'requirements', '--source=spec-activity'])
    expect(readPayload(statusFilePath).status).toBe('waiting')
  })
})
