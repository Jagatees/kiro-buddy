#!/usr/bin/env node

const { spawn, spawnSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const path = require('path')

const packageRoot = path.resolve(__dirname, '..')
const manualClosePath = path.join(os.homedir(), '.kiro-buddy', 'manual-close.json')
const lastCommandPath = path.join(os.homedir(), '.kiro-buddy', 'last-command.json')
const launchRequestPath = path.join(os.homedir(), '.kiro-buddy', 'last-launch.json')
const configPath = path.join(os.homedir(), '.kiro-buddy', 'config.json')

function sanitizeSessionId(value) {
  return String(value || '')
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
}

function createSessionId() {
  return `${Date.now()}-${process.pid}`
}

function statusFileForSession(sessionId) {
  const safeSessionId = sanitizeSessionId(sessionId) || createSessionId()
  return path.join(os.homedir(), '.kiro-buddy', 'sessions', safeSessionId, 'status.json')
}

function applySessionStatusEnv(env) {
  const sessionId = env.KIRO_BUDDY_SESSION_ID
  if (sessionId && !env.KIRO_BUDDY_STATUS_FILE) {
    env.KIRO_BUDDY_STATUS_FILE = statusFileForSession(sessionId)
  }
  return env
}

function appDataDir() {
  return path.dirname(manualClosePath)
}

function readConfig() {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'))
  } catch {
    return {}
  }
}

function writeConfig(config) {
  fs.mkdirSync(appDataDir(), { recursive: true })
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8')
}

function clampScale(scale) {
  return Math.max(0.6, Math.min(scale, 1.4))
}

function formatScale(scale) {
  return `${Math.round(scale * 100)}%`
}

function currentScale() {
  const config = readConfig()
  return Number.isFinite(config.petScale) ? clampScale(Number(config.petScale)) : 1
}

function parseSizeArg(value, current) {
  if (value === undefined || value === 'show' || value === 'current') {
    return null
  }

  if (value === '+' || value === 'up' || value === 'increase') {
    return clampScale(current + 0.1)
  }

  if (value === '-' || value === 'down' || value === 'reduce' || value === 'decrease') {
    return clampScale(current - 0.1)
  }

  const normalized = String(value).trim().replace(/%$/, '')
  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) {
    return Number.NaN
  }

  return clampScale(parsed > 2 ? parsed / 100 : parsed)
}

function writeLastCommand(command) {
  try {
    fs.mkdirSync(appDataDir(), { recursive: true })
    fs.writeFileSync(
      lastCommandPath,
      `${JSON.stringify({ command, timestamp: Date.now() })}\n`,
      'utf8',
    )
  } catch {}
}

function writeLaunchRequest(command, options = {}) {
  try {
    fs.mkdirSync(appDataDir(), { recursive: true })
    fs.writeFileSync(
      launchRequestPath,
      `${JSON.stringify({
        command,
        timestamp: Date.now(),
        packageRoot,
        statusFilePath: process.env.KIRO_BUDDY_STATUS_FILE || null,
        sessionId: process.env.KIRO_BUDDY_SESSION_ID || null,
        exitWithKiro: options.exitWithKiro !== false,
      })}\n`,
      'utf8',
    )
  } catch (err) {
    console.warn(`Kiro Buddy: could not write launch request (${err.code || 'error'})`)
  }
}

function resolveElectronBinary() {
  if (process.env.KIRO_BUDDY_ELECTRON_PATH) {
    return process.env.KIRO_BUDDY_ELECTRON_PATH
  }

  try {
    return require('electron')
  } catch {
    console.error('Electron is missing. Reinstall kiro-buddy and try again.')
    process.exit(1)
  }
}

function electronArgs() {
  const args = [packageRoot]
  if (process.env.KIRO_BUDDY_STATUS_FILE) {
    args.push(`--kiro-buddy-status-file=${process.env.KIRO_BUDDY_STATUS_FILE}`)
  }
  if (process.env.KIRO_BUDDY_SESSION_ID) {
    args.push(`--kiro-buddy-session-id=${process.env.KIRO_BUDDY_SESSION_ID}`)
  }
  return args
}

function runNodeScript(script, args = [], env = process.env) {
  const result = spawnSync(process.execPath, [path.join(packageRoot, script), ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env,
  })
  process.exit(result.status ?? 1)
}

