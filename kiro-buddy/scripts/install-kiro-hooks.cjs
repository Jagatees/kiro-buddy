const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const workspaceRoot = path.resolve(process.env.KIRO_BUDDY_WORKSPACE || process.cwd())
const hookDir = path.join(workspaceRoot, '.kiro', 'hooks')
const agentDir = path.join(workspaceRoot, '.kiro', 'agents')
const isWindows = process.platform === 'win32'
const sourceStatusHookPath = path.join(
  __dirname,
  isWindows ? 'kiro-status-hook.ps1' : 'kiro-status-hook.cjs',
)
const installedScriptDir = path.join(workspaceRoot, '.kiro', 'kiro-buddy')
const installMetadataPath = path.join(installedScriptDir, 'install.json')
const statusHookPath = path.join(
  installedScriptDir,
  isWindows ? 'kiro-status-hook.ps1' : 'kiro-status-hook.cjs',
)
const cliPath = path.join(path.resolve(__dirname, '..'), 'bin', 'kiro-buddy.cjs')
const vscodeSettingsPath = path.join(workspaceRoot, '.vscode', 'settings.json')
const workspaceFolderName = path.basename(workspaceRoot)

function userHomeForStatusFile() {
  return isWindows
    ? process.env.USERPROFILE || process.env.HOME || workspaceRoot
    : process.env.HOME || process.env.USERPROFILE || workspaceRoot
}

const workspaceStatusFilePath = path.join(
  userHomeForStatusFile(),
  '.kiro-buddy',
  'workspaces',
  crypto.createHash('sha1').update(workspaceRoot).digest('hex').slice(0, 12),
  'status.json',
)

function quoteCommandArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`
}

function quoteShellEnvValue(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`
}

function quotePowerShellArg(value) {
  return `'${String(value).replace(/'/g, "''")}'`
}

function commandFor(status, phase, options = {}) {
  const extraArgs = [
    ...(isWindows ? [`--status-file=${workspaceStatusFilePath}`] : []),
    ...(options.readStdin && !isWindows ? ['--read-stdin'] : []),
    ...(options.quiet ? ['--quiet'] : []),
    ...(options.source ? [`--source=${options.source}`] : []),
    ...(options.requirePhase ? ['--require-phase'] : []),
    ...(typeof options.delayMs === 'number' ? [`--delay-ms=${options.delayMs}`] : []),
    ...(typeof options.fallbackAskingMs === 'number'
      ? [`--fallback-asking-ms=${options.fallbackAskingMs}`]
      : []),
  ]
  const env = {
    KIRO_BUDDY_STATUS_FILE: workspaceStatusFilePath,
    KIRO_BUDDY_PROJECT_PATH: workspaceRoot,
  }

  const args = isWindows
    ? [
        'powershell.exe',
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        quoteCommandArg(statusHookPath),
        status,
      ]
    : [
        ...Object.entries(env).map(([key, value]) => `${key}=${quoteShellEnvValue(value)}`),
        quoteCommandArg(process.execPath),
        quoteCommandArg(statusHookPath),
        status,
      ]

  if (phase) {
    args.push(phase)
  } else if (isWindows && extraArgs.length > 0) {
    args.push('auto')
  }
  args.push(...(isWindows ? extraArgs.map(quoteCommandArg) : extraArgs))

  return args.join(' ')
}

function controlCommandFor(action) {
  const command = [quoteCommandArg(process.execPath), quoteCommandArg(cliPath), action].join(' ')
  if (isWindows) {
    return command
  }

  return [
    `KIRO_BUDDY_STATUS_FILE=${quoteShellEnvValue(workspaceStatusFilePath)}`,
    `KIRO_BUDDY_PROJECT_PATH=${quoteShellEnvValue(workspaceRoot)}`,
    command,
  ].join(' ')
}

function controlShellCommandFor(action) {
  if (isWindows) {
    return [
      `$env:KIRO_BUDDY_STATUS_FILE=${quotePowerShellArg(workspaceStatusFilePath)};`,
      `$env:KIRO_BUDDY_PROJECT_PATH=${quotePowerShellArg(workspaceRoot)};`,
      '&',
      quoteCommandArg(process.execPath),
      quoteCommandArg(cliPath),
      action,
    ].join(' ')
  }

  return controlCommandFor(action)
}

function agentControlShellCommandFor(action) {
  const args = [
    quoteCommandArg(process.execPath),
    quoteCommandArg(cliPath),
    'agent',
    action,
  ]
  if (isWindows) {
    return [
      `$env:KIRO_BUDDY_PROJECT_PATH=${quotePowerShellArg(workspaceRoot)};`,
      '&',
      ...args,
      quoteCommandArg(`--status-file=${workspaceStatusFilePath}`),
    ].join(' ')
  }

  return [
    `KIRO_BUDDY_STATUS_FILE=${quoteShellEnvValue(workspaceStatusFilePath)}`,
    `KIRO_BUDDY_PROJECT_PATH=${quoteShellEnvValue(workspaceRoot)}`,
    args.join(' '),
  ].join(' ')
}

