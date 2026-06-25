# Kiro Buddy

[![npm](https://img.shields.io/npm/v/@jagatees/kiro-buddy?label=npm)](https://www.npmjs.com/package/@jagatees/kiro-buddy)
[![Website](https://img.shields.io/badge/website-kiro--buddy--website.vercel.app-2b6cff)](https://kiro-buddy-website.vercel.app)
[![GitHub](https://img.shields.io/badge/github-Jagatees%2Fkiro--buddy-111827)](https://github.com/Jagatees/kiro-buddy)

Kiro Buddy is a floating desktop companion for Kiro. It reacts to Kiro IDE hooks, Kiro CLI runs, and spec-driven workflow states so you can see when Kiro is working, asking for input, done, or blocked without digging through logs.

Kiro Buddy is an unofficial community project by Jagatees. It is not assigned, sponsored, endorsed, or maintained by AWS.

![Kiro Buddy command hook demo](https://kiro-buddy-website.vercel.app/assets/demo/kiro-buddy-command-hook.gif)

## Quick Start

Open a terminal in any Kiro project and run:

```powershell
npx -y @jagatees/kiro-buddy install
```

Then use these inside Kiro IDE chat:

```text
/buddy-open
/buddy-test
/buddy-close
```

For Kiro CLI:

```powershell
npx -y @jagatees/kiro-buddy cli install
npx -y @jagatees/kiro-buddy cli open
kiro-cli chat --agent kiro-buddy-cli
```

## Watch It Work

| Flow | Walkthrough clip |
|---|---|
| macOS Kiro IDE | [Watch setup](https://kiro-buddy-website.vercel.app/videos/mac-kiro-ide/kiro-ide-setup-mac.mp4) |
| Windows Kiro IDE | [Watch setup](https://kiro-buddy-website.vercel.app/videos/windows-kiro-ide/kiro-ide-setup-windows.mp4) |
| macOS Kiro CLI | [Watch setup](https://kiro-buddy-website.vercel.app/videos/mac-kiro-cli/kiro-cli-setup-mac.mp4) |
| Windows Kiro CLI | [Watch setup](https://kiro-buddy-website.vercel.app/videos/windows-kiro-cli/kiro-cli-setup-windows.mp4) |

## Supported Paths

| Workflow | Status | What Buddy installs |
|---|---|---|
| macOS Kiro IDE | Ready | Kiro Agent Hooks, slash commands, workspace status file, Buddy launcher. |
| Windows Kiro IDE | Working now | PowerShell hook runner, trusted Kiro hooks, slash commands, Buddy launcher. |
| macOS Kiro CLI | Ready | CLI agent config, hook events, Electron launch, per-terminal sessions. |
| Windows Kiro CLI | Working now | CLI hook install, Buddy open/status/test commands, real Kiro CLI hook path. |

## What Buddy Shows

| State | Meaning |
|---|---|
| `Kiro Ready` | Kiro is idle and ready. |
| `Kiro Working` | Kiro has started processing a prompt or tool flow. |
| `Kiro Asking` | Kiro is waiting for input, approval, or confirmation. |
| `Kiro Done` | The agent run stopped or completed. |
| `Kiro Error` | Kiro reported or reached an error state. |
| `Design / Requirements / Task List` | Buddy preserves Kiro spec-phase context when detected. |

## Project Layout

The product package lives in [`kiro-buddy/`](kiro-buddy/).

- [`kiro-buddy/README.md`](kiro-buddy/README.md) has the full install, CLI, troubleshooting, and development guide.
- [`kiro-buddy/docs/`](kiro-buddy/docs/) contains release and hook documentation.
- [`kiro-buddy/bin/kiro-buddy.cjs`](kiro-buddy/bin/kiro-buddy.cjs) is the npm command entrypoint.
- [`kiro-buddy/scripts/`](kiro-buddy/scripts/) contains the Kiro IDE and CLI installers.

## Local Development

```powershell
cd kiro-buddy
npm install
npm run build
npm test -- --runInBand
npm run windows:verify
npm start
```

Useful installer checks:

```powershell
npm run hooks:install
npm run cli-hooks:install
npm pack --dry-run
```

## Links

- Website: https://kiro-buddy-website.vercel.app
- npm: https://www.npmjs.com/package/@jagatees/kiro-buddy
- GitHub: https://github.com/Jagatees/kiro-buddy
- Bug or idea form: https://forms.gle/bAUQzMYgTmPv9MSF7

## Preview Note

Kiro Buddy is local-first. It writes status JSON files on your machine and does not use a cloud service, account, analytics pipeline, or remote status sync. Public preview means the main install and Buddy flows are usable while packaging polish, fresh-machine QA, and walkthrough coverage continue to improve.
