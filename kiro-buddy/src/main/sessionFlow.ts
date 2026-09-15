import path from 'path'
import type { StatusPayload, SpecPhase } from '../shared/types'

type RecordValue = Record<string, unknown>
export function object(value: unknown): RecordValue {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as RecordValue : {}
}

/** Conservative English requests for a required reply, never punctuation alone. */
export function requestsUserReply(content: string): boolean {
  const prose = content.replace(/```[\s\S]*?```/g, '').split('\n')
    .filter(line => !/^\s*>/.test(line)).join('\n')
  // Only the closing request matters; questions quoted in an explanation do not.
  const closing = prose.trim().split(/\n\s*\n/).slice(-2).join(' ').slice(-900)
  const required = /\b(?:please|could you|can you)\s+(?:choose|select|confirm|provide|specify|tell me|share)\b/i
  const choice = /\b(?:which|what)\b[^.!?\n]{0,180}\b(?:would you (?:like|prefer)|do you (?:want|prefer)|should (?:I|we))\b[^.!?\n]*\?/i
  const preference = /\bwould you (?:like|prefer)\b[^.!?\n]{0,160}\b(?:or|to (?:proceed|continue)|me to (?:proceed|continue))\b[^.!?\n]*\?/i
  const approval = /\b(?:do you approve|(?:may|can|should) (?:I|we) (?:proceed|continue)|does (?:this|the (?:design|requirements|task list)) look (?:good|correct))\b[^.!?\n]*\?/i
  const dependency = /\b(?:once|after|when) you (?:approve|confirm|choose|select|provide)\b[^.!?]{0,160}\b(?:I|we) (?:can|will) (?:proceed|continue|create|generate)\b/i
  const missing = /\b(?:I (?:need|require)|before (?:I|we) (?:can |)(?:proceed|continue)|waiting for your (?:answer|response|confirmation))\b/i
  const optional = /\b(?:anything else|let me know if|if you(?:'d| would) like|feel free|optional)\b/i
  return closing.split(/(?<=[.!?])\s+/).some(sentence => !optional.test(sentence) &&
    (required.test(sentence) || choice.test(sentence) || preference.test(sentence) || approval.test(sentence) || dependency.test(sentence) ||
      (missing.test(sentence) && /\?|\b(?:please|your)\b/i.test(sentence))))
}

export function phaseFromPath(value: unknown): SpecPhase | undefined {
  if (typeof value !== 'string') return undefined
  const file = path.basename(value.replace(/\\/g, '/')).toLowerCase()
  return file === 'requirements.md' ? 'requirements' : file === 'design.md' ? 'design'
    : file === 'tasks.md' ? 'tasks' : undefined
}

function phaseFromRequest(value: unknown): SpecPhase | undefined {
  if (typeof value !== 'string') return undefined
  const target = value.match(/\b(?:create|generate|write|update|revise|refine|proceed (?:to|with)|continue (?:to|with))\s+(?:(?:the|a|an|initial|technical|tech|new|short)\s+){0,3}(requirements|design|tasks|task list)\b/i)?.[1]?.toLowerCase()
  if (target) return target === 'task list' ? 'tasks' : target as SpecPhase
  return phaseFromPath(value.match(/\b(requirements|design|tasks)\.md\b/i)?.[0])
}

function phaseForEvent(payload: RecordValue): SpecPhase | undefined {
  const args = object(payload.args)
  const files = object(object(payload._meta).kiro).files
  const candidates = [payload.filePath, payload.file_path, args.path, args.file_path,
    ...(Array.isArray(files) ? files.map(file => object(file).path) : [])]
  return candidates.map(phaseFromPath).find(Boolean)
}

/** One state authority per session. Only matching events can finish its active turn. */
export class SessionFlow {
  private turnId: string | undefined
  private startedAt = 0
  private awaitingStart = false
  private terminal = false
  private assistant = ''
  private pending = new Map<string, string>()
  private phase: SpecPhase | undefined
  private latest: StatusPayload | null = null

  constructor(readonly sessionId: string) {}

  get current(): StatusPayload | null { return this.latest }
  get turnStartedAt(): number { return this.startedAt }

  consume(record: unknown): StatusPayload | null {
    const envelope = object(record)
    const payload = object(envelope.payload)
    const timestamp = typeof envelope.timestamp === 'string' ? Date.parse(envelope.timestamp) : NaN
    if (!Number.isFinite(timestamp) || timestamp <= 0) return null
    const type = payload.type
    const execution = type === 'sub_agent_start' ? payload.parentExecutionId : payload.executionId
    const executionId = typeof execution === 'string' ? execution : undefined
    if (type === 'user') {
      if (timestamp <= this.startedAt) return null
      this.reset(timestamp, undefined)
      this.awaitingStart = true
      const text = typeof payload.content === 'string' ? payload.content : ''
      // Prefer a requested document action or filename over arbitrary keywords.
      this.phase = phaseFromRequest(text)
      return this.publish('working', 'Kiro is working', timestamp)
    }
    if (type === 'turn_start') {
      if (!executionId || timestamp < this.startedAt || executionId === this.turnId) return null
      const phase = this.awaitingStart ? this.phase : undefined
      this.reset(timestamp, executionId)
      this.phase = phase
      return this.publish('working', 'Kiro is working', timestamp)
    }
    if (!this.turnId || executionId !== this.turnId || timestamp < this.startedAt || this.terminal) return null
    if (type === 'sub_agent_start') {
      const name = String(payload.subAgentName)
      this.phase = phaseFromRequest(payload.prompt) ?? this.phase
      // The requirements-first workflow agent also writes design and tasks.
      // Its name is only a fallback when this turn has no document target.
      this.phase ??= /requirements/.test(name) ? 'requirements' : /design/.test(name) ? 'design'
        : /tasks/.test(name) ? 'tasks' : undefined
      return this.publish(this.pending.size ? 'asking' : 'working',
        this.pending.size ? 'Kiro is waiting for your input' : 'Kiro is working', timestamp)
    }
    if (type === 'assistant' && typeof payload.content === 'string') {
      this.assistant = payload.content
      return null
    }
    if (type === 'pending_interaction' && typeof payload.toolCallId === 'string') {
      this.phase = phaseForEvent(payload) ?? this.phase
      this.pending.set(payload.toolCallId, typeof payload.interactionType === 'string' ? payload.interactionType : 'tool_approval')
      return this.publish('asking', 'Kiro is waiting for your input', timestamp)
    }
    if (type === 'interaction_resolved' && typeof payload.toolCallId === 'string') {
      const interactionType = this.pending.get(payload.toolCallId)
      if (!this.pending.delete(payload.toolCallId)) return null
      if (['cancelled', 'canceled', 'dismissed', 'rejected', 'denied'].includes(String(payload.outcome)) ||
          (interactionType === 'tool_approval' && /^(?:reject|deny)(?:$|_)/.test(String(payload.selectedOption)))) {
        this.terminal = true
        this.pending.clear()
        this.phase = undefined
        return this.publish('idle', 'Kiro is ready', timestamp)
      }
      return this.publish(this.pending.size ? 'asking' : 'working',
        this.pending.size ? 'Kiro is waiting for your input' : 'Kiro is working', timestamp)
    }
    if (type === 'tool_call') {
      // Reading an earlier spec for context must not replace the target phase.
      if (!this.phase || /write|edit|create|update|replace|save/i.test(String(payload.toolName)) ||
          /write|edit/i.test(String(payload.kind))) this.phase = phaseForEvent(payload) ?? this.phase
      if (this.pending.size) return null
      return this.publish('working', 'Kiro is working', timestamp)
    }
    // A tool failure is not an agent failure: Kiro may retry or use another tool.
    if (type === 'turn_end') {
      const reason = String(payload.stopReason)
      if (['cancelled', 'canceled', 'aborted'].includes(reason)) {
        this.terminal = true
        this.pending.clear()
        this.phase = undefined
        return this.publish('idle', 'Kiro is ready', timestamp)
      }
      if (['error', 'failed', 'content_filtered', 'max_tokens', 'model_context_window_exceeded'].includes(reason)) {
        this.terminal = true
        this.pending.clear()
        return this.publish('error', 'Kiro could not complete this turn', timestamp)
      }
      if (this.pending.size) return this.publish('asking', 'Kiro is waiting for your input', timestamp)
      this.terminal = true
      return requestsUserReply(this.assistant)
        ? this.publish('asking', 'Kiro needs your answer', timestamp)
        : this.publish('done', 'Kiro finished', timestamp)
    }
    return null
  }

  private reset(timestamp: number, turnId: string | undefined): void {
    this.startedAt = timestamp
    this.turnId = turnId
    this.awaitingStart = false
    this.terminal = false
    this.pending.clear()
    this.assistant = ''
    this.phase = undefined
  }

  private publish(status: StatusPayload['status'], message: string, timestamp: number): StatusPayload {
    this.latest = { status, message, timestamp, sessionId: this.sessionId,
      turnId: this.turnId, turnStartedAt: this.startedAt, source: 'session-event',
      ...(this.phase ? { phase: this.phase } : {}) }
    return this.latest
  }
}