function runNodeScriptReturning(script, args = [], env = process.env) {
  return spawnSync(process.execPath, [path.join(packageRoot, script), ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
    env,
  })
}

function writeCliReadyStatus(env) {
  runNodeScriptReturning('scripts/kiro-status-hook.cjs', ['idle'], {
    ...env,
    KIRO_BUDDY_MESSAGE: 'Kiro is ready',
    KIRO_BUDDY_NO_AUTOSTART: '1',
  })
}

function cliSessionDir() {
  return path.join(os.homedir(), '.kiro', 'sessions', 'cli')
}

function listCliSessionLogs() {
  let entries
  try {
    entries = fs.readdirSync(cliSessionDir(), { withFileTypes: true })
  } catch {
    return []
  }

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.jsonl'))
    .map((entry) => path.join(cliSessionDir(), entry.name))
}

function startCliCancelMonitor(env) {
  const offsets = new Map()
  const ownedLogs = new Set()
  const sessionMarker = env.KIRO_BUDDY_SESSION_ID
    ? `Kiro Buddy session: ${sanitizeSessionId(env.KIRO_BUDDY_SESSION_ID)}`
    : null
  const startedAt = Date.now()
  let lastReadyWriteAt = 0

  for (const filePath of listCliSessionLogs()) {
    try {
      offsets.set(filePath, fs.statSync(filePath).size)
    } catch {}
  }

  const publishReadyOnce = () => {
    const now = Date.now()
    if (now - lastReadyWriteAt < 1000) {
      return
    }
    lastReadyWriteAt = now
    writeCliReadyStatus(env)
  }

  const timer = setInterval(() => {
    for (const filePath of listCliSessionLogs()) {
      let stats
      try {
        stats = fs.statSync(filePath)
      } catch {
        continue
      }

      let offset = offsets.get(filePath)
      if (offset === undefined) {
        offset = stats.mtimeMs >= startedAt - 1000 ? 0 : stats.size
      }

      if (stats.size <= offset) {
        offsets.set(filePath, stats.size)
        continue
      }

      try {
        const fd = fs.openSync(filePath, 'r')
        const length = stats.size - offset
        const buffer = Buffer.alloc(length)
        fs.readSync(fd, buffer, 0, length, offset)
        fs.closeSync(fd)
        offsets.set(filePath, stats.size)

        const text = buffer.toString('utf8')
        if (sessionMarker && text.includes(sessionMarker)) {
          ownedLogs.add(filePath)
        }

        if (sessionMarker && !ownedLogs.has(filePath)) {
          continue
        }

        if (/Response was interrupted by the user|Cancelled streaming/i.test(text)) {
          publishReadyOnce()
        }
      } catch {
        offsets.set(filePath, stats.size)
      }
    }
  }, 500)

  timer.unref?.()
  return () => clearInterval(timer)
}

function startBuddy() {
  const electronBinary = resolveElectronBinary()

  const result = spawnSync(electronBinary, electronArgs(), {
    cwd: packageRoot,
    stdio: 'inherit',
    env: process.env,
  })
  process.exit(result.status ?? 1)
}

