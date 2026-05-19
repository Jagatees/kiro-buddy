import { detectInputMonitorEvents } from '../../src/main/kiroInputMonitor'

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
        index: expect.any(Number),
      },
    ])
  })
})
