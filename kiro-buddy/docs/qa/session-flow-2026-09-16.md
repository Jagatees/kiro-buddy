# Buddy session-flow fixes — 16 September 2026

## Scope and evidence

Local macOS run with Kiro IDE 1.0.288 and Electron 39.8.5. This follows
[prompt-flow-2026-09-16.md](prompt-flow-2026-09-16.md) and supersedes its
plain-question and full-Spec limitations. This is representative coverage,
not a guarantee for every natural-language prompt.

Real prompts and approval actions were entered through Kiro's UI in
`~/.kiro-buddy/qa/prompt-flows-1789490015`. Buddy's visible pose and label were
checked using native screenshots. The test project's
`session-flow-history.jsonl` records status changes at 25 ms intervals;
`session-monitor-app.log` records the local Buddy run. The history includes
mismatches found during development and corrected by subsequent builds.

## What changed

- One reducer tracks each Kiro session and active execution ID. New prompts
  reset old pending input, phase, and terminal state. Older turns and sessions
  cannot finish newer work.
- The monitor follows only the matching workspace and explicitly declared
  subagent streams. A child's completion cannot finish the parent turn.
- Native pending interactions hold Asking until resolved. Cancel/dismiss and
  rejection clear pending state and return Ready.
- Direct English requests for choices, information, confirmation, and approval
  dependencies hold Asking after a normal turn end. Optional closings stay Done.
- Spec phase follows the requested document. Reading requirements while writing
  design keeps Design active; the requirements-first workflow name does not
  override a known design/tasks target.
- Terminal errors use a distinct red alert badge and gentle motion. Individual
  failed tools remain Working while Kiro can recover.
- Repeated animation updates preserve the frame and cadence. State changes use
  a 140 ms crossfade, and non-looping playback completes once.
- Modern hooks carry session identity and defer to confirmed session state;
  legacy IDE/CLI hooks remain supported. Event files retain incomplete JSON and
  split UTF-8 characters between appends.

## Real UI results

| Scenario | Expected | Observed |
| --- | --- | --- |
| Plain chat asks “Friendly or Formal?” | Working → Asking; hold for answer | Passed, including visible question pose |
| Answer “Friendly” and request a greeting | Working → Done; clear Asking | Passed |
| Exact reply “Done. Anything else?” | Done | Passed; no false Asking |
| Spec wizard: feature type and starting document | Asking at each choice, Working after submission | Passed |
| Requirements draft and file approval | Requirements Asking until Accept | Passed |
| Requirements follow-up asks whether to review or proceed | Requirements Asking | Passed |
| Design subagent asks permission for analysis | Design Asking → Design Working after reply | Passed after fixing delegated events and phase selection |
| Design file approval | Design Asking until Accept | Passed |
| “Once you approve, I can proceed to create the task list” | Design Asking | Initially Done; fixed, regression tested, and visually verified after re-reading the real saved turn |
| Generate Task List via Spec workflow link | Task List Working → Asking at file approval → Done after Accept | Passed; all three spec documents created, implementation code left untouched |
| Recoverable tool failure inside Spec workflow | Continue Working, allow successful recovery | A directory-creation command failed; requirements workflow recovered and reached approval without an Error state |
| Native Alpha/Beta question → Cancel | Asking → Ready; late completion cannot change it | Initially treated dismissal as an answer; fixed and retested live, remained Ready |
| New prompt after cancellation | Ready → Working | Passed; next edit request reached approval |
| Supervised README edit → Reject | Asking → Ready | Passed; rejection cleared pending input |
| Terminal error replay through the real session monitor and status manager | Error with red badge and readable phase label | Passed; visible Design Error with alert badge |
| Real no-tool prompt after error replay | Error → Working → Done; clear stale phase and badge | Passed |

The terminal-error case used controlled JSONL records in the test project's
`session-error-replay` directory, through the production monitor and status
manager into the running Buddy renderer. It did not edit Kiro's real session
files or force a service outage. Automatic terminal-error parsing and rendering
were verified by replay; an actual provider/connection failure was not triggered.

## Bugs found by this follow-up

1. Plain-text questions and explicit approval dependencies were mistaken for
   completed work.
2. The Spec workflow's delegated events were invisible to the parent-only
   monitor.
3. The requirements-first subagent name and context reads could incorrectly
   switch Design back to Requirements.
4. A native question's Cancel button emits `outcome: dismissed`; treating it
   like a normal answer led to Working and then Done.
5. A late Stop hook could overwrite a more accurate session state, including
   terminal errors whose event timestamp predates the hook timestamp.

## Boundaries

- Plain-text detection is a conservative English heuristic. Ambiguous,
  unsupported, or differently worded questions can still fall back to Done.
  Native input/approval events have stronger evidence than text matching.
- The Kiro session schema is local application data, verified for 1.0.288;
  future versions may require adaptation.
- Windows runtime, Kiro CLI 3.x, and simultaneously active IDE workspaces were
  not live-tested here. Automated tests cover legacy hook behavior, Windows
  command generation, workspace filtering, and interleaved stale turns.
- Kiro's terminal integration showed a failed directory-creation attempt during
  Spec generation. This run does not certify Kiro's shell integration.

## Automated validation

- `npm test -- --runInBand --silent`: 21 suites, **387 tests passed**.
- `npm run build`: passed.
- `npm run lint`: passed.
- `git diff --check`: passed.

Regression coverage includes direct/optional/quoted questions, approval
wording, dismissed native input, concurrent pending approvals, old turns,
workspace filtering, delegated Spec input, child completion, restoring the
persisted active turn, partial JSON/UTF-8 writes, hook precedence, phase changes,
error presentation, and uninterrupted animation cadence.

The updated hooks were installed in the main `kiro-pets` workspace and its
Kiro window reloaded. A fresh no-tool “reply only Ready” smoke prompt completed;
Buddy visibly showed Kiro Done, and the status file identified that main
workspace's session and turn. Buddy was left running for the main project.
