# Live Buddy prompt-flow QA — 16 September 2026

Follow-up: [session-flow fixes and full Spec verification](session-flow-2026-09-16.md)
address the plain-question and full-Spec gaps identified in this original run.

## Environment and method

- macOS 26.6.2, Kiro IDE 1.0.288, Electron 39.8.5; local Buddy build.
- Real prompts entered through Kiro's UI in a disposable project.
- Buddy's native window was inspected alongside Kiro's approvals and responses.
- A 25 ms status-file recorder captured the transitions; hook events were not
  injected for the live prompt scenarios. The explicit error-state check below
  was injected separately and is labeled accordingly.
- Test project: `~/.kiro-buddy/qa/prompt-flows-1789490015`.
- Timestamped evidence: `status-history.jsonl` in that test project.

## Observed results after fixes

| Scenario | Prompt/action | Observed Buddy flow |
| --- | --- | --- |
| Plain chat | Reply with one short greeting; no tools | Working → done |
| Read-only code question | Read greet.js and README.md; explain greet | Working through reads → done; no false asking |
| Terminal work | Run `/bin/sleep 8` followed by `/bin/echo buddy-qa-ok` | Working through tool execution → done |
| Cancellation | Cancel a running terminal investigation | Working → ready |
| Follow-up after cancellation | Submit a new command request | Ready → working → done |
| Requirements approval | Add a whitespace-only-name criterion to requirements.md | Working → requirements working → requirements asking → requirements working after Accept → requirements done |
| Design rejection | Create design.md, then Reject | Working → design working → design asking → ready |
| Tasks after rejection | Create tasks.md, then Accept | Ready → working → task-list working → task-list asking → task-list working → task-list done |
| Explicit error + real recovery prompt | Inject error; then request “Ready to continue” with no tools | Error display → working → done; previous spec phase clears |
| Ordinary text question | Ask for an interactive greeting-style question | Kiro reported no interactive question tool and asked in plain chat; Buddy showed done, because the turn ended |

The requirements approval remained in asking for roughly 21 seconds until
Accept, and the task-list approval remained in asking for roughly 40 seconds.
Acceptance resumed working within the monitor's one-second polling interval.

## Bugs reproduced and fixed

1. **Hooks never fired in IDE 1.x.** The installer only wrote legacy files.
   Added the standalone JSON format while retaining older IDE support.
2. **An old cancellation reset later work.** Repeated tail scans replayed old
   log events with shifting offsets. Both watcher and fallback poll now consume
   only newly appended data, with file-position keys for chunk-local events.
3. **New approval notifications were missed.** Added the `input:sess_…` format
   and supervised Accept/Reject resolution messages observed in this Kiro build.
4. **Empty prompt bubbles.** Empty prompt fields now fall back to a useful
   working message. Phase detection still uses available tool/file context.

## Boundaries

- This covers representative IDE flows, not every possible natural-language prompt.
- Requirements/design/tasks were tested through direct spec-file edits, not the
  entire Spec workflow wizard.
- A plain-text question is not a native waiting event; Buddy reports the actual
  completed turn. Interactive file approvals were verified separately.
- Kiro's terminal integration initially lost the first character of a command
  and reported inconsistent exit codes. The absolute-path command printed the
  expected output; this test does not certify Kiro's shell integration.
- Automatic agent-error detection was not verified; the error display was
  tested with an explicit status update.
- Windows runtime, Kiro CLI 3.x, and simultaneous active workspaces were not
  exercised in this live run.

## Reproduce

Install the local build's hooks into a disposable Kiro project, open it, trust
that generated project, and reload the Kiro window. Open Buddy for the project's
status file. Repeat the scenarios above with Autopilot off for Accept/Reject
checks. Record both the status history and the visible pose; a written status
alone does not prove that the renderer displayed it.

## Automated validation

Build and lint passed. All 19 test suites passed (353 tests), including new
regressions for the modern hook file, empty prompt fields, current approval
notifications, Accept/Reject decisions, and reading log appends only once.
The main `kiro-pets` workspace was reinstalled with the updated local hooks.

A final real prompt in the original `kiro-pets` window also passed: “reply only with Ready; no tools or file changes” produced working → done. Buddy was left running for that main workspace.
