import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'

const projectRoot = path.resolve(__dirname, '..', '..')
const cliPath = path.join(projectRoot, 'bin', 'kiro-buddy.cjs')

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kiro-buddy-cli-'))
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

function runCli(homeDir: string, args: string[]): ReturnType<typeof spawnSync> {
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
      KIRO_BUDDY_DRY_RUN: '1',
      KIRO_BUDDY_STATUS_FILE: path.join(homeDir, '.kiro', 'status.json'),
    },
  })
}

describe('kiro-buddy CLI open/close controls', () => {
  let tempDir: string
  let manualClosePath: string
  let lastCommandPath: string
  let launchRequestPath: string
  let statusFilePath: string

  beforeEach(() => {
    tempDir = makeTempDir()
    manualClosePath = path.join(tempDir, '.kiro-buddy', 'manual-close.json')
    lastCommandPath = path.join(tempDir, '.kiro-buddy', 'last-command.json')
    launchRequestPath = path.join(tempDir, '.kiro-buddy', 'last-launch.json')
    statusFilePath = path.join(tempDir, '.kiro', 'status.json')
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it.each(['close', 'off'])('%s records manual close state', (command) => {
    const result = runCli(tempDir, [command])

    expect(result.status).toBe(0)
    expect(fs.existsSync(manualClosePath)).toBe(true)
    expect(readJson<{ command: string }>(lastCommandPath)).toMatchObject({
      command: 'buddy-close',
    })
  })

  it.each([
    ['open', 'buddy-open'],
    ['on', 'buddy-open'],
  ])('%s clears manual close state and writes idle status', (command, lastCommand) => {
    fs.mkdirSync(path.dirname(manualClosePath), { recursive: true })
    fs.writeFileSync(manualClosePath, '{"timestamp":1}\n', 'utf8')

    const result = runCli(tempDir, [command])

    expect(result.status).toBe(0)
    expect(fs.existsSync(manualClosePath)).toBe(false)
    expect(readJson<{ command: string }>(lastCommandPath)).toMatchObject({
      command: lastCommand,
    })
    expect(readJson<{ command: string }>(launchRequestPath)).toMatchObject({
      command: lastCommand,
      exitWithKiro: true,
    })
    expect(readJson<{ status: string }>(statusFilePath)).toMatchObject({
      status: 'idle',
    })
  })

  it('test opens Buddy through the visual test command path', () => {
    fs.mkdirSync(path.dirname(manualClosePath), { recursive: true })
    fs.writeFileSync(manualClosePath, '{"timestamp":1}\n', 'utf8')

    const result = runCli(tempDir, ['test'])

    expect(result.status).toBe(0)
    expect(fs.existsSync(manualClosePath)).toBe(false)
    expect(readJson<{ command: string }>(lastCommandPath)).toMatchObject({
      command: 'buddy-test',
    })
    expect(readJson<{ command: string }>(launchRequestPath)).toMatchObject({
      command: 'buddy-test',
      exitWithKiro: true,
    })
  })

  it('agent open writes the requested status file and prints a completion line', () => {
    const agentStatusFilePath = path.join(tempDir, 'custom-agent-status.json')
    const result = spawnSync(
      process.execPath,
      [cliPath, 'agent', 'open', `--status-file=${agentStatusFilePath}`],
      {
        cwd: projectRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: tempDir,
          USERPROFILE: tempDir,
          KIRO_BUDDY_DRY_RUN: '1',
        },
      },
    )

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Kiro Buddy opened.')
    expect(readJson<{ command: string }>(lastCommandPath)).toMatchObject({
      command: 'buddy-open',
    })
    expect(readJson<{ command: string; statusFilePath: string }>(launchRequestPath)).toMatchObject({
      command: 'buddy-open',
      statusFilePath: agentStatusFilePath,
    })
    expect(readJson<{ status: string }>(agentStatusFilePath)).toMatchObject({
      status: 'idle',
    })
  })

  it('agent close records manual close state and prints a completion line', () => {
    const result = runCli(tempDir, ['agent', 'close'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Kiro Buddy closed.')
    expect(fs.existsSync(manualClosePath)).toBe(true)
    expect(readJson<{ command: string }>(lastCommandPath)).toMatchObject({
      command: 'buddy-close',
    })
  })

  it('agent test opens Buddy through the visual test path and prints a completion line', () => {
    const result = runCli(tempDir, ['agent', 'test'])

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Kiro Buddy visual test started.')
    expect(readJson<{ command: string }>(lastCommandPath)).toMatchObject({
      command: 'buddy-test',
    })
    expect(readJson<{ command: string }>(launchRequestPath)).toMatchObject({
      command: 'buddy-test',
    })
  })

  it('cli open clears manual close state and writes idle status', () => {
    fs.mkdirSync(path.dirname(manualClosePath), { recursive: true })
    fs.writeFileSync(manualClosePath, '{"timestamp":1}\n', 'utf8')

    const result = runCli(tempDir, ['cli', 'open'])

    expect(result.status).toBe(0)
    expect(fs.existsSync(manualClosePath)).toBe(false)
    expect(readJson<{ command: string }>(lastCommandPath)).toMatchObject({
      command: 'buddy-cli-open',
    })
    expect(readJson<{ command: string; exitWithKiro: boolean }>(launchRequestPath)).toMatchObject({
      command: 'buddy-cli-open',
      exitWithKiro: false,
    })
    expect(readJson<{ status: string }>(statusFilePath)).toMatchObject({
      status: 'idle',
    })
  })

  it('cli open uses a session-scoped status file when KIRO_BUDDY_SESSION_ID is set', () => {
    const result = spawnSync(process.execPath, [cliPath, 'cli', 'open'], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: tempDir,
        USERPROFILE: tempDir,
        KIRO_BUDDY_DRY_RUN: '1',
        KIRO_BUDDY_SESSION_ID: 'terminal-one',
      },
    })

    const sessionStatusPath = path.join(tempDir, '.kiro-buddy', 'sessions', 'terminal-one', 'status.json')

    expect(result.status).toBe(0)
    expect(readJson<{ command: string; sessionId: string; statusFilePath: string }>(launchRequestPath)).toMatchObject({
      command: 'buddy-cli-open',
      sessionId: 'terminal-one',
      statusFilePath: sessionStatusPath,
    })
    expect(readJson<{ status: string }>(sessionStatusPath)).toMatchObject({
      status: 'idle',
    })
  })

  it('cli run creates a dedicated session environment for Kiro CLI', () => {
    const result = spawnSync(process.execPath, [cliPath, 'cli', 'run', '--', 'chat', '--agent', 'kiro-buddy-cli'], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: tempDir,
        USERPROFILE: tempDir,
        KIRO_BUDDY_DRY_RUN: '1',
        KIRO_BUDDY_SESSION_ID: 'terminal-two',
      },
    })

    const sessionStatusPath = path.join(tempDir, '.kiro-buddy', 'sessions', 'terminal-two', 'status.json')

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Kiro Buddy: session terminal-two')
    expect(result.stdout).toContain(`Kiro Buddy: status file ${sessionStatusPath}`)
    expect(result.stdout).toContain('Kiro Buddy: kiro-cli chat --agent kiro-buddy-cli')
  })

  it('cli run returns Buddy to idle when Kiro CLI exits or is cancelled', () => {
    const fakeKiroCliPath = path.join(tempDir, 'fake-kiro-cli.js')
    fs.writeFileSync(fakeKiroCliPath, 'process.exit(130)\n', 'utf8')

    const result = spawnSync(process.execPath, [cliPath, 'cli', 'run', '--', fakeKiroCliPath], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: tempDir,
        USERPROFILE: tempDir,
        KIRO_BUDDY_SESSION_ID: 'terminal-cancel',
        KIRO_CLI_PATH: process.execPath,
      },
    })

    const sessionStatusPath = path.join(tempDir, '.kiro-buddy', 'sessions', 'terminal-cancel', 'status.json')

    expect(result.status).toBe(130)
    expect(readJson<{ status: string; message: string }>(sessionStatusPath)).toMatchObject({
      status: 'idle',
      message: 'Kiro is ready',
    })
  })

  it('cli run returns Buddy to idle when Kiro CLI cancels an active stream', () => {
    const fakeKiroCliPath = path.join(tempDir, 'fake-kiro-cli-stream-cancel.js')
    fs.writeFileSync(
      fakeKiroCliPath,
      [
        "const fs = require('fs')",
        "const os = require('os')",
        "const path = require('path')",
        "fs.mkdirSync(path.dirname(process.env.KIRO_BUDDY_STATUS_FILE), { recursive: true })",
        "fs.writeFileSync(process.env.KIRO_BUDDY_STATUS_FILE, JSON.stringify({ status: 'working', message: 'Using read', timestamp: Date.now() }) + '\\n')",
        "const cliDir = path.join(os.homedir(), '.kiro', 'sessions', 'cli')",
        "fs.mkdirSync(cliDir, { recursive: true })",
        "fs.appendFileSync(path.join(cliDir, 'stream-cancel.jsonl'), JSON.stringify({ version: 'v1', kind: 'Prompt', data: { meta: { additionalContext: 'Kiro Buddy session: ' + process.env.KIRO_BUDDY_SESSION_ID } } }) + '\\n')",
        "fs.appendFileSync(path.join(cliDir, 'stream-cancel.jsonl'), JSON.stringify({ version: 'v1', kind: 'AssistantMessage', data: { content: [{ kind: 'text', data: 'Response was interrupted by the user' }] } }) + '\\n')",
        "setTimeout(() => {",
        "  const payload = JSON.parse(fs.readFileSync(process.env.KIRO_BUDDY_STATUS_FILE, 'utf8'))",
        "  process.exit(payload.status === 'idle' ? 0 : 2)",
        "}, 1300)",
      ].join('\n'),
      'utf8',
    )

    const result = spawnSync(process.execPath, [cliPath, 'cli', 'run', '--', fakeKiroCliPath], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: tempDir,
        USERPROFILE: tempDir,
        KIRO_BUDDY_SESSION_ID: 'terminal-stream-cancel',
        KIRO_CLI_PATH: process.execPath,
      },
    })

    const sessionStatusPath = path.join(tempDir, '.kiro-buddy', 'sessions', 'terminal-stream-cancel', 'status.json')

    expect(result.status).toBe(0)
    expect(readJson<{ status: string; message: string }>(sessionStatusPath)).toMatchObject({
      status: 'idle',
      message: 'Kiro is ready',
    })
  })

  it('cli run ignores stream cancels from another Buddy CLI session', () => {
    const fakeKiroCliPath = path.join(tempDir, 'fake-kiro-cli-other-stream-cancel.js')
    fs.writeFileSync(
      fakeKiroCliPath,
      [
        "const fs = require('fs')",
        "const os = require('os')",
        "const path = require('path')",
        "fs.mkdirSync(path.dirname(process.env.KIRO_BUDDY_STATUS_FILE), { recursive: true })",
        "fs.writeFileSync(process.env.KIRO_BUDDY_STATUS_FILE, JSON.stringify({ status: 'working', message: 'Using read', timestamp: Date.now() }) + '\\n')",
        "const cliDir = path.join(os.homedir(), '.kiro', 'sessions', 'cli')",
        "fs.mkdirSync(cliDir, { recursive: true })",
        "fs.appendFileSync(path.join(cliDir, 'other-stream-cancel.jsonl'), JSON.stringify({ version: 'v1', kind: 'Prompt', data: { meta: { additionalContext: 'Kiro Buddy session: some-other-session' } } }) + '\\n')",
        "fs.appendFileSync(path.join(cliDir, 'other-stream-cancel.jsonl'), JSON.stringify({ version: 'v1', kind: 'AssistantMessage', data: { content: [{ kind: 'text', data: 'Response was interrupted by the user' }] } }) + '\\n')",
        "setTimeout(() => {",
        "  const payload = JSON.parse(fs.readFileSync(process.env.KIRO_BUDDY_STATUS_FILE, 'utf8'))",
        "  process.exit(payload.status === 'working' ? 0 : 2)",
        "}, 1300)",
      ].join('\n'),
      'utf8',
    )

    const result = spawnSync(process.execPath, [cliPath, 'cli', 'run', '--', fakeKiroCliPath], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: tempDir,
        USERPROFILE: tempDir,
        KIRO_BUDDY_SESSION_ID: 'terminal-not-cancelled',
        KIRO_CLI_PATH: process.execPath,
      },
    })

    expect(result.status).toBe(0)
  })

  it('uses encoded PowerShell and ProcessStartInfo for Windows process control', () => {
    const cliSource = fs.readFileSync(cliPath, 'utf8')

    expect(cliSource).toContain('-EncodedCommand')
    expect(cliSource).toContain("$ProgressPreference = 'SilentlyContinue'")
    expect(cliSource).toContain('System.Diagnostics.ProcessStartInfo')
    expect(cliSource).toContain('CreateNoWindow = $true')
    expect(cliSource).toContain('RedirectStandardOutput = $true')
    expect(cliSource).toContain("unsetEnv: exitWithKiro ? [] : ['KIRO_BUDDY_EXIT_WITH_KIRO']")
    expect(cliSource).toContain('attachedKiroSignature')
    expect(cliSource).toContain('KIRO_BUDDY_ATTACHED_KIRO_SIGNATURE')
    expect(cliSource).toContain('APPDATA: process.env.APPDATA')
    expect(cliSource).toContain('EnvironmentVariables.Remove([string]$_)')
    expect(cliSource).toContain('IndexOf([string]$target, [StringComparison]::OrdinalIgnoreCase)')
    expect(cliSource).toContain("'electron.exe', 'Kiro Buddy.exe', 'kiro-buddy.exe'")
    expect(cliSource).toContain("].join('\\n')")
  })

  it('cli install writes the Kiro CLI agent config and the installed agent opens Buddy for CLI sessions', () => {
    const result = spawnSync(process.execPath, [cliPath, 'cli', 'install'], {
      cwd: projectRoot,
      encoding: 'utf8',
      env: {
        ...process.env,
        HOME: tempDir,
        USERPROFILE: tempDir,
        KIRO_BUDDY_WORKSPACE: tempDir,
      },
    })

    expect(result.status).toBe(0)
    const agentPath = path.join(tempDir, '.kiro', 'agents', 'kiro-buddy-cli.json')
    expect(fs.existsSync(agentPath)).toBe(true)

    const agentConfig = readJson<{
      hooks: {
        agentSpawn: Array<{ command: string }>
        preToolUse: Array<{ command: string; matcher: string }>
      }
    }>(agentPath)
    expect(agentConfig.hooks.agentSpawn[0].command).toContain('cli')
    expect(agentConfig.hooks.agentSpawn[0].command).toContain('open')
    expect(agentConfig.hooks.preToolUse[0]).toMatchObject({
      matcher: '*',
    })
    expect(agentConfig.hooks.preToolUse[0].command).toContain('asking')
    expect(agentConfig.hooks.agentSpawn[0].command).toContain('KIRO_BUDDY_PROJECT_PATH=')
    expect(agentConfig.hooks.preToolUse[0].command).toContain('KIRO_BUDDY_PROJECT_PATH=')
    if (process.platform === 'win32') {
      expect(agentConfig.hooks.agentSpawn[0].command).toContain('& "')
      expect(agentConfig.hooks.preToolUse[0].command).toContain('& "')
    }

    const commandEnv = {
      ...process.env,
      HOME: tempDir,
      USERPROFILE: tempDir,
      KIRO_BUDDY_DRY_RUN: '1',
      KIRO_BUDDY_STATUS_FILE: statusFilePath,
    }
    const openResult =
      process.platform === 'win32'
        ? spawnSync(
            'powershell.exe',
            ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', agentConfig.hooks.agentSpawn[0].command],
            {
              cwd: tempDir,
              encoding: 'utf8',
              env: commandEnv,
            },
          )
        : spawnSync(agentConfig.hooks.agentSpawn[0].command, {
            cwd: tempDir,
            encoding: 'utf8',
            shell: true,
            env: commandEnv,
          })

    expect(openResult.status).toBe(0)
    expect(readJson<{ command: string; exitWithKiro: boolean }>(launchRequestPath)).toMatchObject({
      command: 'buddy-cli-open',
      exitWithKiro: false,
    })
    expect(readJson<{ status: string }>(statusFilePath)).toMatchObject({
      status: 'idle',
    })
  })
})
