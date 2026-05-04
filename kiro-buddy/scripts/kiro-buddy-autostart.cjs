#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync, spawn } = require('child_process')

const packageRoot = path.resolve(__dirname, '..')
const statusHookPath = path.join(packageRoot, 'scripts', 'kiro-status-hook.cjs')
const statusFilePath = process.env.KIRO_BUDDY_STATUS_FILE || path.join(os.homedir(), '.kiro', 'status.json')
const pollMs = Number(process.env.KIRO_BUDDY_AUTOSTART_POLL_MS || 3000)

let sawKiroRunning = false
let startedThisKiroSession = false

function processLines() {
  try {
    const stdout = execFileSync('ps', ['-axo', 'command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return stdout.split(/\r?\n/).filter(Boolean)
  } catch {
    return []
  }
}

function isKiroRunning(lines) {
  return lines.some((line) => line.toLowerCase().includes('/kiro.app/'))
}

function isBuddyRunning(lines) {
  const root = packageRoot.toLowerCase()
  return lines.some((line) => {
    const normalized = line.toLowerCase()
    return normalized.includes(root) && normalized.includes('node_modules/electron')
  })
}

function writeIdleStatus() {
  const payload = {
    status: 'idle',
    message: 'Kiro is ready',
    timestamp: Date.now(),
  }
  fs.mkdirSync(path.dirname(statusFilePath), { recursive: true })
  fs.writeFileSync(statusFilePath, `${JSON.stringify(payload)}\n`, 'utf8')
}

function startBuddy() {
  let electronBinary
  try {
    electronBinary = require(path.join(packageRoot, 'node_modules', 'electron'))
  } catch {
    return false
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
  return true
}

function tick() {
  const lines = processLines()
  const kiroRunning = isKiroRunning(lines)

  if (!kiroRunning) {
    sawKiroRunning = false
    startedThisKiroSession = false
    return
  }

  if (!sawKiroRunning) {
    sawKiroRunning = true
    startedThisKiroSession = false
  }

  if (startedThisKiroSession || isBuddyRunning(lines)) {
    return
  }

  if (startBuddy()) {
    writeIdleStatus()
    startedThisKiroSession = true
  }
}

if (process.platform !== 'darwin') {
  console.error('Kiro Buddy autostart watcher is currently only supported on macOS.')
  process.exit(1)
}

if (!fs.existsSync(statusHookPath)) {
  console.error(`Missing status hook script: ${statusHookPath}`)
  process.exit(1)
}

tick()
setInterval(tick, pollMs)
