# Kiro Buddy

Kiro Buddy is a floating desktop pet for Kiro agent activity. It reacts when Kiro starts working, asks for input, finishes, errors, or moves through spec-driven phases like Design, Requirements, and Task List.

## Install In Any Kiro Project

Open a terminal in your Kiro project and run:

```powershell
npx -y @jagatees/kiro-buddy install
npx -y @jagatees/kiro-buddy start
```

The install command adds Kiro Agent Hooks to your current project's `.kiro/hooks` folder and copies the small status runner to `.kiro/kiro-buddy`. Windows uses a PowerShell runner; macOS and Linux use a Node runner.

On macOS, the Buddy window is configured to stay visible across Spaces and fullscreen apps.

## What It Shows

- `Kiro Working` when you send a prompt
- `Kiro Asking` when Kiro is waiting for your decision or confirmation
- `Kiro Done` when the agent stops
- `Kiro Error` when an error hook runs
- `Design Working`, `Requirements Working`, or `Task List Working` for spec-driven work when phase context is detected

## Manual Test

```powershell
npx -y @jagatees/kiro-buddy status working design
npx -y @jagatees/kiro-buddy status asking
npx -y @jagatees/kiro-buddy status done
```

## Commands

```powershell
npx -y @jagatees/kiro-buddy install
npx -y @jagatees/kiro-buddy start
npx -y @jagatees/kiro-buddy status working
```

## Local Development

```powershell
npm install
npm run build
npm test -- --runInBand
npm run hooks:install
npm start
```
