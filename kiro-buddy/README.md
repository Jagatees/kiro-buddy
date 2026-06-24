# Kiro Buddy

Kiro Buddy is a floating desktop pet for Kiro agent activity. It sits on your desktop while you work in Kiro and shows a simple visual state for what the agent is doing: idle, working, asking for input, and done.

This release is Mac-first. macOS is the currently validated public path. Windows support is coming soon.

## Public Status

| Surface | Status | Notes |
|---|---:|---|
| macOS Kiro IDE | Ready | Validated with Kiro slash commands, Agent Hooks, `/buddy-open`, `/buddy-close`, and `/buddy-test`. |
| macOS Terminal Kiro CLI | Ready | Validated with the Buddy CLI hooks and independent Buddy windows for terminal sessions. |
| Windows | Coming soon | Windows support is not public-ready yet. Setup docs will be added after Windows QA is complete. |

## Demo

![Kiro Buddy demo](docs/assets/kiro-buddy-demo.gif)

![Kiro Buddy panel preview](docs/assets/kiro-buddy-panel.svg)

## Install On macOS

Open Terminal in your Kiro project folder and run:

```bash
npx -y @jagatees/kiro-buddy install
```

The installer adds Kiro Agent Hooks to your current project's `.kiro/hooks` folder, adds Buddy slash agents to `.kiro/agents`, and gives that workspace its own status file under:

```text
~/.kiro-buddy/workspaces/<workspace>/status.json
```

That means multiple Kiro projects can run at the same time with separate Buddy windows.

Reload the Kiro window if newly installed slash commands do not appear immediately.

## Kiro IDE Commands

Use these from Kiro's input box:

```text
/buddy-open
/buddy-close
/buddy-test
```

`/buddy-open` opens Buddy for the current Kiro workspace.

`/buddy-close` closes the Buddy window for the current Kiro workspace.

`/buddy-test` cycles through the public animation set: idle, working, asking, and done.

When Kiro shows the slash-command suggestion, select it and press Enter. If you send the text as a normal chat message, Kiro may treat it as chat instead of invoking the Buddy slash command.

## macOS Terminal Kiro CLI

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
npx -y @jagatees/kiro-buddy cli size 80
npx -y @jagatees/kiro-buddy cli test
npx -y @jagatees/kiro-buddy cli status working
```

For one Buddy per terminal, use the session launcher in each terminal window:

```bash
npx -y @jagatees/kiro-buddy cli run
```

Each launcher run creates a dedicated `~/.kiro-buddy/sessions/<session>/status.json` and passes it to the Kiro CLI hooks, so multiple Kiro CLI terminals can show independent Buddy windows.

## What It Shows

- `Kiro Ready` when Buddy is idle.
- `Kiro Working` when Kiro starts running.
- `Kiro Asking` when Kiro is waiting for your decision or confirmation.
- `Kiro Done` when the agent stops or completes.
- The idle animation with error label styling for error states.
- Phase-aware labels such as `Design Working`, `Requirements Working`, or `Task List Working` when Kiro spec context is detected.
- A small panel with the current status, status file path, last update time, last Buddy slash command, and size controls.

## Controls

- Drag Buddy with the left mouse button to move it.
- Right-click Buddy and choose `Close Kiro Buddy` to quit it.
- Click the round down button to open the Buddy panel.
- Use the panel `Size` `-` and `+` buttons to shrink or grow Buddy.

Size accepts `60` through `140`, either as a number or percent. `+` and `-` step by 10%.

```bash
npx -y @jagatees/kiro-buddy size 80
npx -y @jagatees/kiro-buddy size +
npx -y @jagatees/kiro-buddy size -
npx -y @jagatees/kiro-buddy size show
```

## Manual Test

Run the visual test:

```bash
npx -y @jagatees/kiro-buddy test
```

Or trigger individual states:

```bash
npx -y @jagatees/kiro-buddy status working
npx -y @jagatees/kiro-buddy status asking
npx -y @jagatees/kiro-buddy status done
npx -y @jagatees/kiro-buddy status idle
```

## Windows

Windows support is coming soon. The current public docs intentionally focus on macOS because that is the validated setup path for this release.

## Local Development

```bash
npm install
npm run build
npm test -- --runInBand
npm run hooks:install
npm start
```
