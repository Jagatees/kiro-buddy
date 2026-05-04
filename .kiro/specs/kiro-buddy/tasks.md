# Implementation Plan: Kiro Buddy

## Overview

Build the Kiro Buddy Electron overlay application in TypeScript. The implementation follows the project structure defined in the design, wiring together the OverlayWindow, StatusManager, PetStateMachine, AnimationRenderer, TooltipBubble, ToastNotifier, and DragHandler components into a cohesive floating desktop pet that reflects Kiro agent activity in real time.

## Tasks

- [x] 1. Initialize project structure and shared types
  - Create the `kiro-buddy/` directory tree: `src/main/`, `src/renderer/`, `src/shared/`, `assets/animations/`, `tests/unit/`, `tests/property/`
  - Create `package.json` with all production and dev dependencies pinned to the versions in the design (`electron@^30.0.0`, `chokidar@^3.6.0`, `lottie-web@^5.12.2`, `electron-store@^8.2.0`, `electron-builder@^24.13.3`, `jest@^29.7.0`, `fast-check@^3.19.0`, `typescript@^5.4.5`, `eslint@^9.3.0`)
  - Create `tsconfig.json` targeting ES2020 with strict mode, separate configs for main and renderer processes
  - Create `electron-builder.config.js` for packaging
  - Create `src/shared/types.ts` defining `AgentStatus`, `PetState`, `AnimationKey`, `StatusPayload`, `AppConfig`, `OverlayWindowConfig`, `AnimationConfig`, `NotificationConfig`, and `StateTransition` interfaces exactly as specified in the design
  - Create `src/shared/constants.ts` defining `STATE_TO_ANIMATION_MAP`, `DEBOUNCE_MS` (50), `AUTO_HIDE_MS` (4000), `DRAG_THROTTLE_MS` (16), `TOOLTIP_MAX_CHARS` (60), `MESSAGE_MAX_CHARS` (120), `STATE_TITLES`, and `VALID_TRANSITIONS`
  - _Requirements: 1.1, 2.1, 4.1, 5.1–5.5, 9.1_

- [x] 2. Implement StatusPayload validation
  - [x] 2.1 Implement `validateStatusPayload()` in `src/shared/types.ts` (or a dedicated `src/shared/validation.ts`)
    - Validate `status` is one of the five `AgentStatus` enum values
    - Validate `message` is a non-empty string of at most 120 characters
    - Validate `timestamp` is a positive integer
    - Return `false` for null, non-object, or any field that is missing, wrong type, or out of range
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 2.2 Write property test for `validateStatusPayload()` — valid payloads always pass
    - **Property 1: Valid StatusPayload passes validation**
    - Use `fast-check` to generate arbitrary objects with valid `status`, `message` (1–120 chars), and positive integer `timestamp`
    - Assert `validateStatusPayload()` returns `true` for all generated inputs
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [x] 2.3 Write property test for `validateStatusPayload()` — invalid payloads always fail
    - **Property 2: Invalid StatusPayload fails validation**
    - Use `fast-check` to generate objects with one field mutated to be missing, wrong type, or out of range
    - Assert `validateStatusPayload()` returns `false` for all generated inputs
    - **Validates: Requirements 3.1, 3.2, 3.3**

  - [x] 2.4 Write unit tests for `validateStatusPayload()`
    - Test each valid `AgentStatus` value
    - Test boundary values: message of length 1, 60, 120, 121; timestamp of 1, 0, -1, 1.5
    - Test missing fields, null payload, non-object payload
    - _Requirements: 3.1, 3.2, 3.3_

