#!/usr/bin/env node

const { spawn, spawnSync } = require('child_process')
const path = require('path')

const packageRoot = path.resolve(__dirname, '..')

function runNodeScript(script, args = [], env = process.env) {
  const result = spawnSync(process.execPath, [path.join(packageRoot, script), ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env,
  })
  process.exit(result.status ?? 1)
}

function startBuddy() {
  let electronBinary
  try {
    electronBinary = require('electron')
  } catch {
    console.error('Electron is missing. Reinstall kiro-buddy and try again.')
    process.exit(1)
  }

  const result = spawnSync(electronBinary, [packageRoot], {
    cwd: packageRoot,
    stdio: 'inherit',
    env: process.env,
  })
  process.exit(result.status ?? 1)
}

function startBuddyDetached() {
  let electronBinary
  try {
    electronBinary = require('electron')
  } catch {
    console.error('Electron is missing. Reinstall kiro-buddy and try again.')
    process.exit(1)
  }

  if (process.platform === 'win32') {
    const quotePowerShellString = (value) => `'${String(value).replace(/'/g, "''")}'`
    const command = [
      "$env:KIRO_BUDDY_EXIT_WITH_KIRO = '1';",
      `Start-Process -FilePath ${quotePowerShellString(electronBinary)}`,
      `-ArgumentList ${quotePowerShellString(packageRoot)}`,
      `-WorkingDirectory ${quotePowerShellString(packageRoot)}`,
      '-WindowStyle Hidden',
    ].join(' ')
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      {
        stdio: 'ignore',
        windowsHide: true,
      },
    )
    if (result.status !== 0) {
      process.exit(result.status ?? 1)
    }
    return
  }

  const child = spawn(electronBinary, [packageRoot], {
    cwd: packageRoot,
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      KIRO_BUDDY_EXIT_WITH_KIRO: '1',
    },
    windowsHide: true,
  })
  child.unref()
}

function printHelp() {
  console.log(`Kiro Buddy

Usage:
  kiro-buddy install        Install Kiro hooks into the current workspace
  kiro-buddy on             Turn on Kiro Buddy and switch to idle
  kiro-buddy start          Start the floating Buddy app
  kiro-buddy status <state> Write a status update manually

States:
  idle, working, asking, done, error
  waiting is still accepted as a legacy alias for asking

Examples:
  npx -y kiro-buddy install
  npx -y kiro-buddy on
  npx -y kiro-buddy start
  npx -y kiro-buddy status working design
`)
}

const [command, ...args] = process.argv.slice(2)

switch (command) {
  case 'install':
    runNodeScript('scripts/install-kiro-hooks.cjs', args)
    break
  case 'on':
    startBuddyDetached()
    runNodeScript('scripts/kiro-status-hook.cjs', ['idle'], {
      ...process.env,
      KIRO_BUDDY_NO_AUTOSTART: '1',
    })
    break
  case 'start':
    startBuddy()
    break
  case 'status':
    runNodeScript('scripts/kiro-status-hook.cjs', args)
    break
  case undefined:
  case 'help':
  case '--help':
  case '-h':
    printHelp()
    break
  default:
    console.error(`Unknown command: ${command}`)
    printHelp()
    process.exit(1)
}
