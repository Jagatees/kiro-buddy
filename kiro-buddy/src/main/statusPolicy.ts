import type { StatusPayload } from '../shared/types'

/** Legacy hooks remain usable, but cannot overrule an identified session turn. */
export function shouldAcceptStatus(current: StatusPayload | null, next: StatusPayload): boolean {
  if (!current) return true
  if (next.source === 'session-event') {
    if (current.turnStartedAt && next.turnStartedAt && next.turnStartedAt < current.turnStartedAt) return false
    if (current.source === 'prompt-submit' && current.sessionId !== next.sessionId &&
        current.timestamp > (next.turnStartedAt ?? 0)) return false
    // Stop hooks run after turn_end is saved. Their later clock time must not
    // prevent the authoritative terminal event from correcting their guess.
    if (['session-event', 'prompt-submit', 'manual'].includes(current.source ?? '') &&
        next.timestamp < current.timestamp) return false
    return true
  }
  if (next.timestamp < current.timestamp) return false
  if (next.source === 'prompt-submit' || next.source === 'manual') return true
  // Hooks and the legacy log watcher cannot undo a confirmed structured state.
  if (current.source === 'session-event') return false
  if (current.source === 'prompt-submit' && current.sessionId && next.sessionId !== current.sessionId) return false
  // Same-session hooks remain a fallback until the session stream claims it.
  return true
}
