/**
 * Shared TypeScript types for Kiro Buddy
 * Used by both main and renderer processes
 */

// ---------------------------------------------------------------------------
// Core status / state types
// ---------------------------------------------------------------------------

/** The status values that Kiro agent hooks can write to status.json */
export type AgentStatus = 'idle' | 'working' | 'waiting' | 'asking' | 'done' | 'error'

/** The current animation/display state of the pet — mirrors AgentStatus */
export type PetState = 'idle' | 'working' | 'waiting' | 'asking' | 'done' | 'error'

/** The Kiro spec-driven workflow phase that produced the status update. */
export type SpecPhase = 'design' | 'requirements' | 'tasks'

/** The set of sprite animation keys available for the pet character */
export type AnimationKey = 'idle' | 'working' | 'asking' | 'done'

// ---------------------------------------------------------------------------
// Payload / data interfaces
// ---------------------------------------------------------------------------

/**
 * The JSON object written to status.json by Kiro agent hooks.
 * Validation rules:
 *   - status must be one of the AgentStatus values
 *   - message must be a non-empty string of at most 120 characters
 *   - timestamp must be a positive integer (Unix epoch milliseconds)
 */
export interface StatusPayload {
  status: AgentStatus
  message: string    // Human-readable description, max 120 chars
  timestamp: number  // Unix epoch milliseconds
  phase?: SpecPhase   // Optional Kiro spec phase context
  context?: string     // Optional active prompt/file/task context
}

// ---------------------------------------------------------------------------
// Configuration interfaces
// ---------------------------------------------------------------------------

/**
 * Persistent application configuration stored at ~/.kiro-buddy/config.json
 */
export interface AppConfig {
  window: {
    x: number       // Last known x position, default: 100
    y: number       // Last known y position, default: 100
    width: number   // Default: 390
    height: number  // Default: 360
  }
  statusFilePath: string  // Absolute path to status.json
  notifications: NotificationConfig
  clickThrough: boolean   // default: false
  pollIntervalMs: number  // Fallback poll interval, default: 500
  petScale: number        // Pet/window scale, default: 1
}

/**
 * Configuration for the Electron BrowserWindow overlay
 */
export interface OverlayWindowConfig {
  width: number        // default: 390
  height: number       // default: 360
  x: number            // last saved x position
  y: number            // last saved y position
  alwaysOnTop: boolean // default: true
  transparent: boolean // default: true
  frame: boolean       // default: false
  skipTaskbar: boolean // default: true
}

/**
 * Configuration for a single animation playback
 */
export interface AnimationConfig {
  key: AnimationKey
  loop: boolean
  speed: number  // 1.0 = normal speed
  onComplete?: () => void
}

/**
 * User preferences for OS-level toast notifications
 */
export interface NotificationConfig {
  enabled: boolean  // Master switch for all notifications
  onDone: boolean   // Fire notification when agent reaches 'done' state
  onError: boolean  // Fire notification when agent reaches 'error' state
}

// ---------------------------------------------------------------------------
// State machine interfaces
// ---------------------------------------------------------------------------

/**
 * Describes a single valid state transition in the PetStateMachine.
 * Use '*' for `from` to match any current state.
 */
export interface StateTransition {
  from: PetState | '*'
  to: PetState
  action: () => void
}

/**
 * Controls sprite animation playback for the pet character.
 */
export interface AnimationRenderer {
  play(config: AnimationConfig): void
  stop(): void
  getCurrentAnimation(): AnimationKey | null
}

/**
 * Manages the speech-bubble tooltip overlay above the pet.
 */
export interface TooltipBubble {
  show(message: string): void
  hide(): void
  update(message: string): void
  setAutoHide(durationMs: number): void
}

/**
 * Fires OS-level toast notifications for terminal state changes.
 */
export interface ToastNotifier {
  configure(config: NotificationConfig): void
  notify(title: string, body: string): void
}

/**
 * Manages valid pet state transitions and coordinates UI updates.
 */
export interface PetStateMachine {
  dispatch(newState: PetState, message: string): boolean
  getCurrentState(): PetState
  onTransition(callback: (from: PetState, to: PetState) => void): void
}
