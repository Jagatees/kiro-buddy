#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')
const { fileURLToPath } = require('url')
const { execFileSync, spawn, spawnSync } = require('child_process')

const packageRoot = path.resolve(__dirname, '..')
const statusFilePath = process.env.KIRO_BUDDY_STATUS_FILE || path.join(os.homedir(), '.kiro', 'status.json')
const manualClosePath = path.join(os.homedir(), '.kiro-buddy', 'manual-close.json')
const lockFilePath = path.join(os.homedir(), '.kiro-buddy', 'autostart.lock')
const pollMs = Number(process.env.KIRO_BUDDY_AUTOSTART_POLL_MS || 3000)
const workspaceStorageDir =
  process.platform === 'win32'
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Kiro', 'User', 'workspaceStorage')
    : path.join(os.homedir(), 'Library', 'Application Support', 'Kiro', 'User', 'workspaceStorage')

function processLines() {
  try {
    if (process.platform === 'win32') {
      const command = 'Get-CimInstance Win32_Process | Select-Object -ExpandProperty CommandLine'
      const stdout = execFileSync('powershell.exe', ['-NoProfile', '-Command', command], {
        encoding: 'utf8',
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      })
      return stdout.split(/\r?\n/).filter(Boolean)
    }

    const stdout = execFileSync('ps', ['-axo', 'command='], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return stdout.split(/\r?\n/).filter(Boolean)
  } catch {
    return []
  }
}

function isPidRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false
  }

  try {
    process.kill(pid, 0)
    return true
  } catch {
    return false
  }
}

function acquireLock() {
  fs.mkdirSync(path.dirname(lockFilePath), { recursive: true })

  try {
    const existingPid = Number(fs.readFileSync(lockFilePath, 'utf8'))
    if (isPidRunning(existingPid)) {
      return false
    }
  } catch {}

  try {
    fs.writeFileSync(lockFilePath, String(process.pid), { flag: 'wx' })
    return true
  } catch {
    try {
      const existingPid = Number(fs.readFileSync(lockFilePath, 'utf8'))
      if (isPidRunning(existingPid)) {
        return false
      }
      fs.writeFileSync(lockFilePath, String(process.pid), 'utf8')
      return true
    } catch {
      return false
    }
  }
}

function releaseLock() {
  try {
    const existingPid = Number(fs.readFileSync(lockFilePath, 'utf8'))
    if (existingPid === process.pid) {
      fs.rmSync(lockFilePath, { force: true })
    }
  } catch {}
}

function isKiroRunning(lines) {
  return lines.some((line) => {
    const normalized = line.toLowerCase()
    return process.platform === 'win32'
      ? normalized.includes('\\kiro\\kiro.exe') || normalized.includes('/kiro/kiro.exe')
      : normalized.includes('/kiro.app/')
  })
}

function isBuddyRunning(lines) {
  const root = packageRoot.toLowerCase()
  return lines.some((line) => {
    const normalized = line.toLowerCase()
    return (
      normalized.includes(root) &&
      (normalized.includes('node_modules/electron') || normalized.includes('node_modules\\electron'))
    )
  })
}

function workspacePathFromStorageFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    const workspace = JSON.parse(raw)
    if (typeof workspace.folder === 'string' && workspace.folder.startsWith('file:')) {
      return fileURLToPath(workspace.folder)
    }
  } catch {
    return null
  }

  return null
}

function recentWorkspacePaths() {
  try {
    return fs
      .readdirSync(workspaceStorageDir)
      .map((entry) => path.join(workspaceStorageDir, entry, 'workspace.json'))
      .filter((filePath) => fs.existsSync(filePath))
      .map((filePath) => ({
        filePath,
        mtimeMs: fs.statSync(filePath).mtimeMs,
        workspacePath: workspacePathFromStorageFile(filePath),
      }))
      .filter((workspace) => workspace.workspacePath)
      .sort((a, b) => b.mtimeMs - a.mtimeMs)
      .map((workspace) => workspace.workspacePath)
  } catch {
    return []
  }
}

function hasKiroBuddyHooks(workspacePath) {
  const hookDir = path.join(workspacePath, '.kiro', 'hooks')
  const installedNodeScript = path.join(workspacePath, '.kiro', 'kiro-buddy', 'kiro-status-hook.cjs')
  const installedPowerShellScript = path.join(workspacePath, '.kiro', 'kiro-buddy', 'kiro-status-hook.ps1')

  if (fs.existsSync(installedNodeScript) || fs.existsSync(installedPowerShellScript)) {
    return true
  }

  try {
    return fs
      .readdirSync(hookDir)
      .some((fileName) => fileName.startsWith('kiro-buddy-') && fileName.endsWith('.kiro.hook'))
  } catch {
    return false
  }
}

function shouldAutostartForRecentWorkspace() {
  return recentWorkspacePaths().some((workspacePath) => hasKiroBuddyHooks(workspacePath))
}

function clearManualCloseMarker() {
  try {
    fs.rmSync(manualClosePath, { force: true })
  } catch {}
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

  if (process.platform === 'win32') {
    const quotePowerShellString = (value) => `'${String(value).replace(/'/g, "''")}'`
    const command = [
      '$startInfo = New-Object System.Diagnostics.ProcessStartInfo;',
      `$startInfo.FileName = ${quotePowerShellString(electronBinary)};`,
      `$startInfo.Arguments = ${quotePowerShellString(`"${packageRoot}"`)};`,
      `$startInfo.WorkingDirectory = ${quotePowerShellString(packageRoot)};`,
      '$startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden;',
      '$startInfo.UseShellExecute = $false;',
      '$startInfo.EnvironmentVariables["KIRO_BUDDY_EXIT_WITH_KIRO"] = "1";',
      '[System.Diagnostics.Process]::Start($startInfo) | Out-Null;',
    ].join(' ')
    const result = spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', command],
      { stdio: 'ignore', windowsHide: true },
    )
    return result.status === 0
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
    clearManualCloseMarker()
    return
  }

  if (isBuddyRunning(lines)) {
    return
  }

  if (!shouldAutostartForRecentWorkspace()) {
    return
  }

  if (startBuddy()) {
    writeIdleStatus()
  }
}

if (!['darwin', 'win32'].includes(process.platform)) {
  console.error('Kiro Buddy autostart watcher is currently supported on macOS and Windows.')
  process.exit(1)
}

if (!acquireLock()) {
  process.exit(0)
}

process.on('exit', releaseLock)
process.on('SIGINT', () => process.exit(0))
process.on('SIGTERM', () => process.exit(0))

tick()
setInterval(tick, pollMs)
