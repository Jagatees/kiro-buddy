# Kiro Buddy Product Requirements Document

## Product Summary

Kiro Buddy is a lightweight desktop companion for Kiro agent activity. It appears as a floating pet overlay and gives users a glanceable signal for what Kiro is doing: ready, working, asking for input, done, or error. The product should feel simple, local, reliable, and delightful without getting in the user's way.

The current product is an Electron-based npm package published as `@jagatees/kiro-buddy`. It installs Kiro Agent Hooks and slash agents into a user's Kiro workspace, writes local status files, and opens a Buddy window that reacts to those status changes. The first public release should be macOS-first. Windows should remain "coming soon" until the Windows install and runtime path is validated on real machines.

## Readiness Level Target

Kiro Buddy should be treated as a **public preview** until it has broad cross-platform validation, signed installers, deeper recovery flows, and enough user feedback to prove the setup is durable outside the developer's machine.

For the current repo state, the target readiness level is:

| Level | Meaning | Current Fit |
|---|---|---|
| Prototype | Works locally for the creator, not packaged for outside users. | Already beyond this. |
| Private Alpha | Testable by known users with hand-holding and manual recovery. | Passed. |
| Public Preview | Usable by early adopters through npm, with clear docs, known limitations, and a supported happy path. | Target now. |
| General Availability | Polished, signed, cross-platform, resilient, documented, and supportable for normal users. | Not ready yet. |

The next release should therefore be positioned as:

> **Kiro Buddy public preview for macOS Kiro users. Windows support is experimental/internal until Windows QA is complete.**

## Problem

Kiro agent activity can be hard to track when the user is focused on code, waiting on tool approvals, switching between windows, or running multiple projects. Users need a friendly, low-friction way to see whether Kiro is idle, working, blocked on their input, or finished.

## Goals

- Give users a persistent, glanceable indicator of Kiro agent state.
- Work from any Kiro project through a one-command npm install.
- Support both Kiro IDE and Kiro CLI workflows on the validated public platform.
- Keep all status data local to the user's machine.
- Avoid interrupting normal work or stealing focus.
- Make install, open, close, test, and size controls obvious and reliable.
- Clearly communicate platform support and limitations.

## Non-Goals

- Full Kiro replacement UI.
- Cloud sync, accounts, analytics, or remote state storage.
- Complex pet customization marketplace.
- Guaranteed overlay visibility above OS-protected surfaces such as permission prompts, lock screens, or protected fullscreen media.
- Public Windows launch before real Windows QA is complete.

## Primary Users

1. **Kiro IDE user**
   - Works in Kiro projects.
   - Wants Buddy to react to agent activity without manual setup.
   - Uses slash commands like `/buddy-open`, `/buddy-close`, and `/buddy-test`.

2. **Kiro CLI user**
   - Runs Kiro from a terminal.
   - Wants a separate Buddy window per active terminal or project session.
   - Uses `kiro-buddy cli install`, `kiro-buddy cli open`, and `kiro-buddy cli run`.

3. **Early adopter / tester**
   - Comfortable with npm and terminal commands.
   - Can tolerate known preview limitations.
   - Needs clear recovery steps when hooks or slash commands do not refresh.

## User Experience Requirements

### Install

- A user can install Buddy into a Kiro project with:

```bash
npx -y @jagatees/kiro-buddy install
```

- The installer must write workspace-specific Kiro hooks and slash agents.
- The installer must use workspace-specific status files so multiple Kiro projects can run independently.
- The installer must avoid requiring a repo clone for normal users.
- If Kiro does not immediately detect slash agents, docs must tell users to reload the Kiro window.

### Open, Close, And Test

- Users can open Buddy from Kiro with `/buddy-open`.
- Users can close Buddy from Kiro with `/buddy-close`.
- Users can run a visual state cycle with `/buddy-test`.
- Equivalent terminal commands must exist for users who prefer CLI control.
- Closing Buddy must not permanently break future opens.
- Normal status hooks should update the status file but should not relaunch Buddy after a deliberate manual close.

### Visual States

Buddy must provide distinct behavior for:

- `idle`: Kiro is ready.
- `working`: Kiro is actively processing.
- `asking`: Kiro is waiting for user input or approval.
- `done`: Kiro has stopped or completed.
- `error`: Kiro encountered or reported an error.

`waiting` should visually map to the active working state unless the product explicitly identifies a user input or approval wait. The asking state should be reserved for moments where the user must do something.

### Panel And Controls

- Buddy must be draggable.
- Buddy must expose a compact panel from the overlay.
- The panel must show current status, status file path, last update time, last command, and size controls.
- Users must be able to resize Buddy within the supported range of `60` to `140`.
- Controls must be compact and not visually dominate the pet.

### Multiple Sessions

- Multiple Kiro IDE workspaces must be able to drive separate Buddy windows.
- Multiple Kiro CLI terminals must be able to drive separate Buddy windows through session-specific status files.
- Status file paths must be predictable and local under the user's home directory.

## Platform Requirements

### macOS Public Preview

macOS is the public preview platform.

Required readiness:

- npm install path works from a clean Kiro project.
- Kiro IDE slash commands work.
- Kiro IDE hooks update status correctly.
- Kiro CLI hook install works.
- CLI sessions can open and drive independent Buddy windows.
- Overlay remains visible over normal fullscreen apps where macOS allows it.
- Docs describe known OS-level overlay limits.
- Build and test commands pass locally.

