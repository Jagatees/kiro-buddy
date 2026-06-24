#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

const projectRoot = path.resolve(__dirname, '..')

function makeTempDir(name) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `kiro-buddy-${name}-`))
}

function cleanup(dir) {
  fs.rmSync(dir, { recursive: true, force: true })
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

function runScriptAsWin32(scriptRelativePath, env) {
  const scriptPath = path.join(projectRoot, scriptRelativePath)
  const code = [
    "Object.defineProperty(process, 'platform', { value: 'win32' });",
    `require(${JSON.stringify(scriptPath)});`,
  ].join('\n')

  return spawnSync(process.execPath, ['-e', code], {
    cwd: projectRoot,
    encoding: 'utf8',
    env,
  })
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message)
  }
}

function assertIncludes(value, expected, label) {
  assert(String(value).includes(expected), `${label} should include ${expected}`)
}

function verifyGeneratedIdeHooks(workspaceDir, homeDir) {
  const installResult = runScriptAsWin32('scripts/install-kiro-hooks.cjs', {
    ...process.env,
    HOME: '',
    USERPROFILE: homeDir,
    KIRO_BUDDY_WORKSPACE: workspaceDir,
  })
  assert(installResult.status === 0, installResult.stderr || installResult.stdout)

  const installMetadata = readJson(path.join(workspaceDir, '.kiro', 'kiro-buddy', 'install.json'))
  const powerShellHookPath = path.join(workspaceDir, '.kiro', 'kiro-buddy', 'kiro-status-hook.ps1')
  const workingHook = readJson(
    path.join(workspaceDir, '.kiro', 'hooks', 'kiro-buddy-working.kiro.hook'),
  )
  const askingHook = readJson(
    path.join(workspaceDir, '.kiro', 'hooks', 'kiro-buddy-waiting.kiro.hook'),
  )
  const openHook = readJson(path.join(workspaceDir, '.kiro', 'hooks', 'buddy-open.kiro.hook'))
  const settings = readJson(path.join(workspaceDir, '.vscode', 'settings.json'))

  assert(fs.existsSync(powerShellHookPath), 'Windows PowerShell status hook was not installed')
  assertIncludes(installMetadata.statusFilePath, path.join(homeDir, '.kiro-buddy'), 'status file path')
  assertIncludes(workingHook.then.command, 'powershell.exe', 'working hook command')
  assertIncludes(workingHook.then.command, 'kiro-status-hook.ps1', 'working hook command')
  assertIncludes(workingHook.then.command, 'working auto', 'working hook command')
  assertIncludes(workingHook.then.command, '--status-file=', 'working hook command')
  assert(!workingHook.then.command.includes('--read-stdin'), 'Windows IDE hook should not read stdin')
  assertIncludes(askingHook.then.command, 'asking auto', 'asking hook command')
  assertIncludes(openHook.then.command, '$env:KIRO_BUDDY_STATUS_FILE=', 'open hook command')
  assertIncludes(openHook.then.command, 'bin/kiro-buddy.cjs', 'open hook command')
  assert(settings['kiroAgent.trustedCommands'].includes(workingHook.then.command), 'trusted working hook missing')
  assert(settings['kiroAgent.trustedCommands'].includes(openHook.then.command), 'trusted open hook missing')

  return { installMetadata, powerShellHookPath }
}

function verifyGeneratedCliHooks(workspaceDir, homeDir) {
  const installResult = runScriptAsWin32('scripts/install-kiro-cli-hooks.cjs', {
    ...process.env,
    HOME: homeDir,
    USERPROFILE: homeDir,
    KIRO_BUDDY_WORKSPACE: workspaceDir,
  })
  assert(installResult.status === 0, installResult.stderr || installResult.stdout)

  const agentPath = path.join(homeDir, '.kiro', 'agents', 'kiro-buddy-cli.json')
  const workspaceAgentPath = path.join(workspaceDir, '.kiro', 'agents', 'kiro-buddy-cli.json')
  const config = readJson(agentPath)

  assert(fs.existsSync(agentPath), 'global Kiro CLI agent config was not written')
  assert(fs.existsSync(workspaceAgentPath), 'workspace Kiro CLI agent config was not written')
  assert(/^&\s+"/.test(config.hooks.agentSpawn[0].command), 'Windows CLI open command should use PowerShell call operator')
  assertIncludes(config.hooks.agentSpawn[0].command, 'cli', 'CLI agent open command')
  assertIncludes(config.hooks.userPromptSubmit[0].command, 'kiro-status-hook.cjs', 'CLI working command')
  assertIncludes(config.hooks.userPromptSubmit[0].command, '--read-stdin', 'CLI working command')
}

function verifyPowerShellRuntime(powerShellHookPath, statusFilePath) {
  if (process.platform !== 'win32') {
    console.log('Skipped live PowerShell execution because this machine is not Windows.')
    return
  }

  const result = spawnSync(
    'powershell.exe',
    [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      powerShellHookPath,
      'working',
      'requirements',
      `--status-file=${statusFilePath}`,
    ],
    {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        KIRO_BUDDY_NO_AUTOSTART: '1',
        USER_PROMPT: 'Windows verification requirements update',
      },
    },
  )

  assert(result.status === 0, result.stderr || result.stdout)
  const payload = readJson(statusFilePath)
  assert(payload.status === 'working', 'PowerShell hook did not write working status')
  assert(payload.phase === 'requirements', 'PowerShell hook did not preserve requirements phase')
}

function main() {
  const workspaceDir = makeTempDir('windows-workspace')
  const homeDir = makeTempDir('windows-home')
  const runtimeStatusFilePath = path.join(homeDir, '.kiro-buddy', 'verify', 'status.json')

  try {
    const { powerShellHookPath } = verifyGeneratedIdeHooks(workspaceDir, homeDir)
    verifyGeneratedCliHooks(workspaceDir, homeDir)
    verifyPowerShellRuntime(powerShellHookPath, runtimeStatusFilePath)
    console.log('Kiro Buddy Windows verification passed.')
  } finally {
    cleanup(workspaceDir)
    cleanup(homeDir)
  }
}

try {
  main()
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error))
  process.exit(1)
}
