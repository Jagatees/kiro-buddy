# Requirements Document

## Introduction

Kiro Buddy is a floating desktop pet overlay that provides always-visible, real-time visual feedback of Kiro agent activity. It runs as a lightweight Electron application that stays on top of all other windows, displaying an animated character whose state reflects what Kiro is currently doing — idle, working, waiting for input, completed, or errored — so users can monitor AI progress without switching tabs or losing focus on their work.

The system uses a file-based status channel: Kiro hooks write a `status.json` file whenever agent state changes, and the Electron overlay watches that file to update the pet's animation and tooltip in real time. This decoupled architecture keeps the overlay independent of Kiro's internal process.

## Glossary

- **Kiro_Buddy**: The Electron-based floating desktop pet overlay application
- **OverlayWindow**: The frameless, transparent, always-on-top Electron `BrowserWindow` that hosts the pet UI
- **StatusManager**: The component responsible for watching `status.json`, parsing payloads, and dispatching state changes
- **PetStateMachine**: The finite state machine that manages valid pet state transitions and coordinates UI updates
- **AnimationRenderer**: The component that plays Lottie or CSS animations corresponding to each pet state
- **TooltipBubble**: The speech-bubble-style overlay that displays status messages above the pet character
- **ToastNotifier**: The component that fires OS-level native notifications for terminal state changes
- **DragHandler**: The component that enables the user to reposition the pet by dragging it
- **StatusPayload**: The JSON object written to `status.json` containing `status`, `message`, and `timestamp` fields
- **AppConfig**: The persistent configuration object stored at `~/.kiro-buddy/config.json`
- **AgentStatus**: One of five valid status values: `idle`, `working`, `waiting`, `done`, or `error`
- **PetState**: The current animation/display state of the pet, mirroring `AgentStatus`
- **FileWatcher**: The `chokidar`-based file system watcher that monitors `status.json` for changes

---

## Requirements

### Requirement 1: Overlay Window Creation and Display

**User Story:** As a developer, I want a floating pet overlay that stays on top of all my windows, so that I can always see Kiro's activity status without switching applications.

#### Acceptance Criteria

1. WHEN the Kiro_Buddy application starts, THE OverlayWindow SHALL create a frameless, transparent, always-on-top `BrowserWindow` with dimensions of 120×120 pixels.
2. THE OverlayWindow SHALL set `skipTaskbar` to `true` so the overlay does not appear in the OS taskbar.
3. THE OverlayWindow SHALL restore the window to the last saved screen position from AppConfig on startup.
4. IF no saved position exists in AppConfig, THE OverlayWindow SHALL default to position `(100, 100)`.
5. WHEN the Electron `app` is ready, THE OverlayWindow SHALL display the pet UI immediately after initialization completes.
6. THE OverlayWindow SHALL support toggling click-through mode via `setIgnoreMouseEvents()` based on the `clickThrough` AppConfig value.

---

### Requirement 2: Status File Watching and Parsing

**User Story:** As a developer, I want the overlay to automatically reflect Kiro's current activity by reading a shared status file, so that I get real-time feedback without any manual interaction.

#### Acceptance Criteria

1. WHEN the StatusManager is initialized with a file path, THE StatusManager SHALL begin watching `status.json` for file system changes using `chokidar`.
2. WHEN `status.json` does not exist at startup, THE StatusManager SHALL create the file with a default `idle` payload and dispatch the `idle` state.
3. WHEN `status.json` changes, THE StatusManager SHALL read, parse, and validate the file contents within 200ms of the change event.
4. WHEN a valid `StatusPayload` is read, THE StatusManager SHALL dispatch the new status to the PetStateMachine.
5. WHEN rapid file changes occur within a 50ms window, THE StatusManager SHALL debounce the changes and process only the most recent update.
6. WHEN the StatusManager is stopped, THE StatusManager SHALL close the file watcher and release all associated resources.

---

### Requirement 3: Status Payload Validation

**User Story:** As a developer, I want the overlay to gracefully handle malformed or invalid status files, so that Kiro Buddy remains stable even when the status file is corrupted or partially written.

#### Acceptance Criteria