### Windows Internal / Coming Soon

Windows must not be marketed as public-ready until:

- Install flow is validated on at least two clean Windows machines.
- PowerShell hook execution is validated from actual Kiro IDE hooks.
- `.vscode/settings.json` trusted command updates work without BOM or JSON corruption.
- CLI hook install and runtime are validated.
- Open, close, test, resize, and status updates are manually verified.
- Autostart behavior is tested or intentionally deferred.
- Windows docs are updated with exact PowerShell commands and recovery steps.

### Future General Availability

Before GA, the product needs:

- Signed installer or clearly trusted distribution path.
- Final app icon and packaging polish.
- Cross-platform smoke checklist.
- Versioned release notes.
- Known issues page.
- Support and uninstall instructions.
- Security and privacy statement.

## Functional Requirements

| ID | Requirement | Priority |
|---|---|---:|
| FR-1 | Install Kiro IDE hooks into the current workspace. | P0 |
| FR-2 | Install Kiro slash agents for open, close, and test. | P0 |
| FR-3 | Write and read local status files with validated payloads. | P0 |
| FR-4 | Render idle, working, asking, done, and error states. | P0 |
| FR-5 | Keep Buddy always-on-top without stealing focus during normal use. | P0 |
| FR-6 | Support manual CLI open, close, test, status, and size commands. | P0 |
| FR-7 | Support Kiro CLI hook installation. | P1 |
| FR-8 | Support independent status files for multiple workspaces and sessions. | P1 |
| FR-9 | Provide a compact status/control panel. | P1 |
| FR-10 | Detect input-required signals from Kiro logs where supported. | P1 |
| FR-11 | Preserve spec-phase labels where available. | P2 |
| FR-12 | Provide autostart helpers per platform. | P2 |

## Non-Functional Requirements

- **Privacy:** No cloud service, telemetry, or external status upload.
- **Reliability:** Invalid status payloads must not crash the app.
- **Performance:** The overlay should feel lightweight and should not noticeably slow Kiro or the editor.
- **Focus safety:** Buddy should not steal keyboard focus during normal state updates.
- **Recoverability:** Users must have clear commands to reopen, close, test, reinstall hooks, and inspect status.
- **Compatibility:** Public docs must match the currently validated platform instead of promising unsupported flows.
- **Maintainability:** Core state mapping, validation, renderer behavior, and installer behavior should stay covered by tests.

## Acceptance Criteria For Public Preview

The project is ready for public preview when all of these are true:

- `npm install` completes from a clean checkout.
- `npm run build` succeeds.
- `npm test -- --runInBand` succeeds.
- Package contents include the CLI bin, app dist files, pet assets, installer scripts, docs, and README.
- macOS Kiro IDE install has been manually validated from a clean Kiro workspace.
- `/buddy-open`, `/buddy-close`, and `/buddy-test` work after Kiro reload.
- macOS Kiro CLI install has been manually validated.
- `kiro-buddy cli run` can drive an independent Buddy session.
- README clearly says macOS is the public path and Windows is coming soon.
- Docs include recovery steps for stale slash commands and closed Buddy windows.
- Known limitations are visible before users install.

## Acceptance Criteria For Windows Public Readiness

Windows can move from "coming soon" to public preview only when all of these are true:

- `npm run windows:verify` passes.
- A real Kiro IDE on Windows triggers prompt submit, asking/input, done, and manual test hooks.
- The PowerShell status hook writes the expected payload with and without explicit status file overrides.
- Slash agents open, close, and test Buddy from Kiro.
- Trusted-command setup is validated without corrupting existing `.vscode/settings.json`.
- Windows terminal CLI hooks work in a real Kiro CLI session.
- Fresh install, reinstall, and uninstall/recovery paths are documented.
- Windows README section is promoted from "coming soon" to a supported install path.

## Release Readiness Checklist

### Public Preview

- [ ] Build passes.
- [ ] Unit and property tests pass.
- [ ] Package dry-run contents reviewed.
- [ ] macOS IDE happy path validated.
- [ ] macOS CLI happy path validated.
- [ ] README platform table is accurate.
- [ ] Known limitations are documented.
- [ ] npm package version is bumped intentionally.
- [ ] Demo asset reflects current UI.

### General Availability

- [ ] macOS and Windows public paths validated.
- [ ] Installer or packaging story is polished.
- [ ] App icon and metadata are final.
- [ ] Security/privacy notes are included.
- [ ] Uninstall docs exist.
- [ ] Release notes exist.
- [ ] Issue/support path exists.
- [ ] Fresh-machine validation completed.

## Current Recommendation

Ship the current product as a **macOS public preview**, not as a finished cross-platform GA release.

Use this public wording:

> Kiro Buddy is in public preview for macOS Kiro users. It supports Kiro IDE hooks, Kiro slash commands, and Kiro CLI sessions. Windows support is actively being validated and should be treated as experimental until the Windows checklist is complete.

Do not call it "production ready" or "GA" yet. The product has a strong working core, tests, docs, and a clear install path, but GA requires stronger platform validation, packaging polish, release operations, and support documentation.
