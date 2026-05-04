const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync, spawn } = require('child_process')

const VALID_STATUSES = new Set(['idle', 'working', 'waiting', 'asking', 'done', 'error'])
const VALID_PHASES = new Set(['design', 'requirements', 'tasks'])
const args = process.argv.slice(2)
const DEFAULT_MESSAGES = {
  idle: 'Kiro is ready',
  working: 'Kiro is working',
  waiting: 'Kiro is waiting for input',
  asking: 'Kiro is asking for your input',
  done: 'Kiro finished',
  error: 'Kiro hit an error',
}
const PHASE_TITLES = {
  design: 'Design',
  requirements: 'Requirements',
  tasks: 'Task List',
}

function readInstallMetadata() {
  const installMetadataPath = path.join(__dirname, 'install.json')
  try {
    const metadata = JSON.parse(fs.readFileSync(installMetadataPath, 'utf8'))
    if (metadata && typeof metadata.packageRoot === 'string') {
      return metadata
    }
  } catch {
    return null
  }

  return null
}

function delayMsFromArgs() {
  const delayArg = args.find((arg) => arg.startsWith('--delay-ms='))
  if (!delayArg) {
    return 0
  }

  const delayMs = Number(delayArg.slice('--delay-ms='.length))
  return Number.isFinite(delayMs) && delayMs > 0 ? Math.min(delayMs, 5000) : 0
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function scheduleDelayedWrite(status) {
  const delayMs = delayMsFromArgs()
  if (delayMs <= 0 || process.env.KIRO_BUDDY_DELAYED_WRITE === '1') {
    return false
  }

  const child = spawn(process.execPath, [__filename, ...args], {
    cwd: process.cwd(),
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env,
      KIRO_BUDDY_DELAYED_WRITE: '1',
      KIRO_BUDDY_DELAY_STARTED_AT: String(Date.now()),
    },
    windowsHide: true,
  })
  child.unref()
  console.log(`Kiro Buddy: scheduled ${status}`)
  return true
}

function readStatusTimestamp(statusFilePath) {
  try {
    const existing = JSON.parse(fs.readFileSync(statusFilePath, 'utf8'))
    return Number.isFinite(existing.timestamp) ? existing.timestamp : 0
  } catch {
    return 0
  }
}

function commandIncludesKiroBuddyApp(commandLine, packageRoot) {
  const normalized = commandLine.toLowerCase()
  return (
    normalized.includes(packageRoot.toLowerCase()) &&
    normalized.includes('node_modules/electron')
  )
}

