const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const statusFilePath = process.env.KIRO_BUDDY_STATUS_FILE || path.join(os.homedir(), '.kiro', 'status.json')
const workspaceRoot = path.resolve(process.env.KIRO_BUDDY_WORKSPACE || path.join(__dirname, '..', '..'))
const statusHookPath = path.join(workspaceRoot, '.kiro', 'kiro-buddy', 'kiro-status-hook.ps1')
const kiroLogRoot = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Kiro', 'logs')

function walk(dir, files = []) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return files
  }

  for (const entry of entries) {
    const filePath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(filePath, files)
    } else if (entry.isFile() && entry.name === 'Kiro Logs.log') {
      files.push(filePath)
    }
  }

  return files
}

function newestKiroLog() {
  return walk(kiroLogRoot)
    .map((filePath) => ({ filePath, mtimeMs: fs.statSync(filePath).mtimeMs }))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)[0]?.filePath
}

function readStatus() {
  return JSON.parse(fs.readFileSync(statusFilePath, 'utf8'))
}

if (!fs.existsSync(statusHookPath)) {
  console.error(`Missing installed Kiro Buddy hook script: ${statusHookPath}`)
  console.error('Run: $env:KIRO_BUDDY_WORKSPACE="D:\\Github-Local\\kiro-pets"; npm run hooks:install')
  process.exit(1)
}

const logPath = newestKiroLog()
if (!logPath) {
  console.error(`Could not find a Kiro log under ${kiroLogRoot}`)
  process.exit(1)
}

execFileSync(
  'powershell.exe',
  ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', statusHookPath, 'working'],
  { stdio: 'inherit' },
)

const afterWorking = readStatus()
if (afterWorking.status !== 'working') {
  console.error(`Expected working status, got ${afterWorking.status}`)
  process.exit(1)
}

const executionId = `buddy-monitor-smoke-${Date.now()}`
fs.appendFileSync(
  logPath,
  `2026-05-17 22:50:00.000 [info] [notification-service] Showed native inputRequired notification for execution ${executionId}\n`,
  'utf8',
)

function waitForStatus(expectedStatus, timeoutMs = 6000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 250)
    const status = readStatus()
    if (status.status === expectedStatus) {
      return status
    }
  }

  return null
}

if (!waitForStatus('asking')) {
  console.error(`Smoke failed waiting for asking: final status was ${JSON.stringify(readStatus())}`)
  process.exit(1)
}

fs.appendFileSync(
  logPath,
  '2026-05-17 22:50:02.000 [info] [Terminal] Executing command {"terminalId":1,"command":"git status"}\n',
  'utf8',
)

if (!waitForStatus('working')) {
  console.error(`Smoke failed waiting for working: final status was ${JSON.stringify(readStatus())}`)
  process.exit(1)
}

const questionId = `tooluse_buddy_monitor_smoke_${Date.now()}`
fs.appendFileSync(
  logPath,
  `2026-05-17 22:50:04.000 [info] [Execution] adding pending user question {"id":"${questionId}","question":"Is this a new feature or a bugfix?","options":[{"id":"${questionId}-option-0","label":"Build a Feature","description":"Implement new functionality","recommended":true}]}\n`,
  'utf8',
)

if (!waitForStatus('asking')) {
  console.error(`Smoke failed waiting for spec question asking: final status was ${JSON.stringify(readStatus())}`)
  process.exit(1)
}

execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    statusHookPath,
    'working',
    'tasks',
    '--require-phase',
  ],
  { stdio: 'inherit' },
)

const afterSpecActivity = readStatus()
if (afterSpecActivity.status !== 'asking') {
  console.error(
    `Smoke failed: spec activity clobbered asking status with ${JSON.stringify(afterSpecActivity)}`,
  )
  process.exit(1)
}

fs.appendFileSync(
  logPath,
  `2026-05-17 22:50:06.000 [info] [Execution] adding response to question ${questionId} {"type":"answered","answer":"Build a Feature"}\n`,
  'utf8',
)

if (!waitForStatus('working')) {
  console.error(`Smoke failed waiting for working after spec answer: final status was ${JSON.stringify(readStatus())}`)
  process.exit(1)
}

console.log(`Smoke passed: command approval and spec question input via ${path.basename(logPath)}`)
process.exit(0)