function startBuddyDetached(commandName = 'buddy-open', options = {}) {
  const exitWithKiro = options.exitWithKiro !== false
  writeLastCommand(commandName)
  clearManualCloseMarker()
  writeLaunchRequest(commandName, { exitWithKiro })

  if (process.env.KIRO_BUDDY_DRY_RUN === '1') {
    console.log(`Kiro Buddy: open requested (${commandName})`)
    return
  }

  const stopStatus = stopBuddyProcess()
  if (stopStatus !== 0) {
    process.exit(stopStatus)
  }

  const electronBinary = resolveElectronBinary()

  if (process.platform === 'win32') {
    const quotePowerShellString = (value) => `'${String(value).replace(/'/g, "''")}'`
    const command = [
      exitWithKiro
        ? "$env:KIRO_BUDDY_EXIT_WITH_KIRO = '1';"
        : 'Remove-Item Env:KIRO_BUDDY_EXIT_WITH_KIRO -ErrorAction SilentlyContinue;',
      `Start-Process -FilePath ${quotePowerShellString(electronBinary)}`,
      `-ArgumentList ${electronArgs().map(quotePowerShellString).join(', ')}`,
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

  const childEnv = { ...process.env }
  if (exitWithKiro) {
    childEnv.KIRO_BUDDY_EXIT_WITH_KIRO = '1'
  } else {
    delete childEnv.KIRO_BUDDY_EXIT_WITH_KIRO
  }

  const child = spawn(electronBinary, electronArgs(), {
    cwd: packageRoot,
    detached: true,
    stdio: 'ignore',
    env: childEnv,
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
  try {
    fs.mkdirSync(appDataDir(), { recursive: true })
    fs.writeFileSync(
      manualClosePath,
      `${JSON.stringify({ timestamp: Date.now(), kiroSignature: currentKiroSignature() })}\n`,
      'utf8',
    )
  } catch (err) {
    console.warn(`Kiro Buddy: could not write manual close marker (${err.code || 'error'})`)
  }
}

function stopBuddyProcess() {
  const closeTarget = process.env.KIRO_BUDDY_STATUS_FILE || packageRoot
  if (process.platform === 'win32') {
    const escapedRoot = packageRoot.replace(/'/g, "''")
    const escapedTarget = closeTarget.replace(/'/g, "''")
    const command = [
      'Get-CimInstance Win32_Process',
      `| Where-Object { $_.Name -eq 'electron.exe' -and ($_.CommandLine -like '*${escapedRoot}*' -or $_.CommandLine -like '*${escapedTarget}*') }`,
      '| ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }',
    ].join(' ')
    const result = spawnSync('powershell.exe', ['-NoProfile', '-Command', command], {
      stdio: 'inherit',
      windowsHide: true,
    })
    return result.status ?? 1
  }

  const result = spawnSync('ps', ['-axo', 'pid=,command='], { encoding: 'utf8' })
  if (result.status !== 0) {
    console.warn('Kiro Buddy: could not scan running processes for close; treating as already closed')
    return 0
  }

  const electronBinary = resolveElectronBinary()
  const pids = result.stdout
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\s*(\d+)\s+(.+)$/)
      if (!match) {
        return null
      }

      const [, pid, command] = match
      const isElectronProcess =
        command.includes(electronBinary) ||
        (command.includes('node_modules/electron') && command.includes('/Electron.app/Contents/MacOS/Electron'))
      const isMainBuddyProcess =
        isElectronProcess &&
        (command.includes(packageRoot) || (closeTarget !== packageRoot && command.includes(closeTarget)))

      return isMainBuddyProcess ? Number(pid) : null
    })
    .filter((pid) => Number.isInteger(pid) && pid > 0)

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGKILL')
    } catch {}
  }

  return 0
}

function closeBuddy() {
  writeLastCommand('buddy-close')
  writeManualCloseMarker()

  if (process.env.KIRO_BUDDY_DRY_RUN === '1') {
    console.log('Kiro Buddy: close requested')
    process.exit(0)
  }

  process.exit(stopBuddyProcess())
}

function setBuddySize(value) {
  const previousScale = currentScale()
  const nextScale = parseSizeArg(value, previousScale)

  if (nextScale === null) {
    console.log(`Kiro Buddy size: ${formatScale(previousScale)}`)
    return
  }

  if (!Number.isFinite(nextScale)) {
    console.error('Size must be a percentage from 60 to 140, for example: kiro-buddy size 80')
    process.exit(1)
  }

  const config = readConfig()
  config.petScale = Math.round(nextScale * 100) / 100
  writeConfig(config)
  writeLastCommand('buddy-size')

  console.log(`Kiro Buddy size: ${formatScale(config.petScale)}`)

  if (process.env.KIRO_BUDDY_DRY_RUN === '1') {
    return
  }

  stopBuddyProcess()
  startBuddyDetached('buddy-size', { exitWithKiro: false })
  writeStatus('idle', null, 'Kiro is ready', 'size updated')
}

function writeStatus(status, phase, message, context) {
  const env = {
    ...process.env,
    KIRO_BUDDY_NO_AUTOSTART: '1',
  }
  if (message) {
    env.KIRO_BUDDY_MESSAGE = message
  }
  if (context) {
    env.KIRO_BUDDY_CONTEXT = context
  }
  const args = [path.join(packageRoot, 'scripts', 'kiro-status-hook.cjs'), status]
  if (phase) {
    args.push(phase)
  }
  const result = spawnSync(process.execPath, args, {
    cwd: process.cwd(),
    stdio: 'ignore',
    env,
  })
  return result.status ?? 1
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

function runTestSequence() {
  const steps = [
    ['idle', null, 'Visual test: idle', 'ready check'],
    ['working', null, 'Visual test: working', 'general work'],
    ['done', null, 'Visual test: done', 'completion check'],
    ['working', 'design', 'Visual test: design', 'design.md'],
    ['done', 'design', 'Visual test: design done', 'design.md'],
    ['working', 'requirements', 'Visual test: requirements', 'requirements.md'],
    ['done', 'requirements', 'Visual test: requirements done', 'requirements.md'],
    ['working', 'tasks', 'Visual test: tasks', 'tasks.md'],
    ['done', 'tasks', 'Visual test: tasks done', 'tasks.md'],
    ['working', null, 'Visual test: input flow', 'input setup'],
    ['waiting', null, 'Visual test: waiting', 'input wait'],
    ['working', null, 'Visual test: resumed', 'input resumed'],
    ['asking', null, 'Visual test: asking', 'approval prompt'],
    ['error', null, 'Visual test: error', 'error check'],
    ['idle', null, 'Visual test complete', 'ready check'],
  ]
  for (const [status, phase, message, context] of steps) {
    writeStatus(status, phase, message, context)
    sleep(900)
  }
}

function startVisualTest() {
  startBuddyDetached('buddy-test')
  if (process.env.KIRO_BUDDY_DRY_RUN === '1') {
    return
  }

  const child = spawn(process.execPath, [__filename, 'run-test-sequence'], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      KIRO_BUDDY_NO_AUTOSTART: '1',
    },
    windowsHide: true,
  })
  child.unref()
}

