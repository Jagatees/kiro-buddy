/**
 * @jest-environment jsdom
 */

import type { AnimationKey, StatusPayload } from '../../src/shared/types'
import {
  animationKeyForPayload,
  formatStatusLabel,
  shouldLoopPayload,
} from '../../src/renderer/pet'

function payload(overrides: Partial<StatusPayload>): StatusPayload {
  return {
    status: 'idle',
    message: 'test',
    timestamp: 1700000000000,
    ...overrides,
  }
}

describe('renderer status payload animation mapping', () => {
  const cases: Array<[Partial<StatusPayload>, AnimationKey, string, boolean]> = [
    [{ status: 'idle' }, 'idle', 'Kiro Ready', true],
    [{ status: 'working' }, 'working', 'Kiro Working', true],
    [{ status: 'waiting' }, 'asking', 'Kiro Waiting', true],
    [{ status: 'asking' }, 'asking', 'Kiro Asking', true],
    [{ status: 'done' }, 'done', 'Kiro Done', true],
    [{ status: 'error' }, 'idle', 'Kiro Error', true],
    [{ status: 'working', phase: 'design' }, 'working', 'Design Working', true],
    [{ status: 'working', phase: 'requirements' }, 'working', 'Requirements Working', true],
    [{ status: 'working', phase: 'tasks' }, 'working', 'Task List Working', true],
    [{ status: 'done', phase: 'design' }, 'done', 'Design Done', true],
    [{ status: 'done', phase: 'requirements' }, 'done', 'Requirements Done', true],
    [{ status: 'done', phase: 'tasks' }, 'done', 'Task List Done', true],
    [{ status: 'asking', phase: 'design' }, 'asking', 'Design Asking', true],
    [{ status: 'waiting', phase: 'requirements' }, 'asking', 'Requirements Waiting', true],
    [{ status: 'error', phase: 'tasks' }, 'idle', 'Task List Error', true],
  ]

  it.each(cases)(
    'maps %j to animation %s, label %s, loop=%s',
    (partialPayload, expectedAnimation, expectedLabel, expectedLoop) => {
      const statusPayload = payload(partialPayload)

      expect(animationKeyForPayload(statusPayload)).toBe(expectedAnimation)
      expect(formatStatusLabel(statusPayload)).toBe(expectedLabel)
      expect(shouldLoopPayload(statusPayload)).toBe(expectedLoop)
    },
  )

})
