const fs = require('fs')
const path = require('path')

const workspaceRoot = path.resolve(process.env.KIRO_BUDDY_WORKSPACE || process.cwd())
const hookDir = path.join(workspaceRoot, '.kiro', 'hooks')
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
const workspaceFolderName = path.basename(workspaceRoot)

function quoteCommandArg(value) {
  return `"${String(value).replace(/"/g, '\\"')}"`
}

function commandFor(status, phase) {
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
    : [quoteCommandArg(process.execPath), quoteCommandArg(statusHookPath), status]

  if (phase) {
    args.push(phase)
  }

  return args.join(' ')
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

const hooks = [
  {
    shortName: 'kiro-buddy-start',
    name: 'Kiro Buddy On',
    description: 'Turns Kiro Buddy on manually and switches it to the ready idle state.',
    when: { type: 'userTriggered' },
    command: commandFor('idle'),
  },
  {
    shortName: 'kiro-buddy-working',
    name: 'Kiro Buddy Working',
    description:
      'Notifies Kiro Buddy to switch to working whenever a prompt is submitted to the agent.',
    when: { type: 'promptSubmit' },
    command: commandFor('working'),
  },
  {
    shortName: 'kiro-buddy-done',
    name: 'Kiro Buddy Done',
    description:
      'Notifies Kiro Buddy to switch to done whenever the agent stops responding.',
    when: { type: 'agentStop' },
    command: commandFor('done'),
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
    shortName: 'kiro-buddy-design-test',
    name: 'Kiro Buddy Design Test',
    description: 'Manually tests the Kiro Buddy design spec phase label.',
    when: { type: 'userTriggered' },
    command: commandFor('working', 'design'),
  },
  {
    shortName: 'kiro-buddy-requirements-test',
    name: 'Kiro Buddy Requirements Test',
    description: 'Manually tests the Kiro Buddy requirements spec phase label.',
    when: { type: 'userTriggered' },
    command: commandFor('working', 'requirements'),
  },
  {
    shortName: 'kiro-buddy-tasks-test',
    name: 'Kiro Buddy Task List Test',
    description: 'Manually tests the Kiro Buddy task list spec phase label.',
    when: { type: 'userTriggered' },
    command: commandFor('working', 'tasks'),
  },
]

if (!fs.existsSync(sourceStatusHookPath)) {
  console.error(`Missing status hook script: ${sourceStatusHookPath}`)
  process.exit(1)
}

fs.mkdirSync(hookDir, { recursive: true })
fs.mkdirSync(installedScriptDir, { recursive: true })
fs.copyFileSync(sourceStatusHookPath, statusHookPath)
fs.writeFileSync(
  installMetadataPath,
  `${JSON.stringify({ packageRoot: path.resolve(__dirname, '..') }, null, 2)}\n`,
  'utf8',
)

const written = hooks.map(({ shortName, name, description, when, command }) =>
  writeHook(shortName, {
    enabled: true,
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

console.log(`Installed Kiro Buddy status script into ${statusHookPath}`)
console.log(`Installed ${written.length} Kiro Buddy hooks into ${hookDir}`)
for (const filePath of written) {
  console.log(`- ${path.basename(filePath)}`)
}
