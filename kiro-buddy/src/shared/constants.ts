/**
 * Shared constants for Kiro Buddy
 * Used by both main and renderer processes
 */

import type { PetState, AnimationKey } from './types'

// ---------------------------------------------------------------------------
// Timing constants
// ---------------------------------------------------------------------------

/** Debounce window for rapid status.json file changes (milliseconds) */
export const DEBOUNCE_MS = 50

/** Duration before tooltip auto-hides after 'done' or 'error' states (milliseconds) */
export const AUTO_HIDE_MS = 4000

/** Minimum interval between drag position IPC messages (milliseconds, ~60fps) */
export const DRAG_THROTTLE_MS = 16

/** Default top-left overlay position used when no saved position exists. */
export const DEFAULT_WINDOW_X = 100
export const DEFAULT_WINDOW_Y = 100

/** Compact overlay dimensions. Keep the transparent click-blocking area tight. */
export const BASE_WINDOW_WIDTH = 220
export const BASE_WINDOW_HEIGHT = 220
export const SETTINGS_MENU_WIDTH = 280
export const SETTINGS_MENU_HEIGHT = 236

/** Supported user-facing pet scale range. */
export const PET_SCALE_MIN = 0.6
export const PET_SCALE_MAX = 1.4
export const PET_SCALE_STEP = 0.05

/** Supported visual opacity range for the pet itself. */
export const PET_OPACITY_MIN = 0.35
export const PET_OPACITY_MAX = 1
export const PET_OPACITY_STEP = 0.05

// ---------------------------------------------------------------------------
// Display constants
// ---------------------------------------------------------------------------

/** Maximum characters shown in the tooltip bubble before truncation with ellipsis */
export const TOOLTIP_MAX_CHARS = 42

/** Maximum characters allowed in a StatusPayload message field */
export const MESSAGE_MAX_CHARS = 120

export function clampPetScale(scale: number): number {
  if (!Number.isFinite(scale)) {
    return 1
  }

  return Math.max(PET_SCALE_MIN, Math.min(scale, PET_SCALE_MAX))
}

export function roundPetScale(scale: number): number {
  return Math.round(clampPetScale(scale) * 100) / 100
}

export function clampPetOpacity(opacity: number): number {
  if (!Number.isFinite(opacity)) {
    return 1
  }

  return Math.max(PET_OPACITY_MIN, Math.min(opacity, PET_OPACITY_MAX))
}

export function roundPetOpacity(opacity: number): number {
  return Math.round(clampPetOpacity(opacity) * 100) / 100
}

export function windowSizeForPetScale(
  scale: number,
  settingsMenuOpen = false,
): { width: number; height: number } {
  const clampedScale = clampPetScale(scale)
  const scaledWidth = Math.round(BASE_WINDOW_WIDTH * clampedScale)
  const scaledHeight = Math.round(BASE_WINDOW_HEIGHT * clampedScale)

  return {
    width:  settingsMenuOpen ? Math.max(SETTINGS_MENU_WIDTH, scaledWidth) : scaledWidth,
    height: scaledHeight + (settingsMenuOpen ? SETTINGS_MENU_HEIGHT : 0),
  }
}

// ---------------------------------------------------------------------------
// State → Animation mapping
// ---------------------------------------------------------------------------

/**
 * Maps each PetState to its corresponding sprite AnimationKey.
 * Used by PetStateMachine to determine which animation to play on transition.
 */
export const STATE_TO_ANIMATION_MAP: Record<PetState, AnimationKey> = {
  idle: 'idle',
  working: 'working',
  waiting: 'asking',
  asking: 'asking',
  done: 'done',
  error: 'idle',
}

// ---------------------------------------------------------------------------
// Human-readable state titles (used in toast notifications)
// ---------------------------------------------------------------------------

/**
 * Maps each PetState to a human-readable title string.
 * Used as the notification title in ToastNotifier.
 */
export const STATE_TITLES: Record<PetState, string> = {
  idle: 'Kiro is ready',
  working: 'Kiro is working',
  waiting: 'Kiro is waiting for input',
  asking: 'Kiro is asking for input',
  done: 'Kiro is done',
  error: 'Kiro encountered an error',
}

// ---------------------------------------------------------------------------
// Valid state transitions
// ---------------------------------------------------------------------------

/**
 * The set of valid (from → to) state transition pairs for PetStateMachine.
 * Any transition not in this set is rejected with a warning log.
 *
 * Valid transitions:
 *   idle    → working
 *   idle    → done
 *   idle    → error
 *   working → done
 *   working → waiting
 *   working → idle
 *   working → error
 *   waiting → working
 *   waiting → idle
 *   waiting → error
 *   done    → working
 *   done    → idle
 *   done    → error
 *   error   → idle
 *   error   → working
 *   error   → done
 */
export const VALID_TRANSITIONS: ReadonlyArray<readonly [PetState, PetState]> = [
  ['idle', 'working'],
  ['idle', 'asking'],
  ['idle', 'done'],
  ['idle', 'error'],
  ['working', 'done'],
  ['working', 'waiting'],
  ['working', 'asking'],
  ['working', 'idle'],
  ['working', 'error'],
  ['waiting', 'working'],
  ['waiting', 'idle'],
  ['waiting', 'done'],
  ['waiting', 'error'],
  ['asking', 'working'],
  ['asking', 'done'],
  ['asking', 'error'],
  ['asking', 'idle'],
  ['done', 'working'],
  ['done', 'idle'],
  ['done', 'done'],
  ['done', 'error'],
  ['error', 'idle'],
  ['error', 'working'],
  ['error', 'done'],
] as const

/**
 * Checks whether a transition from `from` to `to` is valid.
 * Convenience helper used by PetStateMachine.dispatch().
 */
export function isValidTransition(from: PetState, to: PetState): boolean {
  return VALID_TRANSITIONS.some(([f, t]) => f === from && t === to)
}