function isBuddyAlreadyRunning(packageRoot) {
  try {
    if (process.platform === 'win32') {
      const command = [
        'Get-CimInstance Win32_Process',
        "| Where-Object { $_.CommandLine -like '*kiro-buddy*' }",
        '| Select-Object -ExpandProperty CommandLine',
      ].join(' ')
      const stdout = execFileSync('powershell.exe', ['-NoProfile', '-Command', command], {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      return stdout
        .split(/\r?\n/)
        .filter(Boolean)
        .some((line) => commandIncludesKiroBuddyApp(line, packageRoot))
    }

    const stdout = execFileSync('ps', ['-axo', 'command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .some((line) => commandIncludesKiroBuddyApp(line, packageRoot))
  } catch {
    return false
  }
}

function maybeStartBuddyApp() {
  if (process.env.KIRO_BUDDY_NO_AUTOSTART === '1') {
    return
  }

  const metadata = readInstallMetadata()
  if (!metadata) {
    return
  }

  const packageRoot = metadata.packageRoot
  if (isBuddyAlreadyRunning(packageRoot)) {
    return
  }

  let electronBinary
  try {
    electronBinary = require(path.join(packageRoot, 'node_modules', 'electron'))
  } catch {
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

function readStdin() {
  if (process.env.KIRO_BUDDY_READ_STDIN !== '1' && !args.includes('--read-stdin')) {
    return Promise.resolve('')
  }

  if (process.stdin.isTTY) {
    return Promise.resolve('')
  }

  return new Promise((resolve) => {
    let settled = false
    let raw = ''
    const timeoutMs = Number(process.env.KIRO_BUDDY_STDIN_TIMEOUT_MS || 100)

    const finish = () => {
      if (settled) {
        return
      }

      settled = true
      clearTimeout(timer)
      process.stdin.pause()
      resolve(raw)
    }

    const timer = setTimeout(finish, Number.isFinite(timeoutMs) ? timeoutMs : 100)
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      raw += chunk
    })
    process.stdin.once('end', finish)
    process.stdin.once('error', finish)
    process.stdin.resume()
  })
}

function parseEvent(raw) {
  if (!raw.trim()) {
    return null
  }

  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

function messageFor(status, event, phase) {
  const explicitMessage = process.env.KIRO_BUDDY_MESSAGE
  if (explicitMessage) {
    return explicitMessage
  }

  if (process.env.USER_PROMPT && status === 'working') {
    return `Prompt: ${process.env.USER_PROMPT}`
  }

  if (phase && status === 'working') {
    return `${PHASE_TITLES[phase]} in progress`
  }

  if (event && typeof event === 'object') {
    if (status === 'working' && typeof event.tool_name === 'string') {
      return `Using ${event.tool_name}`
    }

    if (status === 'done' && typeof event.hook_event_name === 'string') {
      return `Completed ${event.hook_event_name}`
    }
  }

  return DEFAULT_MESSAGES[status]
}

function truncateMessage(message) {
  return String(message).replace(/\s+/g, ' ').trim().slice(0, 120) || DEFAULT_MESSAGES.idle
}

function phaseFromText(text) {
  if (/\b(tasks?|task\s*list)\b|tasks\.md/i.test(text)) {
    return 'tasks'
  }
  if (/\brequirements?\b|requirements\.md/i.test(text)) {
    return 'requirements'
  }
  if (/\bdesign\b|design\.md/i.test(text)) {
    return 'design'
  }

  return null
}

function readExistingPhase(statusFilePath) {
  try {
    const existing = JSON.parse(fs.readFileSync(statusFilePath, 'utf8'))
    return VALID_PHASES.has(existing.phase) ? existing.phase : null
  } catch {
    return null
  }
}

function phaseFor(status, event, statusFilePath) {
  const explicitPhase = args.find((arg) => VALID_PHASES.has(arg)) || process.env.KIRO_BUDDY_PHASE
  if (VALID_PHASES.has(explicitPhase)) {
    return explicitPhase
  }

  const eventText = event ? JSON.stringify(event) : ''
  const candidateText = [
    process.env.USER_PROMPT,
    process.env.KIRO_ACTIVE_FILE,
    process.env.KIRO_FILE,
    process.env.ACTIVE_FILE,
    process.env.CURRENT_FILE,
    process.env.WORKSPACE_FILE,
    eventText,
  ]
    .filter(Boolean)
    .join(' ')

  const inferredPhase = phaseFromText(candidateText)
  if (inferredPhase) {
    return inferredPhase
  }

  if (status === 'done' || status === 'error') {
    return readExistingPhase(statusFilePath)
  }

  return null
}

async function main() {
  maybeStartBuddyApp()

  const status = args[0]
  if (!VALID_STATUSES.has(status)) {
    console.error(`Usage: node scripts/kiro-status-hook.cjs <${Array.from(VALID_STATUSES).join('|')}>`)
    process.exit(1)
  }

  const rawEvent = process.env.KIRO_BUDDY_EVENT_JSON || (await readStdin())
  const event = parseEvent(rawEvent)
  const statusFilePath =
    process.env.KIRO_BUDDY_STATUS_FILE || path.join(os.homedir(), '.kiro', 'status.json')
  const dir = path.dirname(statusFilePath)

  if (scheduleDelayedWrite(status)) {
    return
  }

  if (process.env.KIRO_BUDDY_DELAYED_WRITE === '1') {
    const delayMs = delayMsFromArgs()
    const startedAt = Number(process.env.KIRO_BUDDY_DELAY_STARTED_AT || Date.now())
    await sleep(delayMs)

    if (readStatusTimestamp(statusFilePath) > startedAt) {
      console.log(`Kiro Buddy: skipped delayed ${status}`)
      return
    }
  }

  const phase = phaseFor(status, event, statusFilePath)

  if ((process.env.KIRO_BUDDY_REQUIRE_PHASE === '1' || args.includes('--require-phase')) && !phase) {
    console.log(`Kiro Buddy: skipped ${status} without phase`)
    return
  }

  const payload = {
    status,
    message: truncateMessage(messageFor(status, event, phase)),
    timestamp: Date.now(),
  }
  if (phase) {
    payload.phase = phase
  }

  fs.mkdirSync(dir, { recursive: true })

  const tempFile = `${statusFilePath}.${process.pid}.tmp`
  fs.writeFileSync(tempFile, `${JSON.stringify(payload)}\n`, 'utf8')
  fs.renameSync(tempFile, statusFilePath)
  console.log(`Kiro Buddy: ${status}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
