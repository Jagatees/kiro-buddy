const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync, spawn } = require('child_process')

const VALID_STATUSES = new Set(['idle', 'working', 'waiting', 'asking', 'done', 'error'])
const VALID_PHASES = new Set(['design', 'requirements', 'tasks'])
const DEFAULT_MESSAGES = {
  idle: 'Kiro is ready',
  working: 'Kiro is working',
  waiting: 'Kiro is waiting for input',
  asking: 'Kiro is asking for your input',
  done: 'Kiro finished',
  error: 'Kiro hit an error',
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

function commandIncludesKiroBuddy(commandLine, packageRoot) {
  return commandLine.toLowerCase().includes(packageRoot.toLowerCase())
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
        .some((line) => commandIncludesKiroBuddy(line, packageRoot))
    }

    const stdout = execFileSync('ps', ['-axo', 'command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .some((line) => commandIncludesKiroBuddy(line, packageRoot))
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
  return new Promise((resolve) => {
    let raw = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => {
      raw += chunk
    })
    process.stdin.on('end', () => {
      resolve(raw)
    })
    process.stdin.resume()

    if (process.stdin.isTTY) {
      resolve('')
    }
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

function messageFor(status, event) {
  const explicitMessage = process.env.KIRO_BUDDY_MESSAGE
  if (explicitMessage) {
    return explicitMessage
  }

  if (process.env.USER_PROMPT && status === 'working') {
    return `Prompt: ${process.env.USER_PROMPT}`
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
  const explicitPhase = process.argv[3] || process.env.KIRO_BUDDY_PHASE
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

  const status = process.argv[2]
  if (!VALID_STATUSES.has(status)) {
    console.error(`Usage: node scripts/kiro-status-hook.cjs <${Array.from(VALID_STATUSES).join('|')}>`)
    process.exit(1)
  }

  const rawEvent = await readStdin()
  const event = parseEvent(rawEvent)
  const statusFilePath =
    process.env.KIRO_BUDDY_STATUS_FILE || path.join(os.homedir(), '.kiro', 'status.json')
  const dir = path.dirname(statusFilePath)
  const payload = {
    status,
    message: truncateMessage(messageFor(status, event)),
    timestamp: Date.now(),
  }
  const phase = phaseFor(status, event, statusFilePath)
  if (phase) {
    payload.phase = phase
  }

  fs.mkdirSync(dir, { recursive: true })

  const tempFile = `${statusFilePath}.${process.pid}.tmp`
  fs.writeFileSync(tempFile, `${JSON.stringify(payload)}\n`, 'utf8')
  fs.renameSync(tempFile, statusFilePath)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
})