function printHelp() {
  console.log(`Kiro Buddy

Usage:
  kiro-buddy install        Install Kiro hooks into the current workspace
  kiro-buddy open           Open Kiro Buddy and switch to idle
  kiro-buddy close          Close Kiro Buddy until opened again
  kiro-buddy test           Cycle all Buddy visual states
  kiro-buddy agent <action> One-shot Kiro slash command helper
  kiro-buddy size <percent> Set Buddy size from 60 to 140 percent
  kiro-buddy on             Alias for open
  kiro-buddy off            Alias for close
  kiro-buddy start          Start the floating Buddy app
  kiro-buddy status <state> Write a status update manually
  kiro-buddy cli <command>  Kiro CLI helpers: install, open, close, test, status

States:
  idle, working, asking, done, error
  waiting is still accepted as a legacy alias for asking

Examples:
  npx -y kiro-buddy install
  npx -y kiro-buddy open
  npx -y kiro-buddy close
  npx -y kiro-buddy size 80
  npx -y kiro-buddy size +
  npx -y kiro-buddy test
  npx -y kiro-buddy agent open
  npx -y kiro-buddy start
  npx -y kiro-buddy status working design
`)
}

function applyGlobalOptions(rawArgs) {
  const args = []
  for (let index = 0; index < rawArgs.length; index += 1) {
    const arg = rawArgs[index]
    if (arg === '--status-file') {
      const value = rawArgs[index + 1]
      if (!value) {
        console.error('--status-file requires a path')
        process.exit(1)
      }
      process.env.KIRO_BUDDY_STATUS_FILE = value
      index += 1
      continue
    }
    if (arg.startsWith('--status-file=')) {
      process.env.KIRO_BUDDY_STATUS_FILE = arg.slice('--status-file='.length)
      continue
    }
    args.push(arg)
  }
  return args
}

const [command, ...args] = applyGlobalOptions(process.argv.slice(2))

