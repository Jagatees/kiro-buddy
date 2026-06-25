# Kiro Buddy

Kiro Buddy is a floating desktop companion for Kiro. It reacts to agent activity, Kiro CLI runs, and spec-driven workflow states so you can see when Kiro is working, asking for input, done, or blocked without digging through logs.

Kiro Buddy is an unofficial community project by Jagatees. It is not assigned, sponsored, endorsed, or maintained by AWS.

![Kiro Buddy demo](docs/assets/kiro-buddy-demo.gif)

## Links

- Website: https://kiro-buddy-website.vercel.app
- npm: https://www.npmjs.com/package/@jagatees/kiro-buddy
- GitHub: https://github.com/Jagatees/kiro-buddy
- Bug or idea form: https://forms.gle/bAUQzMYgTmPv9MSF7
- macOS Kiro IDE walkthrough: https://kiro-buddy-website.vercel.app/videos/mac-kiro-ide/kiro-ide-setup-mac.mp4
- macOS Kiro CLI walkthrough: https://kiro-buddy-website.vercel.app/videos/mac-kiro-cli/kiro-cli-setup-mac.mp4

## Status

Kiro Buddy is a public preview package. macOS is the most validated path. Windows support is now working through the same npm package, with more public media and fresh-machine QA still to come.

| Workflow | Status | What is covered |
|---|---|---|
| macOS Kiro IDE | Ready | Installer, Kiro Agent Hooks, slash commands, visual test, workspace-specific status files. |
| macOS Kiro CLI | Ready | CLI agent config, hook events, Electron launch, per-terminal Buddy sessions. |
| Windows Kiro IDE | Working now | PowerShell install path, Kiro hooks, slash commands, status updates. |
| Windows Kiro CLI | Working now | CLI hook install, Buddy open/status/test commands, real Kiro CLI hook path. |

## What Buddy Shows

| State | Meaning |
|---|---|
| `Kiro Ready` | Kiro is idle and ready. |
| `Kiro Working` | Kiro has started processing a prompt or tool flow. |
| `Kiro Asking` | Kiro is waiting for your input, approval, or confirmation. |
| `Kiro Done` | The agent run stopped or completed. |
| `Kiro Error` | Kiro reported or reached an error state. |
| `Design / Requirements / Task List` | Buddy preserves Kiro spec-phase context when it can detect it. |

## Install For Kiro IDE

Use this path when you work inside the Kiro desktop app. Install Node.js LTS first, then open a terminal in your Kiro project folder.

macOS:

```bash
node -v
npm -v
cd ~/my-kiro-project
npx -y @jagatees/kiro-buddy install
```

Windows PowerShell:

```powershell
node -v
npm -v
cd C:\path\to\my-kiro-project
npx -y @jagatees/kiro-buddy install
```

The installer writes:

- `.kiro/hooks` Kiro Agent Hooks
- `.kiro/agents` Buddy slash agents
- `.kiro/kiro-buddy` local hook runner files
- a workspace-specific status file under your home directory

Reload the Kiro window if the new slash commands do not appear immediately.

### Kiro IDE Commands

Type these inside Kiro IDE chat, not in your terminal:

```text
/buddy-open
/buddy-test
/buddy-close
```

When Kiro shows a slash-command suggestion, select it and press Enter. If you send the text as a normal chat message, Kiro may treat it as chat instead of invoking Buddy.

## Install For Kiro CLI

Use this path when you run Kiro from a terminal. Install Kiro CLI and log in first.

macOS:

```bash
kiro-cli --version
kiro-cli login
mkdir -p ~/my-kiro-project
cd ~/my-kiro-project
npx -y @jagatees/kiro-buddy cli install
npx -y @jagatees/kiro-buddy cli open
kiro-cli chat --agent kiro-buddy-cli
```

Windows PowerShell:

```powershell
kiro-cli --version
kiro-cli login
mkdir my-kiro-project
cd .\my-kiro-project
npx -y @jagatees/kiro-buddy cli install
npx -y @jagatees/kiro-buddy cli open
kiro-cli chat --agent kiro-buddy-cli
```

For one Buddy window per terminal session, use:

```bash
npx -y @jagatees/kiro-buddy cli run
```

Each `cli run` creates a dedicated status file under:

```text
~/.kiro-buddy/sessions/<session>/status.json
```

## Optional Global Install

Use this if you prefer short `kiro-buddy` commands instead of `npx -y @jagatees/kiro-buddy`.

```bash
npm install -g @jagatees/kiro-buddy
kiro-buddy install
kiro-buddy cli install
kiro-buddy cli open
```

## Manual Controls

Open, close, resize, test, or force a state manually:

```bash
npx -y @jagatees/kiro-buddy open
npx -y @jagatees/kiro-buddy close
npx -y @jagatees/kiro-buddy size 80
npx -y @jagatees/kiro-buddy size +
npx -y @jagatees/kiro-buddy test
npx -y @jagatees/kiro-buddy status working
npx -y @jagatees/kiro-buddy status asking
npx -y @jagatees/kiro-buddy status done
npx -y @jagatees/kiro-buddy status idle
```

Size accepts `60` through `140`, either as a number or percentage. `+` and `-` step by 10%.

Inside the Buddy window:

- Drag Buddy with the left mouse button to move it.
- Click the small panel button to view status details and size controls.
- Right-click Buddy and choose `Close Kiro Buddy` to quit it.

## Expected Results

After setup:

- Kiro IDE slash commands open, test, and close Buddy.
- Kiro Agent Hooks write local status updates.
- Kiro CLI discovers the `kiro-buddy-cli` agent config.
- Buddy switches between working, asking, done, and error states.
- Separate Kiro projects and CLI sessions can use separate Buddy windows.

## Troubleshooting

| Problem | Fix |
|---|---|
| Slash commands do not appear in Kiro IDE | Reload the Kiro window after install. |
| Text like `/buddy-open` is sent as chat | Select the slash-command suggestion before pressing Enter. |
| Buddy does not open from hooks | Run `/buddy-open` or `npx -y @jagatees/kiro-buddy open` once. |
| Kiro CLI does not find the Buddy agent | Re-run `npx -y @jagatees/kiro-buddy cli install` from the project folder. |
| Windows hook trust looks stale | Re-run `npx -y @jagatees/kiro-buddy install` from PowerShell in the project folder. |
| You need to verify Windows setup locally | Run `npm run windows:verify` from a cloned repo. |

## Local Development

```bash
git clone https://github.com/Jagatees/kiro-buddy.git
cd kiro-buddy/kiro-buddy
npm install
npm run build
npm test -- --runInBand
npm run windows:verify
npm start
```

Useful development commands:

```bash
npm run hooks:install
npm run cli-hooks:install
npm pack --dry-run
```

## Package Contents

The npm package includes:

- `bin/kiro-buddy.cjs`
- Electron main and renderer build output under `dist`
- pet sprite assets
- Kiro IDE and Kiro CLI installer scripts
- Windows PowerShell hook runner
- docs and demo media

## Preview Notes

Kiro Buddy is intentionally local-first. It writes status JSON files on your machine and does not use a cloud service, account, analytics pipeline, or remote status sync. Public preview means the core install and Buddy flows are usable, while packaging polish, more Windows walkthrough media, and broader fresh-machine validation are still improving.