function slashAgentShellCommandFor(action) {
  return agentControlShellCommandFor(action)
}

function trustedCommandPrefix() {
  if (isWindows) {
    return [
      'powershell.exe',
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      quoteCommandArg(statusHookPath),
    ].join(' ')
  }

  return [quoteCommandArg(process.execPath), quoteCommandArg(statusHookPath)].join(' ')
}

function trustedControlCommandPrefix() {
  return [quoteCommandArg(process.execPath), quoteCommandArg(cliPath)].join(' ')
}

function trustedControlShellCommandPrefix() {
  if (isWindows) {
    return ['&', quoteCommandArg(process.execPath), quoteCommandArg(cliPath)].join(' ')
  }

  return trustedControlCommandPrefix()
}

function hookFileName(shortName) {
  return path.join(hookDir, `${shortName}.kiro.hook`)
}

function writeHook(shortName, hook) {
  const filePath = hookFileName(shortName)
  const json = `${JSON.stringify(hook, null, 2)}\n`
  fs.writeFileSync(filePath, json, 'utf8')
  return filePath
}

function agentFileName(name) {
  return path.join(agentDir, `${name}.md`)
}

function writeAgent(name, description, action, doneMessage) {
  const command = slashAgentShellCommandFor(action)
  const filePath = agentFileName(name)
  const markdown = `---
name: ${name}
description: ${description}
tools: ["shell"]
allowedTools: ["shell"]
includeMcpJson: false
includePowers: false
---

You run one Kiro Buddy control command.

Call the shell tool exactly once with this command and a timeout of 15000 milliseconds:

\`\`\`shell
${command}
\`\`\`

Use the shell tool timeout parameter, not a shell timeout command. If the shell tool returns
because of that timeout, treat the Kiro Buddy command as finished and immediately reply with
exactly:

${doneMessage}

Rules:
- Do not inspect files.
- Do not ask questions.
- Do not call any other tool.
- Do not follow terminal output.
- Do not wait, poll, or continue reasoning after the shell tool returns or times out.
`

  fs.writeFileSync(filePath, markdown, 'utf8')
  return filePath
}

function removeStaleHook(shortName) {
  const filePath = hookFileName(shortName)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
}

function removeStaleAgent(name) {
  const filePath = path.join(workspaceRoot, '.kiro', 'agents', `${name}.md`)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
}

function installWorkspaceTrustedCommand() {
  const trustedPrefix = trustedCommandPrefix()
  const trustedControlPrefix = trustedControlCommandPrefix()
  let settings = {}

  if (fs.existsSync(vscodeSettingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(vscodeSettingsPath, 'utf8'))
    } catch {
      console.warn(
        `Skipped Kiro trusted command setup because ${vscodeSettingsPath} is not plain JSON.`,
      )
      return null
    }
  }

  const current = Array.isArray(settings['kiroAgent.trustedCommands'])
    ? settings['kiroAgent.trustedCommands']
    : []

  const nextTrustedCommands = current.filter(
    (command) => !command.includes(statusHookPath) && !command.includes(cliPath),
  )
  for (const command of [
    trustedPrefix,
    trustedControlPrefix,
    trustedControlShellCommandPrefix(),
    ...hooks.map((hook) => hook.command),
    controlShellCommandFor('open'),
    controlShellCommandFor('close'),
    controlShellCommandFor('test'),
    agentControlShellCommandFor('open'),
    agentControlShellCommandFor('close'),
    agentControlShellCommandFor('test'),
    slashAgentShellCommandFor('open'),
    slashAgentShellCommandFor('close'),
    slashAgentShellCommandFor('test'),
  ]) {
    if (!nextTrustedCommands.includes(command)) {
      nextTrustedCommands.push(command)
    }
  }

  if (JSON.stringify(nextTrustedCommands) !== JSON.stringify(current)) {
    settings['kiroAgent.trustedCommands'] = nextTrustedCommands
    fs.mkdirSync(path.dirname(vscodeSettingsPath), { recursive: true })
    fs.writeFileSync(vscodeSettingsPath, `${JSON.stringify(settings, null, 2)}\n`, 'utf8')
  }

  return trustedPrefix
}