1. THE StatusManager SHALL validate that a `StatusPayload` contains a `status` field whose value is one of `idle`, `working`, `waiting`, `done`, or `error`.
2. THE StatusManager SHALL validate that a `StatusPayload` contains a `message` field that is a non-empty string of at most 120 characters.
3. THE StatusManager SHALL validate that a `StatusPayload` contains a `timestamp` field that is a positive integer.
4. IF `status.json` contains invalid JSON, THEN THE StatusManager SHALL log a warning and discard the update, keeping the current pet state unchanged.
5. IF the parsed JSON object fails schema validation, THEN THE StatusManager SHALL log a warning and discard the update, keeping the current pet state unchanged.
6. IF `status.json` cannot be read due to a file system error, THEN THE StatusManager SHALL log a warning and keep the current pet state unchanged.

---

### Requirement 4: Pet State Machine and Transitions

**User Story:** As a developer, I want the pet to transition between states in a predictable and controlled way, so that the displayed animation always reflects a valid and meaningful Kiro activity state.

#### Acceptance Criteria

1. THE PetStateMachine SHALL enforce the following valid state transitions: `idle → working`, `idle → error`, `working → done`, `working → waiting`, `working → error`, `waiting → working`, `waiting → error`, `done → idle`, `error → idle`.
2. WHEN a valid state transition is dispatched, THE PetStateMachine SHALL update the current state and trigger the corresponding animation and tooltip updates.
3. IF an invalid state transition is dispatched, THEN THE PetStateMachine SHALL log a warning and leave the current state unchanged.
4. WHEN the application starts, THE PetStateMachine SHALL initialize to the `idle` state.
5. WHEN a state transition occurs, THE PetStateMachine SHALL notify all registered transition listeners with the previous and new state values.

---

### Requirement 5: Animation Rendering

**User Story:** As a developer, I want the pet character to display distinct animations for each activity state, so that I can immediately recognize what Kiro is doing at a glance.

#### Acceptance Criteria

1. WHEN the PetStateMachine transitions to `idle`, THE AnimationRenderer SHALL play the `breathe` animation in a continuous loop.
2. WHEN the PetStateMachine transitions to `working`, THE AnimationRenderer SHALL play the `typing` animation in a continuous loop.
3. WHEN the PetStateMachine transitions to `waiting`, THE AnimationRenderer SHALL play the `confused` animation in a continuous loop.
4. WHEN the PetStateMachine transitions to `done`, THE AnimationRenderer SHALL play the `bounce` animation exactly three times without looping.
5. WHEN the PetStateMachine transitions to `error`, THE AnimationRenderer SHALL play the `shake` animation exactly twice without looping.
6. WHEN a new animation is started, THE AnimationRenderer SHALL stop the currently playing animation before starting the new one.
7. IF a Lottie animation asset file is missing, THEN THE AnimationRenderer SHALL fall back to a CSS keyframe animation for that state and log a warning.
8. THE AnimationRenderer SHALL pre-load all Lottie animation assets from `assets/animations/` at application startup.

---

### Requirement 6: Tooltip Bubble Display

**User Story:** As a developer, I want to see a short status message near the pet character, so that I can read a human-readable description of what Kiro is currently doing.

#### Acceptance Criteria

1. WHEN a state transition occurs with a non-empty message, THE TooltipBubble SHALL display the message in a speech-bubble-style overlay above the pet character.
2. WHEN a state transition occurs with an empty message, THE TooltipBubble SHALL hide the tooltip.
3. WHILE the PetStateMachine is in the `working` or `waiting` state, THE TooltipBubble SHALL persist the tooltip message without auto-hiding.
4. WHEN the PetStateMachine transitions to `done` or `error`, THE TooltipBubble SHALL auto-hide after 4000 milliseconds.
5. WHEN a message exceeds 60 characters, THE TooltipBubble SHALL truncate the displayed text with an ellipsis.

---

### Requirement 7: Toast Notifications

**User Story:** As a developer, I want to receive OS-level notifications when Kiro finishes a task or encounters an error, so that I am alerted even when I am not looking at the screen.

#### Acceptance Criteria

1. WHEN the PetStateMachine transitions to `done` and notifications are enabled, THE ToastNotifier SHALL fire an OS-native notification with the completion message.
2. WHEN the PetStateMachine transitions to `error` and notifications are enabled, THE ToastNotifier SHALL fire an OS-native notification with the error message.
3. WHEN the OverlayWindow is focused, THE ToastNotifier SHALL suppress the notification to avoid duplicate feedback.
4. WHERE notifications are disabled in AppConfig, THE ToastNotifier SHALL not fire any notifications regardless of state transitions.
5. THE ToastNotifier SHALL use Electron's `Notification` API to deliver OS-native toast messages.

