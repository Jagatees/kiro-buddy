import { SessionFlow, requestsUserReply } from '../../src/main/sessionFlow'
import { shouldAcceptStatus } from '../../src/main/statusPolicy'

const base = Date.parse('2026-09-16T00:00:00Z')
function record(type: string, n: number, extra: Record<string, unknown> = {}) {
  return { timestamp: new Date(base + n).toISOString(), payload: { type, executionId: 'turn-a', ...extra } }
}
function running() {
  const flow = new SessionFlow('qa-session')
  flow.consume(record('user', 1, { content: 'Edit requirements.md', executionId: undefined }))
  flow.consume(record('turn_start', 2))
  return flow
}

describe('session state authority', () => {
  it('holds a required reply through duplicate completion and resumes on a real answer', () => {
    const flow = running()
    flow.consume(record('assistant', 3, { content: 'Which greeting would you prefer: Friendly or Formal?' }))
    expect(flow.consume(record('turn_end', 4, { stopReason: 'end_turn' }))?.status).toBe('asking')
    expect(flow.consume(record('turn_end', 5, { stopReason: 'end_turn' }))).toBeNull()
    expect(flow.consume(record('user', 6, { content: 'Friendly', executionId: undefined }))?.status).toBe('working')
    flow.consume(record('turn_start', 7, { executionId: 'turn-b' }))
    expect(flow.consume(record('turn_end', 8, { stopReason: 'error' }))).toBeNull()
    expect(flow.current?.status).toBe('working')
  })

  it('holds all pending approvals and ignores late tool results', () => {
    const flow = running()
    for (const toolCallId of ['one', 'two']) flow.consume(record('pending_interaction', 3, { toolCallId }))
    flow.consume(record('tool_result', 4, { success: false }))
    flow.consume(record('turn_end', 5, { stopReason: 'end_turn' }))
    expect(flow.current?.status).toBe('asking')
    flow.consume(record('interaction_resolved', 6, { toolCallId: 'one', selectedOption: 'accept' }))
    expect(flow.current?.status).toBe('asking')
    flow.consume(record('interaction_resolved', 7, { toolCallId: 'two', selectedOption: 'accept' }))
    expect(flow.current?.status).toBe('working')
    flow.consume(record('turn_end', 8, { stopReason: 'end_turn' }))
    expect(flow.current?.status).toBe('done')
  })

  it.each(['error', 'max_tokens', 'content_filtered'])('reports terminal %s but allows tool retries', stopReason => {
    const flow = running()
    flow.consume(record('tool_result', 3, { success: false, content: 'Exit Code: 1' }))
    expect(flow.current?.status).toBe('working')
    expect(flow.consume(record('turn_end', 4, { stopReason }))?.status).toBe('error')
  })

  it('clears pending state after rejection and ignores its late completion', () => {
    const flow = running()
    flow.consume(record('pending_interaction', 3, { toolCallId: 'one' }))
    expect(flow.consume(record('interaction_resolved', 4, { toolCallId: 'one', selectedOption: 'reject' }))?.status).toBe('idle')
    expect(flow.consume(record('turn_end', 5, { stopReason: 'end_turn' }))).toBeNull()
  })
  it('treats a dismissed native question as cancellation, without confusing answer text with rejection', () => {
    const flow = running()
    flow.consume(record('pending_interaction', 3, { toolCallId: 'q', interactionType: 'user_input' }))
    expect(flow.consume(record('interaction_resolved', 4, { toolCallId: 'q', outcome: 'answered', selectedOption: 'reject' }))?.status).toBe('working')
    flow.consume(record('pending_interaction', 5, { toolCallId: 'q2', interactionType: 'user_input' }))
    expect(flow.consume(record('interaction_resolved', 6, { toolCallId: 'q2', outcome: 'dismissed' }))?.status).toBe('idle')
    expect(flow.consume(record('turn_end', 7, { stopReason: 'end_turn' }))).toBeNull()
  })

  it('gets the phase from the approved file path rather than unrelated file contents', () => {
    const flow = running()
    flow.consume(record('pending_interaction', 3, {
      toolCallId: 'one', _meta: { kiro: { files: [{ path: '/repo/.kiro/specs/greeting/design.md' }] } },
    }))
    expect(flow.current).toMatchObject({ status: 'asking', phase: 'design' })
  })
  it('keeps design active when the requirements-first subagent reads requirements', () => {
    const flow = new SessionFlow('spec')
    flow.consume(record('user', 1, { content: 'Proceed with design.md' }))
    flow.consume(record('turn_start', 2))
    flow.consume(record('sub_agent_start', 3, {
      parentExecutionId: 'turn-a', subAgentName: 'feature-requirements-first-workflow',
    }))
    flow.consume(record('tool_call', 4, { toolName: 'readFile', args: { path: '/spec/requirements.md' } }))
    expect(flow.current).toMatchObject({ status: 'working', phase: 'design' })
    flow.consume(record('tool_call', 5, { toolName: 'writeFile', args: { path: '/spec/tasks.md' } }))
    expect(flow.current).toMatchObject({ status: 'working', phase: 'tasks' })
  })
  it('uses the delegated document target ahead of the workflow name', () => {
    const flow = running()
    flow.consume(record('sub_agent_start', 3, {
      parentExecutionId: 'turn-a', subAgentName: 'feature-requirements-first-workflow',
      prompt: 'Create the design document. Read requirements.md for context.',
    }))
    expect(flow.current?.phase).toBe('design')
  })
  it('falls back to hooks when the session feed is unavailable', () => {
    const prompt = { status: 'working' as const, message: 'Prompt', timestamp: base, source: 'prompt-submit', sessionId: 'sess-missing' }
    expect(shouldAcceptStatus(prompt, { status: 'done', message: 'Other session', timestamp: base + 100, source: 'agent-stop', sessionId: 'other' })).toBe(false)
    expect(shouldAcceptStatus(prompt, { status: 'done', message: 'Stop', timestamp: base + 100, source: 'agent-stop', sessionId: 'sess-missing' })).toBe(true)
  })

  it('does not let stale hooks or other turns overwrite structured asking', () => {
    const flow = running()
    const pending = flow.consume(record('pending_interaction', 3, { toolCallId: 'one' }))!
    expect(shouldAcceptStatus(pending, { status: 'done', message: 'Late stop', timestamp: base + 4, source: 'agent-stop' })).toBe(false)
    expect(shouldAcceptStatus(pending, { ...pending, turnStartedAt: base, timestamp: base + 5, status: 'error' })).toBe(false)
    expect(shouldAcceptStatus(pending, { status: 'working', message: 'New prompt', timestamp: base + 6, source: 'prompt-submit' })).toBe(true)
    expect(shouldAcceptStatus(pending, { status: 'error', message: 'Manual error', timestamp: base + 6, source: 'manual' })).toBe(true)
  })
  it('lets a persisted terminal event correct a later Stop hook and preserves legacy hooks', () => {
    const flow = running()
    const error = flow.consume(record('turn_end', 4, { stopReason: 'error' }))!
    expect(shouldAcceptStatus({ status: 'done', message: 'Stop', timestamp: base + 8, source: 'agent-stop' }, error)).toBe(true)
    expect(shouldAcceptStatus({ status: 'working', message: 'Prompt', timestamp: base + 1, source: 'prompt-submit' },
      { status: 'done', message: 'Stop', timestamp: base + 8, source: 'agent-stop' })).toBe(true)
  })
})

describe('required-reply detection', () => {
  it.each([
    'Which greeting would you prefer: Friendly or Formal?',
    'Would you like to choose a greeting style: Friendly or Formal?',
    'Please confirm the requirements before I continue.',
    'Before I can proceed, could you provide the API endpoint?',
    'Do you approve the requirements?',
    'May I proceed with the design?',
    'Please confirm the requirements. Let me know if you have questions.',
    'The design is ready for your review. Once you approve, I can proceed to create the task list.',
  ])('recognizes a direct request: %s', text => expect(requestsUserReply(text)).toBe(true))
  it.each([
    'Done. Anything else?',
    'The fix is ready. Let me know if you would like anything changed.',
    'Why does this happen? Because the function trims whitespace.',
    'Example:\n```\nPlease choose one?\n```',
    '> Which greeting would you prefer?\n\nThat is an example question.',
  ])('does not mistake an optional or quoted question for waiting: %s', text => expect(requestsUserReply(text)).toBe(false))
})