- [x] 3. Implement AppConfig persistence with `electron-store`
  - [x] 3.1 Create `src/main/configStore.ts` wrapping `electron-store`
    - Define schema matching `AppConfig` interface
    - Implement `getConfig()`, `setWindowPosition(x, y)`, `setNotificationPrefs(prefs)`, `setClickThrough(enabled)` helpers
    - On first run (no existing config), write defaults: position `(100, 100)`, notifications enabled for `done` and `error`, click-through disabled, poll interval 500ms
    - Store at `~/.kiro-buddy/config.json`
    - _Requirements: 9.1, 9.2, 9.5_

  - [x] 3.2 Write unit tests for `configStore`
    - Test default value creation when no config exists
    - Test that `setWindowPosition` persists and `getConfig` returns updated values
    - Test notification preference persistence
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [x] 4. Implement OverlayWindow
  - [x] 4.1 Create `src/main/overlayWindow.ts` implementing the `OverlayWindow` interface
    - `create(config)`: create a `BrowserWindow` with `alwaysOnTop: true`, `transparent: true`, `frame: false`, `skipTaskbar: true`, `contextIsolation: true`, `nodeIntegration: false`, dimensions 120×120
    - `setPosition(x, y)`: call `win.setPosition(x, y)`
    - `setClickThrough(enabled)`: call `win.setIgnoreMouseEvents(enabled)`
    - `show()` / `hide()`: delegate to `BrowserWindow`
    - Restore last saved position from `configStore` on creation; default to `(100, 100)` if none saved
    - Implement retry logic: if `BrowserWindow` creation throws, retry after 2 seconds up to 3 times, then exit gracefully
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 10.1, 10.2, 11.1_

  - [x] 4.2 Write unit tests for `overlayWindow`
    - Test that `BrowserWindow` is created with correct properties (`alwaysOnTop`, `transparent`, `frame`, `skipTaskbar`, `contextIsolation`, `nodeIntegration`)
    - Test position restore from config and default fallback
    - Test retry logic on creation failure (mock `BrowserWindow` to throw)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 10.1, 10.2, 11.1_

