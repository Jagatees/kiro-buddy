# Kiro Buddy

Kiro Buddy is a floating desktop pet for Kiro agent activity. It reacts when Kiro starts working, asks for input, finishes, errors, or moves through spec-driven phases like Design, Requirements, and Task List.

## Release Progress

Current package target: `@jagatees/kiro-buddy@0.1.20`.

| Surface | Status | Notes |
|---|---:|---|
| Windows Kiro IDE | Ready | Kiro desktop IDE setup is ready for Windows users. See the Windows Kiro IDE setup section below. |
| Windows Terminal Kiro CLI | Ready | Kiro CLI terminal setup is ready for Windows users. See the Windows Terminal Kiro CLI setup section below. |
| macOS Kiro IDE | Ready | Validated in Kiro IDE on macOS with slash commands, animation test mode, and multiple workspace Buddy windows. |
| macOS Terminal Kiro CLI | Ready | Validated with Kiro CLI 2.3.0; multiple terminals can each get their own Buddy window. |
| npm publish | Prepared, auth blocked | Build, tests, and `npm pack` passed for `0.1.20`; publishing needs `npm login` as the `jagatees` npm owner. |

Release verification already run for `0.1.20`:

```bash
npm run build
npm test
npm pack
```

Before publishing, confirm:

```bash
npm whoami
```

It must print `jagatees`, then publish with:

```bash
npm publish --access public
```

## Demo

![Kiro Buddy demo](docs/assets/kiro-buddy-demo.gif)

![Kiro Buddy panel preview](docs/assets/kiro-buddy-panel.svg)

## Install In Any Kiro Project

Kiro Buddy supports Kiro IDE and Kiro CLI on Windows and macOS.

## Windows Kiro IDE

Status: ready.

Use this when you run Kiro as the desktop IDE and want Buddy to react to IDE agent activity.

Open PowerShell in your Kiro project folder and run:

```powershell
npx -y @jagatees/kiro-buddy install
```

The install command adds Kiro Agent Hooks to your current project's `.kiro/hooks` folder, adds Buddy slash commands to `.kiro/agents`, and copies the small status runner to `.kiro/kiro-buddy`.

After install, Kiro Buddy opens only when you ask for it from Kiro's input box:

```text
/buddy-open
/buddy-close
/buddy-test
```

Reload the Kiro window if newly installed slash commands do not show up immediately.

Use `/buddy-test` or this command to cycle through the visual states after an install:

```powershell
npx -y @jagatees/kiro-buddy test
```

## Terminal Kiro CLI

Status: ready.

Use this when you run Kiro from the terminal and want Buddy to react to Kiro CLI agent activity.

Open your terminal in the project folder and run:

```bash
npx -y @jagatees/kiro-buddy cli install
npx -y @jagatees/kiro-buddy cli open
kiro-cli chat --agent kiro-buddy-cli
```

On Kiro CLI versions that open chat from the top-level command, this may also work for interactive sessions:

```bash
kiro-cli --agent kiro-buddy-cli
```

Terminal helpers:

```bash
npx -y @jagatees/kiro-buddy cli open
npx -y @jagatees/kiro-buddy cli close
npx -y @jagatees/kiro-buddy cli test
npx -y @jagatees/kiro-buddy cli status working
```

The CLI install command writes the `kiro-buddy-cli` agent config for Kiro CLI. Buddy switches to working when you submit a prompt, asking when Kiro CLI waits for tool approval or user input, and done when the agent stops.

For one Buddy per terminal, use the session launcher in each terminal window:

```bash
npx -y @jagatees/kiro-buddy cli run
```

Each launcher run creates a dedicated `~/.kiro-buddy/sessions/<session>/status.json` and passes it to the Kiro CLI hooks, so multiple Kiro CLI terminals can show independent Buddy windows instead of racing over the shared `~/.kiro/status.json`.

## macOS Kiro IDE

Status: ready. Validated in the Kiro IDE on macOS on May 19, 2026.

Open Terminal in your Kiro project folder and run:

```bash
npx -y @jagatees/kiro-buddy install
```

The installer gives each Kiro IDE workspace its own status file under `~/.kiro-buddy/workspaces/<workspace>/status.json`. That means multiple Kiro IDE projects can run at the same time with separate Buddy windows instead of sharing the old global `~/.kiro/status.json`.

Buddy does not auto-open from normal status hooks. From Kiro's input box, use:

```text
/buddy-open
/buddy-close
/buddy-test
```

`/buddy-test` was validated in Kiro IDE and cycles all visual states: idle, working, done, design, requirements, tasks, waiting, asking, error, then back to idle.

## macOS Terminal Kiro CLI

Status: ready. Validated on macOS 26.3.1 with Kiro CLI 2.3.0 on May 19, 2026.

The tested command is `kiro-cli chat --agent kiro-buddy-cli`. In that flow, Kiro CLI discovers the Buddy agent config, runs `agentSpawn`, `userPromptSubmit`, and `stop` hooks, launches Electron through `kiro-buddy cli open`, and writes Buddy status updates.

For multiple Mac terminal sessions, start each session with `npx -y @jagatees/kiro-buddy cli run`. That gives every terminal its own Buddy status file and Buddy window.

Buddy also has a small in-app panel. Click the round down button to see the current status, phase, `status.json` path, last update time, and last Buddy slash command.

For Kiro IDE, use `/buddy-open` and `/buddy-close` as the normal open/close controls. Status hooks keep writing updates while Buddy is closed, but they do not reopen the window by themselves.

## What It Shows

- `Kiro Working` when you send a prompt
- `Kiro Asking` when Kiro is waiting for your decision or confirmation
- `Kiro Done` when the agent stops
- `Kiro Error` when an error hook runs
- `Design Working`, `Requirements Working`, or `Task List Working` for spec-driven work when phase context is detected
- A hidden debug/reply panel with the live status source and quick reply controls

## Manual Test

```bash
npx -y @jagatees/kiro-buddy status working design
npx -y @jagatees/kiro-buddy status asking
npx -y @jagatees/kiro-buddy status done
```

## Commands

```bash
npx -y @jagatees/kiro-buddy install
npx -y @jagatees/kiro-buddy cli install
npx -y @jagatees/kiro-buddy open
npx -y @jagatees/kiro-buddy close
npx -y @jagatees/kiro-buddy status working
```

## Local Development

```bash
npm install
npm run build
npm test -- --runInBand
npm run hooks:install
npm start
```
