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

Restart Kiro or click the hooks refresh button if the new hooks do not appear immediately. The installer writes machine-specific hook files to the current workspace's `.kiro/hooks` folder and copies the small status runner to `.kiro/kiro-buddy`.

The installer creates:

- `Kiro Buddy Working` for Prompt Submit
- `Kiro Buddy Done` for Agent Stop
- `Kiro Buddy Error Test` as a manual test hook
- `Kiro Buddy Design Test`, `Kiro Buddy Requirements Test`, and `Kiro Buddy Task List Test` as manual phase test hooks

Manual setup is also supported:

Create shell-command hooks in Kiro's Agent Hooks UI:

| Kiro event | Command |
|---|---|
| Prompt Submit | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Github-Local\kiro-pets\kiro-buddy\scripts\kiro-status-hook.ps1" working` |
| Pre Tool Use | `powershell.exe -NoProfile -ExecutionPolicy Bypass -File "D:\Github-Local\kiro-pets\kiro-buddy\scripts\kiro-status-hook.ps1" working` |
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

For error/status experiments you can run:

```powershell
npm run status:error
npm run status:done
npm run status:idle
```

Kiro's shell hooks pass useful context via STDIN or environment variables depending on trigger type. The helper consumes both when available and keeps messages below the app's 120-character validation limit.
