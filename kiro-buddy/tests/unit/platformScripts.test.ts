import fs from 'fs'
import os from 'os'
import path from 'path'
import { spawnSync } from 'child_process'

const projectRoot = path.resolve(__dirname, '..', '..')
const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm'

function normalizeCommand(command: string): string {
  return command.replace(/\\/g, '/')
}

function makeTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'kiro-buddy-platform-'))
}

function cleanup(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true })
}

function runScriptAsWin32(scriptRelativePath: string, env: NodeJS.ProcessEnv) {
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

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T
}

describe('platform script compatibility', () => {
  it('npm status scripts run through the cross-platform Node hook', () => {
    const tempDir = makeTempDir()
    const statusFilePath = path.join(tempDir, 'status.json')

    try {
      const result = spawnSync(npmBin, ['run', 'status:working'], {
        cwd: projectRoot,
        encoding: 'utf8',
        shell: process.platform === 'win32',
        env: {
          ...process.env,
          KIRO_BUDDY_NO_AUTOSTART: '1',
          KIRO_BUDDY_STATUS_FILE: statusFilePath,
        },
      })

      expect(result.status).toBe(0)
      expect(result.stderr).not.toContain('powershell.exe: command not found')

      const payload = JSON.parse(fs.readFileSync(statusFilePath, 'utf8'))
      expect(payload).toMatchObject({
        status: 'working',
        message: 'Kiro is working',
      })
    } finally {
      cleanup(tempDir)
    }
  })

  it('installs Kiro hook commands and slash agents for the current platform', () => {
    const tempDir = makeTempDir()

    try {
      fs.mkdirSync(path.join(tempDir, '.kiro', 'hooks'), { recursive: true })
      fs.mkdirSync(path.join(tempDir, '.kiro', 'agents'), { recursive: true })
      fs.writeFileSync(path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-on.kiro.hook'), '{}\n')
      fs.writeFileSync(path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-close.kiro.hook'), '{}\n')
      fs.writeFileSync(path.join(tempDir, '.kiro', 'agents', 'buddy-open.md'), 'stale\n')
      fs.writeFileSync(path.join(tempDir, '.kiro', 'agents', 'buddy-close.md'), 'stale\n')
      fs.writeFileSync(path.join(tempDir, '.kiro', 'agents', 'buddy-test.md'), 'stale\n')

      const result = spawnSync(process.execPath, ['scripts/install-kiro-hooks.cjs'], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          KIRO_BUDDY_WORKSPACE: tempDir,
        },
      })

      expect(result.status).toBe(0)

      const scriptName = process.platform === 'win32' ? 'kiro-status-hook.ps1' : 'kiro-status-hook.cjs'
      expect(fs.existsSync(path.join(tempDir, '.kiro', 'kiro-buddy', scriptName))).toBe(true)
      const installMetadata = JSON.parse(
        fs.readFileSync(path.join(tempDir, '.kiro', 'kiro-buddy', 'install.json'), 'utf8'),
      )
      expect(installMetadata.statusFilePath).toContain(path.join('.kiro-buddy', 'workspaces'))
      expect(installMetadata.workspaceRoot).toBe(tempDir)

      const workingHook = JSON.parse(
        fs.readFileSync(path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-working.kiro.hook'), 'utf8'),
      )
      const command = workingHook.then.command as string
      const openHook = JSON.parse(
        fs.readFileSync(path.join(tempDir, '.kiro', 'hooks', 'buddy-open.kiro.hook'), 'utf8'),
      )
      const closeHook = JSON.parse(
        fs.readFileSync(path.join(tempDir, '.kiro', 'hooks', 'buddy-close.kiro.hook'), 'utf8'),
      )
      const testHook = JSON.parse(
        fs.readFileSync(path.join(tempDir, '.kiro', 'hooks', 'buddy-test.kiro.hook'), 'utf8'),
      )
      const askingHook = JSON.parse(
        fs.readFileSync(path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-waiting.kiro.hook'), 'utf8'),
      )
      const specActivityHook = JSON.parse(
        fs.readFileSync(
          path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-spec-activity.kiro.hook'),
          'utf8',
        ),
      )
      const settings = JSON.parse(fs.readFileSync(path.join(tempDir, '.vscode', 'settings.json'), 'utf8'))
      const trustedCommands = settings['kiroAgent.trustedCommands'] as string[]
      expect(specActivityHook.enabled).toBe(true)
      expect(command).toContain('--quiet')
      expect(command).toContain('--source=prompt-submit')
      expect(askingHook.then.command).toContain('--quiet')
      expect(askingHook.then.command).toContain('--source=pre-tool')
      expect(specActivityHook.then.command).toContain('--require-phase')
      expect(specActivityHook.then.command).toContain('--quiet')
      expect(specActivityHook.then.command).toContain('--source=spec-activity')
      expect(specActivityHook.then.command).toContain('--fallback-asking-ms=2000')
      expect(openHook.when.type).toBe('userTriggered')
      expect(openHook.shortName).toBe('buddy-open')
      expect(closeHook.when.type).toBe('userTriggered')
      expect(closeHook.shortName).toBe('buddy-close')
      expect(testHook.when.type).toBe('userTriggered')
      expect(testHook.shortName).toBe('buddy-test')
      expect(fs.existsSync(path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-on.kiro.hook'))).toBe(false)
      expect(fs.existsSync(path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-close.kiro.hook'))).toBe(false)

      if (process.platform === 'win32') {
        const installedPowerShellHook = fs.readFileSync(
          path.join(tempDir, '.kiro', 'kiro-buddy', 'kiro-status-hook.ps1'),
          'utf8',
        )
        expect(installedPowerShellHook).toContain('$startInfo.CreateNoWindow = $true')
        expect(installedPowerShellHook).toContain('$startInfo.RedirectStandardOutput = $true')
        expect(installedPowerShellHook).toContain('$startInfo.RedirectStandardError = $true')
        expect(installedPowerShellHook).toContain('Get-KiroSignature')
        expect(installedPowerShellHook).toContain('KIRO_BUDDY_ATTACHED_KIRO_SIGNATURE')
        expect(installedPowerShellHook).toContain('KIRO_BUDDY_STATUS_FILE')
        expect(installedPowerShellHook).toContain('KIRO_BUDDY_PROJECT_PATH')
        expect(installedPowerShellHook).toContain('function Write-KiroBuddyOutput')
        expect(command).toContain('powershell.exe')
        expect(command).toContain('kiro-status-hook.ps1')
        expect(command).toContain('--status-file=')
        expect(command).toContain(installMetadata.statusFilePath)
        expect(command).not.toContain('--read-stdin')
        expect(openHook.then.command).toContain('& "')
        expect(openHook.then.command).toContain('$env:KIRO_BUDDY_STATUS_FILE')
        expect(openHook.then.command).toContain('$env:KIRO_BUDDY_PROJECT_PATH')
        expect(closeHook.then.command).toContain('close')
        expect(testHook.then.command).toContain('test')
        expect(askingHook.then.command).toContain('kiro-status-hook.ps1')
        expect(askingHook.then.command).toContain('asking')
        expect(askingHook.then.command).toContain('--quiet')
        expect(askingHook.then.command).toContain('--source=pre-tool')
        expect(askingHook.then.command).not.toContain('--read-stdin')
      } else {
        expect(command).toContain('KIRO_BUDDY_STATUS_FILE=')
        expect(command).toContain('KIRO_BUDDY_PROJECT_PATH=')
        expect(command).toContain(installMetadata.statusFilePath)
        expect(command).toContain(tempDir)
        expect(command).toContain(process.execPath)
        expect(command).toContain('kiro-status-hook.cjs')
        expect(command).not.toContain('powershell.exe')
        expect(command).toContain('--read-stdin')
        expect(command).toContain('--quiet')
        expect(command).toContain('--source=prompt-submit')
        expect(openHook.then.command).toContain('KIRO_BUDDY_STATUS_FILE=')
        expect(openHook.then.command).toContain('KIRO_BUDDY_PROJECT_PATH=')
        expect(openHook.then.command).toContain(installMetadata.statusFilePath)
        expect(openHook.then.command).toContain(tempDir)
        expect(closeHook.then.command).toContain('close')
        expect(testHook.then.command).toContain('test')
      }

      const openAgentPath = path.join(tempDir, '.kiro', 'agents', 'buddy-open.md')
      const closeAgentPath = path.join(tempDir, '.kiro', 'agents', 'buddy-close.md')
      const testAgentPath = path.join(tempDir, '.kiro', 'agents', 'buddy-test.md')
      expect(fs.existsSync(openAgentPath)).toBe(true)
      expect(fs.existsSync(closeAgentPath)).toBe(true)
      expect(fs.existsSync(testAgentPath)).toBe(true)

      const openAgent = fs.readFileSync(openAgentPath, 'utf8')
      expect(openAgent).toContain('name: buddy-open')
      expect(openAgent).toContain('tools: ["shell"]')
      expect(openAgent).toContain('allowedTools: ["shell"]')
      expect(openAgent).toContain(process.execPath)
      expect(normalizeCommand(openAgent)).toContain('bin/kiro-buddy.cjs')
      expect(openAgent).toContain(installMetadata.statusFilePath)
      expect(openAgent).toContain('agent')
      expect(openAgent).toContain('open')
      expect(openAgent).not.toContain('; printf')
      expect(openAgent).not.toContain('Write-Output')
      expect(openAgent).not.toContain('Kiro Buddy command finished.')
      expect(openAgent).toContain('timeout of 15000 milliseconds')
      expect(openAgent).toContain('Use the shell tool timeout parameter')
      expect(openAgent).toContain('Do not wait, poll, or continue reasoning after the shell tool returns or times out.')

      const closeAgent = fs.readFileSync(closeAgentPath, 'utf8')
      expect(closeAgent).toContain('name: buddy-close')
      expect(closeAgent).toContain('agent')
      expect(closeAgent).toContain('close')
      expect(closeAgent).not.toContain('; printf')
      expect(closeAgent).not.toContain('Write-Output')
      expect(closeAgent).toContain('Kiro Buddy closed.')

      const testAgent = fs.readFileSync(testAgentPath, 'utf8')
      expect(testAgent).toContain('name: buddy-test')
      expect(testAgent).toContain('agent')
      expect(testAgent).toContain('test')
      expect(testAgent).not.toContain('; printf')
      expect(testAgent).not.toContain('Write-Output')
      expect(testAgent).toContain('Kiro Buddy visual test started.')
      expect(trustedCommands).toContain(command)
      expect(trustedCommands).toContain(askingHook.then.command)
      expect(trustedCommands).toContain(openHook.then.command)
      expect(trustedCommands).toContain(closeHook.then.command)
      expect(trustedCommands).toContain(testHook.then.command)
      expect(
        trustedCommands.some(
          (trustedCommand) =>
            normalizeCommand(trustedCommand).includes('bin/kiro-buddy.cjs') &&
            trustedCommand.includes('agent') &&
            trustedCommand.includes('open') &&
            trustedCommand.includes(installMetadata.statusFilePath),
        ),
      ).toBe(true)
      expect(
        trustedCommands.some(
          (trustedCommand) =>
            normalizeCommand(trustedCommand).includes('bin/kiro-buddy.cjs') &&
            trustedCommand.includes('agent') &&
            trustedCommand.includes('test'),
        ),
      ).toBe(true)
    } finally {
      cleanup(tempDir)
    }
  })

  it('simulates Windows IDE hook installation from macOS', () => {
    const tempDir = makeTempDir()
    const homeDir = makeTempDir()

    try {
      fs.mkdirSync(path.join(tempDir, '.kiro', 'hooks'), { recursive: true })
      fs.mkdirSync(path.join(tempDir, '.kiro', 'agents'), { recursive: true })
      fs.writeFileSync(path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-on.kiro.hook'), '{}\n')
      fs.writeFileSync(path.join(tempDir, '.kiro', 'agents', 'buddy-open.md'), 'stale\n')

      const result = runScriptAsWin32('scripts/install-kiro-hooks.cjs', {
        ...process.env,
        HOME: '',
        USERPROFILE: homeDir,
        KIRO_BUDDY_WORKSPACE: tempDir,
      })

      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')

      const installedPowerShellHookPath = path.join(
        tempDir,
        '.kiro',
        'kiro-buddy',
        'kiro-status-hook.ps1',
      )
      expect(fs.existsSync(installedPowerShellHookPath)).toBe(true)
      expect(
        fs.existsSync(path.join(tempDir, '.kiro', 'kiro-buddy', 'kiro-status-hook.cjs')),
      ).toBe(false)
      expect(
        fs.existsSync(path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-on.kiro.hook')),
      ).toBe(false)

      const installMetadata = readJsonFile<{
        packageRoot: string
        statusFilePath: string
        workspaceRoot: string
      }>(
        path.join(tempDir, '.kiro', 'kiro-buddy', 'install.json'),
      )
      expect(installMetadata.packageRoot).toBe(projectRoot)
      expect(installMetadata.workspaceRoot).toBe(tempDir)
      expect(installMetadata.statusFilePath).toContain(
        path.join(homeDir, '.kiro-buddy', 'workspaces'),
      )

      const workingHook = readJsonFile<{ then: { command: string } }>(
        path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-working.kiro.hook'),
      )
      const askingHook = readJsonFile<{ then: { command: string } }>(
        path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-waiting.kiro.hook'),
      )
      const specActivityHook = readJsonFile<{ then: { command: string } }>(
        path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-spec-activity.kiro.hook'),
      )
      const openHook = readJsonFile<{ when: { type: string }; then: { command: string } }>(
        path.join(tempDir, '.kiro', 'hooks', 'buddy-open.kiro.hook'),
      )
      const closeHook = readJsonFile<{ then: { command: string } }>(
        path.join(tempDir, '.kiro', 'hooks', 'buddy-close.kiro.hook'),
      )
      const testHook = readJsonFile<{ then: { command: string } }>(
        path.join(tempDir, '.kiro', 'hooks', 'buddy-test.kiro.hook'),
      )

      expect(workingHook.then.command).toContain('powershell.exe')
      expect(workingHook.then.command).toContain('-ExecutionPolicy Bypass')
      expect(workingHook.then.command).toContain('kiro-status-hook.ps1')
      expect(workingHook.then.command).toContain('working auto')
      expect(workingHook.then.command).toContain(
        `"--status-file=${installMetadata.statusFilePath}"`,
      )
      expect(workingHook.then.command).toContain('--quiet')
      expect(workingHook.then.command).toContain('--source=prompt-submit')
      expect(workingHook.then.command).not.toContain('--read-stdin')
      expect(askingHook.then.command).toContain('asking auto')
      expect(askingHook.then.command).toContain('--quiet')
      expect(askingHook.then.command).toContain('--source=pre-tool')
      expect(askingHook.then.command).not.toContain('--read-stdin')
      expect(specActivityHook.then.command).toContain('--require-phase')
      expect(specActivityHook.then.command).toContain('--quiet')
      expect(specActivityHook.then.command).toContain('--source=spec-activity')
      expect(specActivityHook.then.command).toContain('--fallback-asking-ms=2000')

      expect(openHook.when.type).toBe('userTriggered')
      expect(openHook.then.command).toContain('$env:KIRO_BUDDY_STATUS_FILE=')
      expect(openHook.then.command).toContain('$env:KIRO_BUDDY_PROJECT_PATH=')
      expect(openHook.then.command).toContain(tempDir)
      expect(openHook.then.command).toContain('& "')
      expect(normalizeCommand(openHook.then.command)).toContain('bin/kiro-buddy.cjs')
      expect(openHook.then.command).toContain('open')
      expect(closeHook.then.command).toContain('close')
      expect(testHook.then.command).toContain('test')

      const openAgent = fs.readFileSync(
        path.join(tempDir, '.kiro', 'agents', 'buddy-open.md'),
        'utf8',
      )
      expect(openAgent).toContain('& "')
      expect(openAgent).toContain('agent')
      expect(openAgent).toContain('open')
      expect(openAgent).toContain(`"--status-file=${installMetadata.statusFilePath}"`)
      expect(openAgent).toContain('timeout of 15000 milliseconds')
      expect(openAgent).not.toContain('Write-Output')
      expect(openAgent).not.toContain('; printf')

      const settings = readJsonFile<{ 'kiroAgent.trustedCommands': string[] }>(
        path.join(tempDir, '.vscode', 'settings.json'),
      )
      const trustedCommands = settings['kiroAgent.trustedCommands']
      expect(trustedCommands).toContain(workingHook.then.command)
      expect(trustedCommands).toContain(askingHook.then.command)
      expect(trustedCommands).toContain(openHook.then.command)
      expect(trustedCommands).toContain(closeHook.then.command)
      expect(trustedCommands).toContain(testHook.then.command)
      expect(
        trustedCommands.some(
          (command) =>
            normalizeCommand(command).includes('bin/kiro-buddy.cjs') &&
            command.includes('agent') &&
            command.includes('open') &&
            command.includes(installMetadata.statusFilePath),
        ),
      ).toBe(true)
    } finally {
      cleanup(tempDir)
      cleanup(homeDir)
    }
  })

  it('keeps the Windows PowerShell status hook nonblocking and status-file aware', () => {
    const powerShellHook = fs.readFileSync(
      path.join(projectRoot, 'scripts', 'kiro-status-hook.ps1'),
      'utf8',
    )

    expect(powerShellHook).toContain('function Get-UserHome')
    expect(powerShellHook).toContain(
      '[ValidateSet("idle", "working", "waiting", "asking", "done", "error")]',
    )
    expect(powerShellHook).toContain('ValueFromRemainingArguments = $true')
    expect(powerShellHook).toContain('Get-FlagValue "--status-file="')
    expect(powerShellHook).toContain('function Write-KiroBuddyOutput')
    expect(powerShellHook).toContain('$env:KIRO_BUDDY_FORCE_READ_STDIN -eq "1"')
    expect(powerShellHook).toContain('$startInfo.CreateNoWindow = $true')
    expect(powerShellHook).toContain('$startInfo.RedirectStandardOutput = $true')
    expect(powerShellHook).toContain('$startInfo.RedirectStandardError = $true')
    expect(powerShellHook).toContain('function Get-KiroSignature')
    expect(powerShellHook).toContain('function Get-ProjectPathFromMetadata')
    expect(powerShellHook).toContain('$startInfo.EnvironmentVariables["KIRO_BUDDY_STATUS_FILE"] = $statusFilePath')
    expect(powerShellHook).toContain('$startInfo.EnvironmentVariables["KIRO_BUDDY_PROJECT_PATH"] = $projectPath')
    expect(powerShellHook).toContain('KIRO_BUDDY_ATTACHED_KIRO_SIGNATURE')
    expect(powerShellHook).toContain('--kiro-buddy-status-file=$statusFilePath')
    expect(powerShellHook).toContain('System.Text.UTF8Encoding($false)')
    expect(powerShellHook).toContain('Get-FlagValue "--fallback-asking-ms="')
    expect(powerShellHook).toContain('"--status-file=$statusFilePath"')
    expect(powerShellHook).toContain('$isLateSpecActivityAfterTerminal')
    expect(powerShellHook).toContain('Kiro Buddy: skipped spec activity after $existingStatus')
    expect(powerShellHook).toContain('Join-Path (Get-UserHome) ".kiro\\status.json"')
  })

  it('runs the Windows readiness verifier in simulation mode', () => {
    const homeDir = makeTempDir()

    try {
      const result = spawnSync(process.execPath, ['scripts/verify-windows-ready.cjs'], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: homeDir,
          USERPROFILE: homeDir,
        },
      })

      expect(result.status).toBe(0)
      expect(result.stdout).toContain('Kiro Buddy Windows verification passed.')
      if (process.platform !== 'win32') {
        expect(result.stdout).toContain('Skipped live PowerShell execution')
      }
    } finally {
      cleanup(homeDir)
    }
  })

  it('runs generated Windows IDE hooks through PowerShell and records approval context', () => {
    if (process.platform !== 'win32') {
      return
    }

    const tempDir = makeTempDir()
    try {
      const installResult = spawnSync(process.execPath, ['scripts/install-kiro-hooks.cjs'], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          KIRO_BUDDY_WORKSPACE: tempDir,
        },
      })
      expect(installResult.status).toBe(0)
      const installMetadata = JSON.parse(
        fs.readFileSync(path.join(tempDir, '.kiro', 'kiro-buddy', 'install.json'), 'utf8'),
      )
      const statusFilePath = installMetadata.statusFilePath
      expect(typeof statusFilePath).toBe('string')

      const workingHook = JSON.parse(
        fs.readFileSync(path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-working.kiro.hook'), 'utf8'),
      )
      const askingHook = JSON.parse(
        fs.readFileSync(path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-waiting.kiro.hook'), 'utf8'),
      )
      const doneHook = JSON.parse(
        fs.readFileSync(path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-done.kiro.hook'), 'utf8'),
      )
      const toolRunningHook = JSON.parse(
        fs.readFileSync(
          path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-tool-running.kiro.hook'),
          'utf8',
        ),
      )
      const specActivityHook = JSON.parse(
        fs.readFileSync(
          path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-spec-activity.kiro.hook'),
          'utf8',
        ),
      )

      const workingResult = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', workingHook.then.command],
        {
          cwd: tempDir,
          encoding: 'utf8',
          env: {
            ...process.env,
            KIRO_BUDDY_NO_AUTOSTART: '1',
            USER_PROMPT: 'please update requirements.md',
          },
        },
      )

      expect(workingResult.status).toBe(0)
      expect(JSON.parse(fs.readFileSync(statusFilePath, 'utf8'))).toMatchObject({
        status: 'working',
        message: 'Prompt: please update requirements.md',
        phase: 'requirements',
        context: 'Prompt: please update requirements.md',
      })

      const doneResult = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', doneHook.then.command],
        {
          cwd: tempDir,
          encoding: 'utf8',
          env: {
            ...process.env,
            KIRO_BUDDY_NO_AUTOSTART: '1',
          },
        },
      )

      expect(doneResult.status).toBe(0)
      expect(JSON.parse(fs.readFileSync(statusFilePath, 'utf8'))).toMatchObject({
        status: 'done',
        phase: 'requirements',
      })

      const lateToolResult = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', toolRunningHook.then.command],
        {
          cwd: tempDir,
          encoding: 'utf8',
          env: {
            ...process.env,
            KIRO_BUDDY_NO_AUTOSTART: '1',
          },
        },
      )

      expect(lateToolResult.status).toBe(0)
      expect(lateToolResult.stdout).toBe('')
      expect(JSON.parse(fs.readFileSync(statusFilePath, 'utf8'))).toMatchObject({
        status: 'done',
        phase: 'requirements',
      })

      const lateSpecResult = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', specActivityHook.then.command],
        {
          cwd: tempDir,
          encoding: 'utf8',
          env: {
            ...process.env,
            KIRO_BUDDY_NO_AUTOSTART: '1',
            KIRO_ACTIVE_FILE: path.join(tempDir, 'requirements.md'),
          },
        },
      )

      expect(lateSpecResult.status).toBe(0)
      expect(lateSpecResult.stdout).toBe('')
      expect(JSON.parse(fs.readFileSync(statusFilePath, 'utf8'))).toMatchObject({
        status: 'done',
        phase: 'requirements',
      })

      const askingResult = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', askingHook.then.command],
        {
          cwd: tempDir,
          encoding: 'utf8',
          env: {
            ...process.env,
            KIRO_BUDDY_NO_AUTOSTART: '1',
            KIRO_ACTIVE_FILE: path.join(tempDir, 'requirements.md'),
          },
        },
      )

      expect(askingResult.status).toBe(0)
      expect(JSON.parse(fs.readFileSync(statusFilePath, 'utf8'))).toMatchObject({
        status: 'asking',
        message: 'Kiro is asking for your input',
        phase: 'requirements',
        context: 'requirements.md',
      })
    } finally {
      cleanup(tempDir)
    }
  })

  it('accepts legacy Windows PowerShell --read-stdin flags without blocking', () => {
    if (process.platform !== 'win32') {
      return
    }

    const tempDir = makeTempDir()
    const statusFilePath = path.join(tempDir, 'status.json')

    try {
      const result = spawnSync(
        'powershell.exe',
        [
          '-NoProfile',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          path.join(projectRoot, 'scripts', 'kiro-status-hook.ps1'),
          'working',
          '--read-stdin',
          '--require-phase',
          `--status-file=${statusFilePath}`,
        ],
        {
          cwd: tempDir,
          encoding: 'utf8',
          timeout: 3000,
          env: {
            ...process.env,
            KIRO_BUDDY_NO_AUTOSTART: '1',
            USER_PROMPT: 'please update requirements.md',
          },
        },
      )

      expect(result.error).toBeUndefined()
      expect(result.status).toBe(0)
      expect(result.stdout).toContain('Kiro Buddy: working')
      expect(JSON.parse(fs.readFileSync(statusFilePath, 'utf8'))).toMatchObject({
        status: 'working',
        phase: 'requirements',
        message: 'Prompt: please update requirements.md',
      })
    } finally {
      cleanup(tempDir)
    }
  })

  it('lets users set Buddy size from the CLI', () => {
    const homeDir = makeTempDir()

    try {
      const baseEnv = {
        ...process.env,
        HOME: homeDir,
        USERPROFILE: homeDir,
        KIRO_BUDDY_DRY_RUN: '1',
      }

      const setResult = spawnSync(process.execPath, ['bin/kiro-buddy.cjs', 'size', '80'], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: baseEnv,
      })
      expect(setResult.status).toBe(0)
      expect(setResult.stdout).toContain('Kiro Buddy size: 80%')

      const configPath = path.join(homeDir, '.kiro-buddy', 'config.json')
      expect(JSON.parse(fs.readFileSync(configPath, 'utf8'))).toMatchObject({ petScale: 0.8 })

      const increaseResult = spawnSync(process.execPath, ['bin/kiro-buddy.cjs', 'size', '+'], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: baseEnv,
      })
      expect(increaseResult.status).toBe(0)
      expect(JSON.parse(fs.readFileSync(configPath, 'utf8'))).toMatchObject({ petScale: 0.9 })
    } finally {
      cleanup(homeDir)
    }
  })

  it('does not close a Kiro terminal command that mentions the Buddy status file on macOS', () => {
    if (process.platform === 'win32') {
      return
    }

    const tempDir = makeTempDir()
    const statusFilePath = path.join(tempDir, 'status.json')
    const marker = `KIRO_BUDDY_STATUS_FILE=${statusFilePath}`
    const startResult = spawnSync(
      'sh',
      ['-c', `sh -c 'sleep 30 # ${marker}' >/dev/null 2>&1 & echo $!`],
      {
        encoding: 'utf8',
      },
    )
    const sleeperPid = Number(startResult.stdout.trim())

    try {
      expect(startResult.status).toBe(0)
      expect(Number.isInteger(sleeperPid)).toBe(true)

      const closeResult = spawnSync(process.execPath, ['bin/kiro-buddy.cjs', 'close'], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          KIRO_BUDDY_STATUS_FILE: statusFilePath,
        },
      })

      expect(closeResult.status).toBe(0)
      expect(() => process.kill(sleeperPid, 0)).not.toThrow()
    } finally {
      if (Number.isInteger(sleeperPid)) {
        try {
          process.kill(sleeperPid, 'SIGKILL')
        } catch {}
      }
      cleanup(tempDir)
    }
  })

  it('closes a Buddy Electron process by status file even when it came from another package path on macOS', () => {
    if (process.platform === 'win32') {
      return
    }

    const tempDir = makeTempDir()
    const statusFilePath = path.join(tempDir, 'status.json')
    const fakeElectronPath = path.join(
      tempDir,
      'npm-cache',
      'node_modules',
      'electron',
      'dist',
      'Electron.app',
      'Contents',
      'MacOS',
      'Electron',
    )
    fs.mkdirSync(path.dirname(fakeElectronPath), { recursive: true })
    fs.writeFileSync(fakeElectronPath, '#!/bin/sh\nsleep 30\n', { mode: 0o755 })
    const startResult = spawnSync(
      'sh',
      [
        '-c',
        `"${fakeElectronPath}" /tmp/npm-cache/node_modules/@jagatees/kiro-buddy --kiro-buddy-status-file="${statusFilePath}" >/dev/null 2>&1 & echo $!`,
      ],
      { encoding: 'utf8' },
    )
    const sleeperPid = Number(startResult.stdout.trim())

    try {
      expect(startResult.status).toBe(0)
      expect(Number.isInteger(sleeperPid)).toBe(true)

      const closeResult = spawnSync(process.execPath, ['bin/kiro-buddy.cjs', 'close'], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          KIRO_BUDDY_STATUS_FILE: statusFilePath,
        },
      })

      expect(closeResult.status).toBe(0)
      expect(() => process.kill(sleeperPid, 0)).toThrow()
    } finally {
      if (Number.isInteger(sleeperPid)) {
        try {
          process.kill(sleeperPid, 'SIGKILL')
        } catch {}
      }
      cleanup(tempDir)
    }
  })

  it('replaces stale Kiro Buddy trusted commands for the same workspace', () => {
    const tempDir = makeTempDir()
    const vscodeDir = path.join(tempDir, '.vscode')
    const settingsPath = path.join(vscodeDir, 'settings.json')
    const scriptName = process.platform === 'win32' ? 'kiro-status-hook.ps1' : 'kiro-status-hook.cjs'
    const statusHookPath = path.join(tempDir, '.kiro', 'kiro-buddy', scriptName)
    const cliPath = path.join(projectRoot, 'bin', 'kiro-buddy.cjs')

    try {
      fs.mkdirSync(vscodeDir, { recursive: true })
      fs.writeFileSync(
        settingsPath,
        `${JSON.stringify(
          {
            'kiroAgent.trustedCommands': [
              `"old-node" "${statusHookPath}"`,
              `"old-node" "${cliPath}"`,
              'echo unrelated',
            ],
          },
          null,
          2,
        )}\n`,
        'utf8',
      )

      const result = spawnSync(process.execPath, ['scripts/install-kiro-hooks.cjs'], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          KIRO_BUDDY_WORKSPACE: tempDir,
        },
      })

      expect(result.status).toBe(0)

      const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'))
      const trustedCommands = settings['kiroAgent.trustedCommands'] as string[]

      expect(trustedCommands).toContain('echo unrelated')
      expect(trustedCommands.some((command) => command.includes('old-node'))).toBe(false)
      expect(trustedCommands.some((command) => command.includes(statusHookPath))).toBe(true)
      expect(trustedCommands.some((command) => command.includes(cliPath))).toBe(true)
    } finally {
      cleanup(tempDir)
    }
  })

  it('installs a Kiro CLI agent config with Buddy hooks', () => {
    const tempDir = makeTempDir()
    const homeDir = makeTempDir()

    try {
      const result = spawnSync(process.execPath, ['scripts/install-kiro-cli-hooks.cjs'], {
        cwd: projectRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: homeDir,
          USERPROFILE: homeDir,
          KIRO_BUDDY_WORKSPACE: tempDir,
        },
      })

      expect(result.status).toBe(0)

      const agentPath = path.join(homeDir, '.kiro', 'agents', 'kiro-buddy-cli.json')
      const workspaceAgentPath = path.join(tempDir, '.kiro', 'agents', 'kiro-buddy-cli.json')
      expect(fs.existsSync(agentPath)).toBe(true)
      expect(fs.existsSync(workspaceAgentPath)).toBe(true)

      const config = JSON.parse(fs.readFileSync(agentPath, 'utf8'))
      expect(config.name).toBe('kiro-buddy-cli')
      expect(normalizeCommand(config.hooks.agentSpawn[0].command)).toContain(
        'bin/kiro-buddy.cjs',
      )
      expect(config.hooks.agentSpawn[0].command).toContain('cli')
      expect(config.hooks.agentSpawn[0].command).toContain('open')
      expect(config.hooks.agentSpawn[0].command).toContain('KIRO_BUDDY_PROJECT_PATH=')
      expect(config.hooks.userPromptSubmit[0].command).toContain('kiro-status-hook.cjs')
      expect(config.hooks.userPromptSubmit[0].command).toContain('working')
      expect(config.hooks.userPromptSubmit[0].command).toContain('--quiet')
      expect(config.hooks.userPromptSubmit[0].command).toContain('--source=prompt-submit')
      expect(config.hooks.userPromptSubmit[0].command).toContain('KIRO_BUDDY_PROJECT_PATH=')
      expect(config.hooks.preToolUse[0].matcher).toBe('*')
      expect(config.hooks.preToolUse[0].command).toContain('kiro-status-hook.cjs')
      expect(config.hooks.preToolUse[0].command).toContain('asking')
      expect(config.hooks.preToolUse[0].command).toContain('--quiet')
      expect(config.hooks.preToolUse[0].command).toContain('--source=pre-tool')
      expect(config.hooks.preToolUse[0].command).toContain('KIRO_BUDDY_PROJECT_PATH=')
      if (process.platform === 'win32') {
        expect(config.hooks.agentSpawn[0].command).toContain('& "')
        expect(config.hooks.userPromptSubmit[0].command).toContain('& "')
        expect(config.hooks.preToolUse[0].command).toContain('& "')
      }
      expect(config.hooks.postToolUse[0].matcher).toBe('*')
      expect(config.hooks.postToolUse[0].command).toContain('--quiet')
      expect(config.hooks.postToolUse[0].command).toContain('--source=post-tool')
      expect(config.hooks.stop[0].command).toContain('done')
      expect(config.hooks.stop[0].command).toContain('--quiet')
      expect(config.hooks.stop[0].command).toContain('--source=agent-stop')
    } finally {
      cleanup(tempDir)
      cleanup(homeDir)
    }
  })

  it('simulates Windows Kiro CLI agent config from macOS', () => {
    const tempDir = makeTempDir()
    const homeDir = makeTempDir()

    try {
      const result = runScriptAsWin32('scripts/install-kiro-cli-hooks.cjs', {
        ...process.env,
        HOME: homeDir,
        USERPROFILE: homeDir,
        KIRO_BUDDY_WORKSPACE: tempDir,
      })

      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')

      const agentPath = path.join(homeDir, '.kiro', 'agents', 'kiro-buddy-cli.json')
      const workspaceAgentPath = path.join(tempDir, '.kiro', 'agents', 'kiro-buddy-cli.json')
      expect(fs.existsSync(agentPath)).toBe(true)
      expect(fs.existsSync(workspaceAgentPath)).toBe(true)

      const config = readJsonFile<{
        hooks: {
          agentSpawn: Array<{ command: string }>
          userPromptSubmit: Array<{ command: string }>
          preToolUse: Array<{ matcher: string; command: string }>
          postToolUse: Array<{ matcher: string; command: string }>
          stop: Array<{ command: string }>
        }
      }>(agentPath)

      expect(config.hooks.agentSpawn[0].command).toContain('$env:KIRO_BUDDY_PROJECT_PATH=')
      expect(config.hooks.agentSpawn[0].command).toContain('& "')
      expect(normalizeCommand(config.hooks.agentSpawn[0].command)).toContain(
        'bin/kiro-buddy.cjs',
      )
      expect(config.hooks.agentSpawn[0].command).toContain('cli')
      expect(config.hooks.agentSpawn[0].command).toContain('open')
      expect(config.hooks.userPromptSubmit[0].command).toContain('$env:KIRO_BUDDY_PROJECT_PATH=')
      expect(config.hooks.userPromptSubmit[0].command).toContain('& "')
      expect(config.hooks.userPromptSubmit[0].command).toContain('kiro-status-hook.cjs')
      expect(config.hooks.userPromptSubmit[0].command).toContain('working')
      expect(config.hooks.userPromptSubmit[0].command).toContain('--read-stdin')
      expect(config.hooks.userPromptSubmit[0].command).toContain('--quiet')
      expect(config.hooks.userPromptSubmit[0].command).toContain('--source=prompt-submit')
      expect(config.hooks.preToolUse[0].matcher).toBe('*')
      expect(config.hooks.preToolUse[0].command).toContain('$env:KIRO_BUDDY_PROJECT_PATH=')
      expect(config.hooks.preToolUse[0].command).toContain('& "')
      expect(config.hooks.preToolUse[0].command).toContain('asking')
      expect(config.hooks.preToolUse[0].command).toContain('--quiet')
      expect(config.hooks.preToolUse[0].command).toContain('--source=pre-tool')
      expect(config.hooks.postToolUse[0].matcher).toBe('*')
      expect(config.hooks.postToolUse[0].command).toContain('working')
      expect(config.hooks.postToolUse[0].command).toContain('--quiet')
      expect(config.hooks.postToolUse[0].command).toContain('--source=post-tool')
      expect(config.hooks.stop[0].command).toContain('done')
      expect(config.hooks.stop[0].command).toContain('--quiet')
      expect(config.hooks.stop[0].command).toContain('--source=agent-stop')
    } finally {
      cleanup(tempDir)
      cleanup(homeDir)
    }
  })

  it('routes CLI status hooks to a session status file when a session id is set', () => {
    const tempDir = makeTempDir()
    const homeDir = makeTempDir()
    const sessionId = 'cli-session-routing-test'

    try {
      const result = spawnSync(
        process.execPath,
        ['scripts/kiro-status-hook.cjs', 'working'],
        {
          cwd: projectRoot,
          encoding: 'utf8',
          env: {
            ...process.env,
            HOME: homeDir,
            USERPROFILE: homeDir,
            KIRO_BUDDY_NO_AUTOSTART: '1',
            KIRO_BUDDY_SESSION_ID: sessionId,
          },
        },
      )

      expect(result.status).toBe(0)

      const sessionStatusPath = path.join(
        homeDir,
        '.kiro-buddy',
        'sessions',
        sessionId,
        'status.json',
      )
      expect(JSON.parse(fs.readFileSync(sessionStatusPath, 'utf8'))).toMatchObject({
        status: 'working',
        message: 'Kiro is working',
      })
      expect(fs.existsSync(path.join(homeDir, '.kiro', 'status.json'))).toBe(false)
    } finally {
      cleanup(tempDir)
      cleanup(homeDir)
    }
  })
})
