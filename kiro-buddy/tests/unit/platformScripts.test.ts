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

      const workingHook = JSON.parse(
        fs.readFileSync(path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-working.kiro.hook'), 'utf8'),
      )
      const command = workingHook.then.command as string
      const openHook = JSON.parse(
        fs.readFileSync(path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-on.kiro.hook'), 'utf8'),
      )
      const askingHook = JSON.parse(
        fs.readFileSync(path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-waiting.kiro.hook'), 'utf8'),
      )
      const settings = JSON.parse(fs.readFileSync(path.join(tempDir, '.vscode', 'settings.json'), 'utf8'))
      const trustedCommands = settings['kiroAgent.trustedCommands'] as string[]

      if (process.platform === 'win32') {
        expect(command).toContain('powershell.exe')
        expect(command).toContain('kiro-status-hook.ps1')
        expect(command).toContain('--read-stdin')
        expect(command).toContain('$env:KIRO_BUDDY_STATUS_FILE')
        expect(openHook.then.command).toContain('& "')
        expect(openHook.then.command).toContain('$env:KIRO_BUDDY_STATUS_FILE')
        expect(askingHook.then.command).toContain('kiro-status-hook.ps1')
        expect(askingHook.then.command).toContain('asking')
        expect(askingHook.then.command).toContain('--read-stdin')
      } else {
        expect(command).toContain('KIRO_BUDDY_STATUS_FILE=')
        expect(command).toContain(installMetadata.statusFilePath)
        expect(command).toContain(process.execPath)
        expect(command).toContain('kiro-status-hook.cjs')
        expect(command).not.toContain('powershell.exe')
        expect(openHook.then.command).toContain('KIRO_BUDDY_STATUS_FILE=')
        expect(openHook.then.command).toContain(installMetadata.statusFilePath)
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
      expect(openAgent).toContain(process.execPath)
      expect(normalizeCommand(openAgent)).toContain('bin/kiro-buddy.cjs')
      expect(openAgent).toContain(installMetadata.statusFilePath)
      expect(openAgent).toContain('open')

      const testAgent = fs.readFileSync(testAgentPath, 'utf8')
      expect(testAgent).toContain('name: buddy-test')
      expect(testAgent).toContain('test')
      expect(testAgent).toContain(installMetadata.statusFilePath)
      expect(testAgent).toContain('Your first action must be to call the shell tool')
      expect(testAgent).toContain('Run Command Hook output is ambient Buddy status')
      expect(trustedCommands).toContain(command)
      expect(trustedCommands).toContain(askingHook.then.command)
      expect(trustedCommands).toContain(openHook.then.command)
      expect(
        trustedCommands.some(
          (trustedCommand) =>
            normalizeCommand(trustedCommand).includes('bin/kiro-buddy.cjs') &&
            trustedCommand.includes('test'),
        ),
      ).toBe(true)
    } finally {
      cleanup(tempDir)
    }
  })

  it('runs generated Windows IDE hooks through PowerShell and records approval context', () => {
    if (process.platform !== 'win32') {
      return
    }

    const tempDir = makeTempDir()
    const statusFilePath = path.join(tempDir, 'status.json')

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

      const workingHook = JSON.parse(
        fs.readFileSync(path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-working.kiro.hook'), 'utf8'),
      )
      const askingHook = JSON.parse(
        fs.readFileSync(path.join(tempDir, '.kiro', 'hooks', 'kiro-buddy-waiting.kiro.hook'), 'utf8'),
      )

      const promptEvent = JSON.stringify({
        hook_event_name: 'promptSubmit',
        prompt: 'please update requirements.md',
      })
      const workingResult = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', workingHook.then.command],
        {
          cwd: tempDir,
          encoding: 'utf8',
          input: promptEvent,
          env: {
            ...process.env,
            KIRO_BUDDY_NO_AUTOSTART: '1',
            KIRO_BUDDY_STATUS_FILE: statusFilePath,
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

      const approvalEvent = JSON.stringify({
        hook_event_name: 'preToolUse',
        tool_name: 'write',
        path: path.join(tempDir, 'requirements.md'),
      })
      const askingResult = spawnSync(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', askingHook.then.command],
        {
          cwd: tempDir,
          encoding: 'utf8',
          input: approvalEvent,
          env: {
            ...process.env,
            KIRO_BUDDY_NO_AUTOSTART: '1',
            KIRO_BUDDY_STATUS_FILE: statusFilePath,
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
      expect(normalizeCommand(config.hooks.agentSpawn[0].command)).toContain('bin/kiro-buddy.cjs')
      expect(config.hooks.agentSpawn[0].command).toContain('cli')
      expect(config.hooks.agentSpawn[0].command).toContain('open')
      expect(config.hooks.userPromptSubmit[0].command).toContain('kiro-status-hook.cjs')
      expect(config.hooks.userPromptSubmit[0].command).toContain('working')
      expect(config.hooks.preToolUse[0].matcher).toBe('*')
      expect(config.hooks.preToolUse[0].command).toContain('kiro-status-hook.cjs')
      expect(config.hooks.preToolUse[0].command).toContain('asking')
      if (process.platform === 'win32') {
        expect(config.hooks.agentSpawn[0].command).toMatch(/^&\s+"/)
        expect(config.hooks.userPromptSubmit[0].command).toMatch(/^&\s+"/)
        expect(config.hooks.preToolUse[0].command).toMatch(/^&\s+"/)
      }
      expect(config.hooks.postToolUse[0].matcher).toBe('*')
      expect(config.hooks.stop[0].command).toContain('done')
    } finally {
      cleanup(tempDir)
      cleanup(homeDir)
    }
  })
})