const hooks = [
  {
    shortName: 'buddy-open',
    name: 'Kiro Buddy Open',
    description: 'Opens Kiro Buddy manually and switches it to the ready idle state.',
    when: { type: 'userTriggered' },
    command: controlShellCommandFor('open'),
  },
  {
    shortName: 'buddy-close',
    name: 'Kiro Buddy Close',
    description: 'Closes Kiro Buddy manually until it is opened again.',
    when: { type: 'userTriggered' },
    command: controlShellCommandFor('close'),
  },
  {
    shortName: 'buddy-test',
    name: 'Kiro Buddy Visual Test',
    description: 'Runs Kiro Buddy visual test mode manually.',
    when: { type: 'userTriggered' },
    command: controlShellCommandFor('test'),
  },
  {
    shortName: 'kiro-buddy-working',
    name: 'Kiro Buddy Working',
    description:
      'Notifies Kiro Buddy to switch to working whenever a prompt is submitted to the agent.',
    when: { type: 'promptSubmit' },
    command: commandFor('working', undefined, {
      readStdin: true,
      quiet: true,
      source: 'prompt-submit',
    }),
  },
  {
    shortName: 'kiro-buddy-waiting',
    name: 'Kiro Buddy Asking For Input',
    description:
      'Automatically switches Kiro Buddy to asking when Kiro waits for user approval or input.',
    when: { type: 'preToolUse' },
    command: commandFor('asking', undefined, {
      readStdin: true,
      quiet: true,
      source: 'pre-tool',
    }),
  },
  {
    shortName: 'kiro-buddy-tool-running',
    name: 'Kiro Buddy Tool Running',
    description:
      'Switches Kiro Buddy back to working after an approved tool or command runs.',
    when: { type: 'postToolUse' },
    command: commandFor('working', undefined, {
      readStdin: true,
      quiet: true,
      source: 'post-tool',
    }),
  },
  {
    shortName: 'kiro-buddy-done',
    name: 'Kiro Buddy Done',
    description:
      'Notifies Kiro Buddy to switch to done whenever the agent stops responding.',
    when: { type: 'agentStop' },
    command: commandFor('done', undefined, { quiet: true, source: 'agent-stop' }),
  },
  {
    shortName: 'kiro-buddy-error-test',
    name: 'Kiro Buddy Error Test',
    description: 'Manually triggers the Kiro Buddy error state for testing.',
    when: { type: 'userTriggered' },
    command: commandFor('error'),
  },
  {
    shortName: 'kiro-buddy-asking-test',
    name: 'Kiro Buddy Asking Test',
    description: 'Manually triggers the Kiro Buddy asking state for testing user-input prompts.',
    when: { type: 'userTriggered' },
    command: commandFor('asking'),
  },
  {
    shortName: 'kiro-buddy-spec-activity',
    name: 'Kiro Buddy Spec Activity',
    description:
      'Keeps Kiro Buddy working during spec work and adds Design, Requirements, or Task List label context.',
    when: { type: 'postToolUse', toolTypes: ['write', 'spec'] },
    command: commandFor('working', undefined, {
      readStdin: true,
      quiet: true,
      source: 'spec-activity',
      requirePhase: true,
      fallbackAskingMs: 2000,
    }),
  },
]

if (!fs.existsSync(sourceStatusHookPath)) {
  console.error(`Missing status hook script: ${sourceStatusHookPath}`)
  process.exit(1)
}

fs.mkdirSync(hookDir, { recursive: true })
fs.mkdirSync(agentDir, { recursive: true })
fs.mkdirSync(installedScriptDir, { recursive: true })
const trustedPrefix = installWorkspaceTrustedCommand()
removeStaleHook('kiro-buddy-on')
removeStaleHook('kiro-buddy-close')
removeStaleHook('kiro-buddy-start')
removeStaleHook('kiro-buddy-workspace-load')
removeStaleHook('kiro-buddy-design-test')
removeStaleHook('kiro-buddy-requirements-test')
removeStaleHook('kiro-buddy-tasks-test')
fs.copyFileSync(sourceStatusHookPath, statusHookPath)
fs.writeFileSync(
  installMetadataPath,
  `${JSON.stringify(
    {
      packageRoot: path.resolve(__dirname, '..'),
      statusFilePath: workspaceStatusFilePath,
      workspaceRoot,
    },
    null,
    2,
  )}\n`,
  'utf8',
)

const written = hooks.map(({ shortName, name, description, when, command, enabled = true }) =>
  writeHook(shortName, {
    enabled,
    name,
    description,
    version: '1',
    when,
    then: {
      type: 'runCommand',
      command,
    },
    workspaceFolderName,
    shortName,
  }),
)
const writtenAgents = [
  writeAgent(
    'buddy-open',
    'Open Kiro Buddy from the slash command box.',
    'open',
    'Kiro Buddy opened.',
  ),
  writeAgent(
    'buddy-close',
    'Close Kiro Buddy from the slash command box.',
    'close',
    'Kiro Buddy closed.',
  ),
  writeAgent(
    'buddy-test',
    'Run Kiro Buddy visual test mode from the slash command box.',
    'test',
    'Kiro Buddy visual test started.',
  ),
]

console.log(`Installed Kiro Buddy status script into ${statusHookPath}`)
console.log(`Installed ${written.length} Kiro Buddy hooks into ${hookDir}`)
console.log(`Installed ${writtenAgents.length} Kiro Buddy slash agents into ${agentDir}`)
if (trustedPrefix) {
  console.log(`Trusted Kiro Buddy hook command prefix in ${vscodeSettingsPath}`)
}
for (const filePath of written) {
  console.log(`- ${path.basename(filePath)}`)
}
for (const filePath of writtenAgents) {
  console.log(`- ${path.basename(filePath)}`)
}
