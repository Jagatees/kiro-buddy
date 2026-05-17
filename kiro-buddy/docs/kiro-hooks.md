# Kiro Hook Setup

Kiro Buddy watches a local `status.json` file. The helper script in this repo writes that file in the payload shape the desktop pet expects.

Default status path:

```text
%USERPROFILE%\.kiro\status.json
```

Override it if needed:

```powershell
$env:KIRO_BUDDY_STATUS_FILE="C:\Users\you\.kiro\status.json"
```

## Recommended IDE Hooks

For published installs, open any Kiro workspace and run:

```powershell
npx -y @jagatees/kiro-buddy install
npx -y @jagatees/kiro-buddy start
```

For local development from this repo, run from `kiro-buddy`:

```powershell
npm run hooks:install
```

Restart Kiro or click the hooks refresh button if the new hooks do not appear immediately. The installer writes machine-specific hook files to the current workspace's `.kiro/hooks` folder, writes Buddy slash agents to `.kiro/agents`, and copies the small status runner to `.kiro/kiro-buddy`.

The installer creates:

- `/buddy-open` to open Buddy from Kiro's input box
- `/buddy-close` to close Buddy from Kiro's input box
- `Kiro Buddy Working` for Prompt Submit
- `Kiro Buddy Asking For Input` for Kiro user-input prompts
- `Kiro Buddy Spec Activity` for phase-specific spec file/tool activity
- `Kiro Buddy Done` for Agent Stop
- `Kiro Buddy Error Test` as a manual test hook

`Kiro Buddy Working` keeps Buddy on the working/laptop animation while Kiro is doing normal agent work. The asking animation is reserved for the asking hook and manual asking test, so it should only appear when Kiro is waiting for user input or approval.

The installer also adds a narrow workspace trusted-command entry for the copied Kiro Buddy status script. This lets Kiro run the Buddy hook immediately instead of pausing on a `Run` approval prompt for the hook command itself. If a user-level command denylist still blocks PowerShell commands, use Kiro's `Run and Trust` button once for the Buddy hook command or adjust `Kiro Agent: Command Denylist`.

The desktop app also watches Kiro's own IDE logs for `inputRequired` notifications. This catches command approval prompts that happen between normal hook events, such as a terminal command waiting on `Run` or `Trust`. When that signal appears, Buddy switches to the asking animation even if the last hook event was `Kiro Buddy Working`.

Manual setup is also supported:

Create shell-command hooks in Kiro's Agent Hooks UI:

| Kiro event | Command |
|---|---|
| Prompt Submit | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Github-Local\kiro-pets\kiro-buddy\scripts\kiro-status-hook.ps1" working` |
| Pre Tool Use | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Github-Local\kiro-pets\kiro-buddy\scripts\kiro-status-hook.ps1" asking` |
| Agent Stop | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Github-Local\kiro-pets\kiro-buddy\scripts\kiro-status-hook.ps1" done` |
| Manual Trigger | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Github-Local\kiro-pets\kiro-buddy\scripts\kiro-status-hook.ps1" idle` |

## Spec Phase Labels

The hook accepts an optional second argument for Kiro's spec-driven phases:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Github-Local\kiro-pets\kiro-buddy\scripts\kiro-status-hook.ps1" working design
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Github-Local\kiro-pets\kiro-buddy\scripts\kiro-status-hook.ps1" working requirements
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Github-Local\kiro-pets\kiro-buddy\scripts\kiro-status-hook.ps1" working tasks
```

If the second argument is omitted, the script tries to infer the phase from Kiro hook context such as `USER_PROMPT`, active file variables, or filenames like `design.md`, `requirements.md`, and `tasks.md`. Terminal states such as `done` and `error` preserve the last known phase when possible, so Buddy can show labels like `Design Done` or `Task List Error`.

The installed `Kiro Buddy Spec Activity` hook listens to Kiro `write` and `spec` tool activity and only updates Buddy when it can detect a spec phase. This prevents normal code writes from overwriting a phase-specific animation.

For error/status experiments you can run:

```powershell
npm run status:error
npm run status:done
npm run status:idle
```

To verify the Kiro log input monitor end to end, start Buddy and run:

```powershell
npm run smoke:input-monitor
```

The smoke test writes `working`, appends a synthetic Kiro `inputRequired` log line, and waits for Buddy to switch to `asking`.

Kiro's shell hooks pass useful context via STDIN or environment variables depending on trigger type. The helper consumes both when available and keeps messages below the app's 120-character validation limit.
