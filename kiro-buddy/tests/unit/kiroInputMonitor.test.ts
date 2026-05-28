import {
  detectInputMonitorEvents,
  payloadAfterAgentAborted,
  payloadAfterInputResolved,
} from '../../src/main/kiroInputMonitor'

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

  it.each([
    [
      'rejected',
      '2026-05-19 20:12:10.000 [info] [Execution] rejected pending user question approve-shell-run',
      /^question-cancel:approve-shell-run$/,
      'question',
    ],
    [
      'aborted',
      '2026-05-19 20:12:11.000 [info] [Execution] aborted user question approve-file-write',
      /^question-cancel:approve-file-write$/,
      'question',
    ],
    [
      'dismissed',
      '2026-05-19 20:12:12.000 [info] [notification-service] native input prompt dismissed',
      /^input-cancel:/,
      'command',
    ],
    [
      'closed',
      '2026-05-19 20:12:13.000 [info] [notification-service] user input modal closed',
      /^input-cancel:/,
      'command',
    ],
    [
      'rejected native input',
      '2026-05-19 20:12:14.000 [info] [notification-service] inputRequired request rejected by user',
      /^input-cancel:/,
      'command',
    ],
  ] as const)('detects %s input stop wording as cancelled', (_label, logLine, keyPattern, kind) => {
    const events = detectInputMonitorEvents(logLine)

    expect(events).toEqual([
      {
        type: 'resolved',
        key: expect.stringMatching(keyPattern),
        kind,
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

  it.each([
    '2026-05-28 16:04:16.903 [info] [command] kiroAgent.executions.abortActiveAgent',
    '2026-05-28 16:04:16.903 [info] [Execution] Completed with abort',
    '2026-05-28 16:04:16.906 [warning] [AgentExecution] Abort triggered, completing with abort',
  ])('detects agent abort wording as a cancel event', (logLine) => {
    const events = detectInputMonitorEvents(logLine)

    expect(events).toEqual([
      {
        type: 'agent-abort',
        key: expect.stringMatching(/^agent-abort:/),
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

  it.each(['cancelled', 'answered', 'completed'] as const)(
    'does not leave Buddy in asking after %s resolution',
    (outcome) => {
      const payload = payloadAfterInputResolved(
        {
          status: 'asking',
          message: 'Kiro is waiting for your input',
          phase: 'design',
          timestamp: 1,
        },
        outcome,
        2,
      )

      expect(payload?.status).not.toBe('asking')
      expect(payload?.status).not.toBe('waiting')
    },
  )

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

describe('kiro input monitor agent abort payloads', () => {
  it.each(['working', 'asking', 'waiting'] as const)(
    'returns idle when a %s agent run is aborted',
    (status) => {
      expect(
        payloadAfterAgentAborted(
          {
            status,
            message: 'Kiro is busy',
            timestamp: 1,
          },
          2,
        ),
      ).toEqual({
        status: 'idle',
        message: 'Kiro is ready',
        timestamp: 2,
      })
    },
  )

  it.each(['idle', 'done', 'error'] as const)('does not overwrite %s after abort logs', (status) => {
    expect(
      payloadAfterAgentAborted(
        {
          status,
          message: 'Kiro already settled',
          timestamp: 1,
        },
        2,
      ),
    ).toBeNull()
  })
})