---

### Requirement 8: Draggable Window Positioning

**User Story:** As a developer, I want to drag the pet overlay to any position on my screen, so that I can place it where it is least obstructive to my workflow.

#### Acceptance Criteria

1. WHEN a user presses the mouse button down on the pet element, THE DragHandler SHALL begin tracking the drag operation.
2. WHEN the user moves the mouse while dragging, THE DragHandler SHALL send updated window position coordinates to the Electron main process via IPC.
3. THE OverlayWindow SHALL clamp the window position so that the pet remains fully within the visible screen bounds at all times.
4. WHEN the user releases the mouse button, THE DragHandler SHALL end the drag operation and persist the final window position to AppConfig.
5. THE DragHandler SHALL throttle position update IPC messages to a maximum rate of one message per 16 milliseconds.

---

### Requirement 9: Application Configuration Persistence

**User Story:** As a developer, I want Kiro Buddy to remember my preferences and window position between sessions, so that I do not have to reconfigure it every time I launch it.

#### Acceptance Criteria

1. THE Kiro_Buddy application SHALL store AppConfig at `~/.kiro-buddy/config.json` using `electron-store`.
2. THE AppConfig SHALL include the last known window position (`x`, `y`), the path to `status.json`, notification preferences, click-through mode, and the polling fallback interval.
3. WHEN the window is moved, THE Kiro_Buddy application SHALL persist the new position to AppConfig on `mouseup`.
4. WHEN notification preferences are changed, THE Kiro_Buddy application SHALL persist the updated preferences to AppConfig immediately.
5. IF AppConfig does not exist on startup, THE Kiro_Buddy application SHALL create it with default values: position `(100, 100)`, notifications enabled for `done` and `error`, click-through disabled, and poll interval of 500ms.

---

### Requirement 10: Error Handling and Resilience

**User Story:** As a developer, I want Kiro Buddy to recover gracefully from errors, so that the overlay remains functional even when unexpected conditions occur.

#### Acceptance Criteria

1. IF the Electron `BrowserWindow` fails to create, THEN THE Kiro_Buddy application SHALL retry window creation after 2 seconds, up to a maximum of 3 attempts.
2. IF all window creation retries are exhausted, THEN THE Kiro_Buddy application SHALL log the error and exit gracefully.
3. WHEN a file system watcher error occurs, THE StatusManager SHALL log the error and continue watching for subsequent changes.
4. WHEN an invalid state transition is attempted, THE PetStateMachine SHALL log a warning message in the format `"Invalid transition: <from> → <to>"` and leave the current state unchanged.
5. WHEN any unhandled error occurs in the main process, THE Kiro_Buddy application SHALL log the error without crashing the overlay window.

---

### Requirement 11: Security and Process Isolation

**User Story:** As a developer, I want Kiro Buddy to follow secure Electron practices, so that the overlay does not introduce security vulnerabilities to my development environment.

#### Acceptance Criteria

1. THE OverlayWindow SHALL be created with `contextIsolation: true` and `nodeIntegration: false` to prevent renderer access to Node.js APIs.
2. THE Kiro_Buddy application SHALL expose only the `move-window` IPC channel between the renderer and main processes.
3. THE StatusManager SHALL validate the `statusFilePath` configuration value to prevent path traversal attacks before initializing the file watcher.
4. THE StatusManager SHALL parse `status.json` using `JSON.parse()` wrapped in a try/catch block and SHALL NOT use `eval()` or any dynamic code execution.
5. THE Kiro_Buddy application SHALL make no outbound network requests; all communication SHALL be local file I/O only.

---

### Requirement 12: Performance Targets

**User Story:** As a developer, I want Kiro Buddy to have a minimal resource footprint, so that it does not slow down my development machine while running in the background.

#### Acceptance Criteria

1. THE Kiro_Buddy application SHALL consume less than 80 megabytes of RAM during normal operation.
2. WHILE the PetStateMachine is in the `idle` state, THE Kiro_Buddy application SHALL consume less than 1% CPU.
3. WHEN `status.json` changes, THE Kiro_Buddy application SHALL update the pet UI within 200 milliseconds of the file change event.
4. THE StatusManager SHALL use native OS file system events via `chokidar` as the primary change detection mechanism, with a polling fallback interval of at most 500 milliseconds.
5. THE AnimationRenderer SHALL pre-load all animation assets at startup so that no runtime asset fetching occurs during state transitions.
