# kiro-buddy

Kiro Buddy shows a floating pet for agent activity. Kiro Buddy reacts to Kiro agent activity.

## Demo

![Kiro Buddy demo](kiro-buddy/docs/assets/kiro-buddy-demo.gif)

## Use In Any Kiro Project

After `@jagatees/kiro-buddy` is published, a user can open any Kiro project and run:

```powershell
npx -y @jagatees/kiro-buddy install
npx -y @jagatees/kiro-buddy start
```

`install` writes the Kiro Agent Hooks into that project's `.kiro/hooks` folder and copies the tiny status hook runner into `.kiro/kiro-buddy`. No repo clone is needed.

It also installs Kiro slash agents:

- `/buddy-open` opens Kiro Buddy from the Kiro input box.
- `/buddy-close` closes Kiro Buddy from the Kiro input box.

If the slash commands do not appear immediately, reload the Kiro window so Kiro refreshes `.kiro/agents`.

## Local Development

```powershell
cd kiro-buddy
npm install
npm run build
npm run hooks:install
npm start
```

`npm run hooks:install` adds the Kiro Agent Hooks for prompt submit, agent stop, and manual status tests into `.kiro/hooks` for the current workspace.