- [x] 5. Implement StatusManager
  - [x] 5.1 Create `src/main/statusManager.ts` implementing the `StatusManager` interface
    - `initialize(filePath)`: validate `filePath` against path traversal (reject paths containing `../`, `..\`, or absolute paths outside expected directories); if file missing, create it with default `idle` payload; read and dispatch initial state
    - `startWatching()`: initialize `chokidar` watcher with `awaitWriteFinish: { stabilityThreshold: 50, pollInterval: 10 }`, `ignoreInitial: false`; register `change` and `add` handlers that call `processStatusUpdate()`
    - `stopWatching()`: close the chokidar watcher and release resources
    - `onStatusChange(callback)`: register subscriber callbacks
    - `getCurrentStatus()`: return last valid `StatusPayload` or `null`
    - Implement `processStatusUpdate(filePath)` per the design pseudocode: read file, parse JSON in try/catch (no `eval()`), validate payload, debounce within 50ms window, dispatch to subscribers
    - Log warnings for IO errors, parse errors, and validation failures without propagating exceptions
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.4, 3.5, 3.6, 11.3, 11.4, 11.5_

  - [x] 5.2 Write property test for StatusManager — invalid input leaves state unchanged
    - **Property 3: Invalid input leaves pet state unchanged**
    - Use `fast-check` to generate arbitrary strings (invalid JSON) and arbitrary objects that fail schema validation
    - Assert that after processing such inputs, `getCurrentStatus()` equals the pre-update state
    - **Validates: Requirements 3.4, 3.5**

  - [x] 5.3 Write property test for StatusManager — valid payload is dispatched
    - **Property 4: Valid StatusPayload is dispatched to the state machine**
    - Use `fast-check` to generate valid `StatusPayload` objects
    - Assert that the subscriber callback is called with the correct `status` and `message`
    - **Validates: Requirements 2.4**

  - [x] 5.4 Write property test for StatusManager — debounce processes only the last update
    - **Property 5: Debounce processes only the most recent update**
    - Use `fast-check` to generate sequences of N valid payloads written within a 50ms window
    - Assert the subscriber is called exactly once with the last payload's values
    - **Validates: Requirements 2.5**

  - [x] 5.5 Write unit tests for `statusManager`
    - Test file missing on init: file created with idle defaults, idle dispatched
    - Test malformed JSON: warning logged, state unchanged
    - Test schema validation failure: warning logged, state unchanged
    - Test IO error: warning logged, state unchanged
    - Test path traversal rejection: `../` and absolute paths outside expected dir
    - Test `stopWatching()` closes the watcher
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.4, 3.5, 3.6, 11.3_

- [x] 6. Checkpoint — core data pipeline complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement PetStateMachine
  - [x] 7.1 Create `src/renderer/stateMachine.ts` implementing the `PetStateMachine` interface
    - Initialize to `idle` state on construction
    - `dispatch(newState, message)`: validate transition against `VALID_TRANSITIONS` from constants; if invalid, log `"Invalid transition: <from> → <to>"` and return; if valid, update current state, trigger animation, update tooltip, fire toast for `done`/`error`, notify all transition listeners
    - `getCurrentState()`: return current `PetState`
    - `onTransition(callback)`: register listener; each listener receives `(previousState, newState)` exactly once per transition
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 10.4_

  - [x] 7.2 Write property test for PetStateMachine — valid transitions update state and trigger animation
    - **Property 6: Valid state transitions update state and trigger animation**
    - Use `fast-check` to generate valid `(from, to)` pairs from the transition table
    - Assert `getCurrentState() === to` and `animationRenderer.play()` called with correct animation key
    - **Validates: Requirements 4.1, 4.2**

  - [x] 7.3 Write property test for PetStateMachine — invalid transitions leave state unchanged
    - **Property 7: Invalid state transitions leave state unchanged**
    - Use `fast-check` to generate `(from, to)` pairs NOT in the valid transition table
    - Assert `getCurrentState()` remains `from` and animation renderer is not called
    - **Validates: Requirements 4.1, 4.3**

  - [x] 7.4 Write property test for PetStateMachine — state-to-animation mapping is correct
    - **Property 8: State-to-animation mapping is correct for all states**
    - For each valid `PetState`, dispatch a valid transition to that state and assert the correct `AnimationKey` and loop setting
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

  - [x] 7.5 Write property test for PetStateMachine — transition listeners receive correct values
    - **Property 16: Transition listeners receive correct from/to values**
    - Use `fast-check` to generate sequences of valid transitions and N registered listeners
    - Assert each listener is called exactly once per transition with the correct `(previousState, newState)` pair
    - **Validates: Requirements 4.5**

  - [x] 7.6 Write unit tests for `stateMachine`
    - Test all 9 valid transitions succeed and update state
    - Test all invalid transitions are rejected with correct log message
    - Test initialization to `idle`
    - Test empty message hides tooltip
    - Test toast fired for `done` and `error` only
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 8. Implement AnimationRenderer
  - [x] 8.1 Create `src/renderer/animationRenderer.ts` implementing the `AnimationRenderer` interface
    - Pre-load all five Lottie JSON files from `assets/animations/` (`breathe.json`, `typing.json`, `confused.json`, `bounce.json`, `shake.json`) at startup using `lottie-web`
    - `play(config)`: stop current animation, load and play the Lottie animation for `config.key` at `config.speed`; set loop per config; for `done` (×3) and `error` (×2), use `lottie.setLoop(false)` and listen for `complete` event to replay the correct number of times
    - `stop()`: stop and destroy the current Lottie instance
    - `getCurrentAnimation()`: return the currently playing `AnimationKey` or `null`
    - If a Lottie asset is missing, fall back to CSS keyframe animation for that state and log a warning
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [ ] 8.2 Write property test for AnimationRenderer — starting a new animation stops the previous one
    - **Property 9: Starting a new animation stops the previous one**
    - Use `fast-check` to generate sequences of `play()` calls with arbitrary `AnimationKey` values
    - Assert that at any point in time at most one animation is playing (previous is stopped before new one starts)
    - **Validates: Requirements 5.6**

  - [x] 8.3 Write unit tests for `animationRenderer`
    - Test each state plays the correct animation key
    - Test `done` plays exactly 3 times and `error` plays exactly 2 times
    - Test that `play()` stops the previous animation before starting the new one
    - Test CSS fallback when Lottie asset is missing
    - Test `getCurrentAnimation()` returns correct key while playing and `null` after stop
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

- [ ] 9. Implement TooltipBubble
  - [x] 9.1 Create `src/renderer/tooltipBubble.ts` implementing the `TooltipBubble` interface
    - Render a speech-bubble-style `<div>` positioned above the pet character in `index.html`
    - `show(message)`: truncate message to 60 characters with ellipsis if longer, display the bubble
    - `hide()`: hide the bubble
    - `update(message)`: update text content (with same truncation logic) without hiding/showing
    - `setAutoHide(durationMs)`: set a `setTimeout` to call `hide()` after `durationMs`; cancel any existing timer first
    - For `working` and `waiting` states: do not call `setAutoHide()` (tooltip persists)
    - For `done` and `error` states: call `setAutoHide(4000)`
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

  - [ ] 9.2 Write property test for TooltipBubble — tooltip displays any non-empty message
    - **Property 10: Tooltip displays any non-empty message**
    - Use `fast-check` to generate arbitrary non-empty strings
    - Assert that `show(message)` displays the message; for messages > 60 chars, assert displayed text is exactly 60 chars + ellipsis
    - **Validates: Requirements 6.1, 6.5**

  - [ ] 9.3 Write property test for TooltipBubble — tooltip persists during working and waiting
    - **Property 11: Tooltip persists during working and waiting states**
    - Assert that when the state machine is in `working` or `waiting`, no auto-hide timer is set
    - **Validates: Requirements 6.3**

  - [x] 9.4 Write unit tests for `tooltipBubble`
    - Test `show()` with message ≤ 60 chars: displayed as-is
    - Test `show()` with message > 60 chars: truncated with ellipsis
    - Test `hide()` hides the bubble
    - Test `setAutoHide()` hides after the specified duration
    - Test that a second `setAutoHide()` call cancels the first timer
    - _Requirements: 6.1, 6.2, 6.4, 6.5_

- [ ] 10. Implement ToastNotifier
  - [x] 10.1 Create `src/main/toastNotifier.ts` implementing the `ToastNotifier` interface
    - `configure(config)`: store notification preferences
    - `notify(title, body)`: if `config.enabled` is `false`, return immediately; if the overlay window is focused, suppress the notification; otherwise fire an OS-native notification using Electron's `Notification` API
    - Wire `onDone` and `onError` flags: only fire for `done` transitions when `onDone` is true, and for `error` transitions when `onError` is true
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [ ] 10.2 Write property test for ToastNotifier — notifications suppressed when disabled
    - **Property 14: Notifications suppressed when disabled**
    - Use `fast-check` to generate arbitrary `done`/`error` state transitions
    - Assert that when `notifications.enabled` is `false`, `Notification` is never called
    - **Validates: Requirements 7.4**

  - [x] 10.3 Write unit tests for `toastNotifier`
    - Test notification fires for `done` when enabled
    - Test notification fires for `error` when enabled
    - Test notification suppressed when `enabled: false`
    - Test notification suppressed when overlay window is focused
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 11. Implement DragHandler and IPC position channel
  - [x] 11.1 Create `src/renderer/pet.ts` implementing the `DragHandler` interface
    - `attach(element)`: register `mousedown`, `mousemove`, `mouseup` listeners on the element
    - On `mousedown`: record `dragOffset`
    - On `mousemove` while dragging: throttle to one IPC message per 16ms; compute new position using the drag algorithm from the design; send `ipcRenderer.send('move-window', { x, y })`
    - On `mouseup`: clear `dragOffset`, send final position via IPC, persist to config
    - `detach()`: remove all event listeners
    - `onPositionChange(callback)`: register position change listener
    - _Requirements: 8.1, 8.2, 8.4, 8.5_

  - [x] 11.2 Create `src/main/ipcHandlers.ts` handling the `move-window` IPC channel
    - Register `ipcMain.on('move-window', (event, { x, y }) => ...)` handler
    - Clamp `(x, y)` to screen bounds so the window stays fully visible: `0 ≤ x ≤ screenWidth - 120`, `0 ≤ y ≤ screenHeight - 120`
    - Call `overlayWindow.setPosition(clampedX, clampedY)`
    - Call `configStore.setWindowPosition(clampedX, clampedY)` to persist
    - Expose only the `move-window` channel; reject any other IPC messages
    - _Requirements: 8.2, 8.3, 8.4, 9.3, 11.2_

  - [ ] 11.3 Write property test for DragHandler — drag clamping invariant
    - **Property 12: Drag clamping invariant**
    - Use `fast-check` to generate arbitrary `mouseEvent` sequences, `windowBounds`, and `screenBounds` (where `screenBounds > windowBounds`)
    - Assert all returned positions satisfy `0 ≤ x ≤ screenBounds.width - windowBounds.width` and `0 ≤ y ≤ screenBounds.height - windowBounds.height`
    - **Validates: Requirements 8.3**

  - [x] 11.4 Write unit tests for `dragHandler`
    - Test drag start records offset
    - Test drag move sends throttled IPC messages
    - Test drag end clears offset and persists position
    - Test no movement when not dragging (mousemove without prior mousedown)
    - Test clamping at each screen edge (top, bottom, left, right)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 12. Checkpoint — all components implemented
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Create renderer HTML shell and wire renderer components
  - [x] 13.1 Create `src/renderer/index.html`
    - Minimal HTML shell with a container `<div>` for the pet character and a tooltip `<div>` above it
    - Load `pet.ts` (compiled) as the renderer entry script
    - No inline scripts; use `Content-Security-Policy` meta tag restricting to local resources only
    - _Requirements: 11.1_

  - [x] 13.2 Wire renderer components in `src/renderer/pet.ts`
    - Instantiate `PetStateMachine`, `AnimationRenderer`, `TooltipBubble`
    - Pass `AnimationRenderer` and `TooltipBubble` references into `PetStateMachine` so transitions trigger the correct UI updates
    - Attach `DragHandler` to the pet container element
    - Listen for state change events from the main process (via `contextBridge`-exposed IPC) and call `stateMachine.dispatch()`
    - _Requirements: 4.2, 5.1–5.5, 6.1–6.5_

- [x] 14. Create Electron main process entry and wire all main components
  - Create `src/main/index.ts` as the Electron main process entry point
  - On `app.whenReady()`: load `AppConfig` from `configStore`, create `OverlayWindow`, initialize `StatusManager` with `config.statusFilePath`, start watching
  - Register `StatusManager.onStatusChange` callback that sends the new status to the renderer via `win.webContents.send('status-update', payload)`
  - Register IPC handlers from `ipcHandlers.ts`
  - Register `ToastNotifier` as a transition listener (fire on `done`/`error`)
  - Handle `app.on('window-all-closed')` and `app.on('before-quit')` to call `statusManager.stopWatching()` and clean up
  - Handle `process.on('uncaughtException', ...)` to log errors without crashing the overlay
  - _Requirements: 1.5, 2.6, 9.1, 10.5, 11.2_

- [x] 15. Expose IPC bridge via `contextBridge` (preload script)
  - Create `src/main/preload.ts` as the Electron preload script
  - Use `contextBridge.exposeInMainWorld('kiroBuddy', { onStatusUpdate: (cb) => ipcRenderer.on('status-update', cb) })` to expose only the status update channel to the renderer
  - Reference the preload script in `overlayWindow.ts` when creating the `BrowserWindow`
  - _Requirements: 11.1, 11.2_

- [x] 16. Add placeholder Lottie animation assets
  - Create minimal valid Lottie JSON placeholder files for all five animations in `assets/animations/`: `breathe.json`, `typing.json`, `confused.json`, `bounce.json`, `shake.json`
  - Each placeholder should be a valid Lottie JSON structure (with `v`, `fr`, `ip`, `op`, `w`, `h`, `layers` fields) so the renderer can load them without errors
  - Add CSS keyframe fallback animations in a `src/renderer/animations.css` file for all five states (`breathe`, `typing`, `confused`, `bounce`, `shake`)
  - _Requirements: 5.7, 5.8_

- [ ] 17. Implement window position persistence and restore
  - [x] 17.1 Verify `OverlayWindow.create()` reads position from `configStore` and applies it
    - Confirm default `(100, 100)` is used when no saved position exists
    - _Requirements: 1.3, 1.4, 9.3_

  - [ ] 17.2 Write property test for window position persistence and restore
    - **Property 13: Window position is persisted and restored**
    - Use `fast-check` to generate arbitrary valid screen positions `(x, y)`
    - Assert that after `setWindowPosition(x, y)`, `getConfig().window` contains `(x, y)`, and a new `OverlayWindow` created from that config is positioned at `(x, y)`
    - **Validates: Requirements 1.3, 8.4, 9.3**

- [ ] 18. Implement path traversal security validation
  - [x] 18.1 Implement `validateStatusFilePath(filePath)` in `statusManager.ts`
    - Reject paths containing `../`, `..\`, or null bytes
    - Reject absolute paths that resolve outside the user's home directory or a configured allowed base path
    - Return `false` and log a warning for any rejected path; do not initialize the watcher
    - _Requirements: 11.3_

  - [ ] 18.2 Write property test for path traversal rejection
    - **Property 15: Path traversal is rejected**
    - Use `fast-check` to generate path strings containing `../`, `..\`, or absolute paths outside the expected directory
    - Assert `validateStatusFilePath()` returns `false` for all such inputs
    - **Validates: Requirements 11.3**

- [ ] 19. Final integration and wiring verification
  - [ ] 19.1 Write integration tests in `tests/unit/` verifying the end-to-end status update flow
    - Write a valid `status.json` and assert the pet UI state updates within 200ms
    - Simulate 10 rapid writes within 100ms and assert the final state matches the last write (debounce)
    - Verify window stays within screen bounds after drag to each corner
    - Verify toast fires exactly once per `done`/`error` transition
    - _Requirements: 2.3, 2.5, 8.3, 7.1, 7.2, 12.3_

  - [x] 19.2 Verify `electron-builder.config.js` is correctly configured
    - Confirm entry points, output directories, and asset inclusion (`assets/animations/`) are correct
    - Confirm preload script is included in the build
    - _Requirements: 5.8_

- [ ] 20. Final checkpoint — all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP delivery
- Each task references specific requirements for traceability
- Checkpoints at tasks 6, 12, and 20 ensure incremental validation
- Property tests use `fast-check` as specified in the design's testing strategy
- Unit tests use `jest` as the test runner
- The design uses TypeScript throughout — all implementation files are `.ts`
- Lottie animation assets in `assets/animations/` are placeholders; replace with real designer assets before shipping
- The `move-window` IPC channel is the only channel exposed between renderer and main process (Requirement 11.2)
