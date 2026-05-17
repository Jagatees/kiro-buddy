#!/usr/bin/env node

const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const packageRoot = path.resolve(__dirname, '..')
const manualClosePath = path.join(os.homedir(), '.kiro-buddy', 'manual-close.json')

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
  clearManualCloseMarker()

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

function clearManualCloseMarker() {
  try {
    fs.rmSync(manualClosePath, { force: true })
  } catch {}
}

function currentKiroSignature() {
  if (process.platform !== 'win32') {
    return null
  }

  try {
    const command = [
      'Get-CimInstance Win32_Process',
      "| Where-Object { $_.CommandLine -match '\\\\Kiro\\\\Kiro\\.exe|/Kiro/Kiro\\.exe' }",
      '| Sort-Object ProcessId',
      '| Select-Object -First 1 ProcessId,CreationDate',
      '| ConvertTo-Json -Compress',
    ].join(' ')
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
      encoding: 'utf8',
      windowsHide: true,
    })
    const raw = result.stdout?.trim()
    if (!raw) {
      return null
    }
    const processInfo = JSON.parse(raw)
    if (!processInfo.ProcessId || !processInfo.CreationDate) {
      return null
    }
    return `${processInfo.ProcessId}:${processInfo.CreationDate}`
  } catch {
    return null
  }
}

function writeManualCloseMarker() {
  fs.mkdirSync(path.dirname(manualClosePath), { recursive: true })
  fs.writeFileSync(
    manualClosePath,
    `${JSON.stringify({ timestamp: Date.now(), kiroSignature: currentKiroSignature() })}\n`,
    'utf8',
  )
}

function closeBuddy() {
  writeManualCloseMarker()

  if (process.platform === 'win32') {
    const escapedRoot = packageRoot.replace(/'/g, "''")
    const command = [
      'Get-CimInstance Win32_Process',
      `| Where-Object { $_.Name -eq 'electron.exe' -and $_.CommandLine -like '*${escapedRoot}*' }`,
      '| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
    ].join(' ')
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
      stdio: 'inherit',
      windowsHide: true,
    })
    process.exit(result.status ?? 1)
  }

  const result = spawnSync('pkill', ['-f', `${packageRoot}.*electron`], {
    stdio: 'inherit',
  })
  process.exit(result.status === 1 ? 0 : (result.status ?? 1))
}

function printHelp() {
  console.log(`Kiro Buddy

Usage:
  kiro-buddy install        Install Kiro hooks into the current workspace
  kiro-buddy open           Open Kiro Buddy and switch to idle
  kiro-buddy close          Close Kiro Buddy until opened again
  kiro-buddy on             Alias for open
  kiro-buddy off            Alias for close
  kiro-buddy start          Start the floating Buddy app
  kiro-buddy status <state> Write a status update manually

States:
  idle, working, asking, done, error
  waiting is still accepted as a legacy alias for asking

Examples:
  npx -y kiro-buddy install
  npx -y kiro-buddy open
  npx -y kiro-buddy close
  npx -y kiro-buddy start
  npx -y kiro-buddy status working design
`)
}

const [command, ...args] = process.argv.slice(2)

switch (command) {
  case 'install':
    runNodeScript('scripts/install-kiro-hooks.cjs', args)
    break
  case 'open':
  case 'on':
    startBuddyDetached()
    runNodeScript('scripts/kiro-status-hook.cjs', ['idle'], {
      ...process.env,
      KIRO_BUDDY_NO_AUTOSTART: '1',
    })
    break
  case 'close':
  case 'off':
    closeBuddy()
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
