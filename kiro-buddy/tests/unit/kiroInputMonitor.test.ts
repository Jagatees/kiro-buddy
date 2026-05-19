import { detectInputMonitorEvents, payloadAfterInputResolved } from '../../src/main/kiroInputMonitor'

describe('kiro input monitor event detection', () => {
  it('detects a cancelled pending user question as a question resolution', () => {
    const events = detectInputMonitorEvents(
      [
        '2026-05-19 20:10:00.000 [info] [Execution] adding pending user question {"id":"req-phase-confirm"}',
        '2026-05-19 20:10:02.000 [info] [Execution] cancelled pending user question req-phase-confirm',
      ].join('\n'),
    )

    expect(events).toEqual([
      {
        type: 'question',
        key: 'question:req-phase-confirm',
        questionId: 'req-phase-confirm',
        index: expect.any(Number),
      },
      {
        type: 'resolved',
        key: 'question-cancel:req-phase-confirm',
        kind: 'question',
        outcome: 'cancelled',
        index: expect.any(Number),
      },
    ])
  })

  it('detects cancelled native input prompts as command resolution', () => {
    const events = detectInputMonitorEvents(
      '2026-05-19 20:12:00.000 [info] [notification-service] inputRequired prompt cancelled by user',
    )

    expect(events).toEqual([
      {
        type: 'resolved',
        key: expect.stringMatching(/^input-cancel:/),
        kind: 'command',
        outcome: 'cancelled',
        index: expect.any(Number),
      },
    ])
  })

  it('detects an answered pending question as an answered resolution', () => {
    const events = detectInputMonitorEvents(
      [
        '2026-05-19 20:14:00.000 [info] [Execution] adding pending user question {"id":"task-approval"}',
        '2026-05-19 20:14:03.000 [info] [Execution] adding response to question task-approval',
      ].join('\n'),
    )

    expect(events).toEqual([
      {
        type: 'question',
        key: 'question:task-approval',
        questionId: 'task-approval',
        index: expect.any(Number),
      },
      {
        type: 'resolved',
        key: 'answer:task-approval',
        kind: 'question',
        outcome: 'answered',
        index: expect.any(Number),
      },
    ])
  })

  it('detects terminal command completion as a completed command resolution', () => {
    const events = detectInputMonitorEvents(
      '2026-05-19 20:16:00.000 [info] [Terminal] Command execution completed',
    )

    expect(events).toEqual([
      {
        type: 'resolved',
        key: expect.stringMatching(/^terminal:/),
        kind: 'command',
        outcome: 'completed',
        index: expect.any(Number),
      },
    ])
  })
})

describe('kiro input monitor resolution payloads', () => {
  it('returns idle when the user cancels an asking prompt', () => {
    expect(
      payloadAfterInputResolved(
        {
          status: 'asking',
          message: 'Kiro is waiting for your input',
          phase: 'requirements',
          timestamp: 1,
        },
        'cancelled',
        2,
      ),
    ).toEqual({
      status: 'idle',
      message: 'Kiro is ready',
      timestamp: 2,
    })
  })

  it('resumes working and preserves phase when the user answers a prompt', () => {
    expect(
      payloadAfterInputResolved(
        {
          status: 'asking',
          message: 'Kiro is waiting for your input',
          phase: 'tasks',
          timestamp: 1,
        },
        'answered',
        2,
      ),
    ).toEqual({
      status: 'working',
      message: 'Kiro is working',
      phase: 'tasks',
      timestamp: 2,
    })
  })

  it('does not publish a follow-up state if Buddy already left asking', () => {
    expect(
      payloadAfterInputResolved(
        {
          status: 'done',
          message: 'Kiro finished',
          timestamp: 1,
        },
        'cancelled',
        2,
      ),
    ).toBeNull()
  })
})
