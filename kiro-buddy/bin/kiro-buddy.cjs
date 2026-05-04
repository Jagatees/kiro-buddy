#!/usr/bin/env node

const { spawnSync } = require('child_process')
const path = require('path')

const packageRoot = path.resolve(__dirname, '..')

function runNodeScript(script, args = []) {
  const result = spawnSync(process.execPath, [path.join(packageRoot, script), ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
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

function printHelp() {
  console.log(`Kiro Buddy

Usage:
  kiro-buddy install        Install Kiro hooks into the current workspace
  kiro-buddy start          Start the floating Buddy app
  kiro-buddy status <state> Write a status update manually

States:
  idle, working, waiting, asking, done, error

Examples:
  npx -y kiro-buddy install
  npx -y kiro-buddy start
  npx -y kiro-buddy status working design
`)
}

const [command, ...args] = process.argv.slice(2)

switch (command) {
  case 'install':
    runNodeScript('scripts/install-kiro-hooks.cjs', args)
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