function handleCliCommand(args) {
  const [subcommand, ...rest] = args
  applySessionStatusEnv(process.env)

  switch (subcommand) {
    case 'install':
    case 'hooks':
      process.exit(
        runNodeScriptReturning('scripts/install-kiro-cli-hooks.cjs', rest, process.env).status ?? 1,
      )
      break
    case 'open':
    case 'on':
      startBuddyDetached('buddy-cli-open', { exitWithKiro: false })
      runNodeScript('scripts/kiro-status-hook.cjs', ['idle'], {
        ...process.env,
        KIRO_BUDDY_NO_AUTOSTART: '1',
      })
      break
    case 'close':
    case 'off':
      closeBuddy()
      break
    case 'test':
    case 'visual-test':
      startVisualTest()
      break
    case 'size':
      setBuddySize(rest[0])
      break
    case 'status':
      runNodeScript('scripts/kiro-status-hook.cjs', rest)
      break
    case 'run': {
      const rawKiroArgs = rest[0] === '--' ? rest.slice(1) : rest
      const kiroArgs = rawKiroArgs.length > 0 ? rawKiroArgs : ['chat', '--agent', 'kiro-buddy-cli']
      const env = applySessionStatusEnv({
        ...process.env,
        KIRO_BUDDY_SESSION_ID: process.env.KIRO_BUDDY_SESSION_ID || createSessionId(),
      })
      if (process.env.KIRO_BUDDY_DRY_RUN === '1') {
        console.log(`Kiro Buddy: session ${env.KIRO_BUDDY_SESSION_ID}`)
        console.log(`Kiro Buddy: status file ${env.KIRO_BUDDY_STATUS_FILE}`)
        console.log(`Kiro Buddy: kiro-cli ${kiroArgs.join(' ')}`)
        break
      }
      const kiroCli = process.env.KIRO_CLI_PATH || 'kiro-cli'
      const stopCancelMonitor = startCliCancelMonitor(env)
      const child = spawn(kiroCli, kiroArgs, {
        cwd: process.cwd(),
        stdio: 'inherit',
        env,
      })

      const forwardSignal = (signal) => {
        if (!child.killed) {
          child.kill(signal)
        }
      }
      process.once('SIGINT', forwardSignal)
      process.once('SIGTERM', forwardSignal)

      child.on('exit', (code, signal) => {
        stopCancelMonitor()
        process.removeListener('SIGINT', forwardSignal)
        process.removeListener('SIGTERM', forwardSignal)
        writeCliReadyStatus(env)
        if (signal) {
          process.kill(process.pid, signal)
          return
        }
        process.exit(code ?? 1)
      })
      return
    }
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(`Kiro Buddy CLI helpers

Usage:
  kiro-buddy cli install          Install Kiro CLI agent hooks
  kiro-buddy cli open             Open Buddy for terminal sessions
  kiro-buddy cli close            Close Buddy
  kiro-buddy cli test             Cycle visual states
  kiro-buddy cli size 80          Set Buddy size from 60 to 140 percent
  kiro-buddy cli status working   Write a status update
  kiro-buddy cli run              Start Kiro CLI with a dedicated Buddy session

After install:
  kiro-buddy cli run
  kiro-cli chat --agent kiro-buddy-cli
`)
      break
    default:
      console.error(`Unknown cli command: ${subcommand}`)
      process.exit(1)
  }
}

function handleAgentCommand(args) {
  const [subcommand] = args

  switch (subcommand) {
    case 'open':
    case 'on': {
      startBuddyDetached('buddy-open')
      const status = writeStatus('idle', null, 'Kiro is ready', 'manual open')
      if (status !== 0) {
        process.exit(status)
      }
      console.log('Kiro Buddy opened.')
      break
    }
    case 'close':
    case 'off': {
      writeLastCommand('buddy-close')
      writeManualCloseMarker()
      if (process.env.KIRO_BUDDY_DRY_RUN === '1') {
        console.log('Kiro Buddy: close requested')
        console.log('Kiro Buddy closed.')
        break
      }

      const status = stopBuddyProcess()
      if (status !== 0) {
        process.exit(status)
      }
      console.log('Kiro Buddy closed.')
      break
    }
    case 'test':
    case 'visual-test':
      startVisualTest()
      console.log('Kiro Buddy visual test started.')
      break
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log(`Kiro Buddy slash command helpers

Usage:
  kiro-buddy agent open
  kiro-buddy agent close
  kiro-buddy agent test
`)
      break
    default:
      console.error(`Unknown agent command: ${subcommand}`)
      process.exit(1)
  }
}

switch (command) {
  case 'install':
    runNodeScript('scripts/install-kiro-hooks.cjs', args)
    break
  case 'cli':
    handleCliCommand(args)
    break
  case 'agent':
    handleAgentCommand(args)
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
  case 'test':
  case 'visual-test':
    startVisualTest()
    break
  case 'size':
    setBuddySize(args[0])
    break
  case 'run-test-sequence':
    runTestSequence()
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
