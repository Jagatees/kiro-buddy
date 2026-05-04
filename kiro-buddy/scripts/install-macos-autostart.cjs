#!/usr/bin/env node

const fs = require('fs')
const os = require('os')
const path = require('path')
const { execFileSync } = require('child_process')

const packageRoot = path.resolve(__dirname, '..')
const label = 'com.jagatees.kiro-buddy.autostart'
const launchAgentsDir = path.join(os.homedir(), 'Library', 'LaunchAgents')
const plistPath = path.join(launchAgentsDir, `${label}.plist`)
const watcherPath = path.join(packageRoot, 'scripts', 'kiro-buddy-autostart.cjs')
const nodePath = process.execPath

function escapePlist(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function runLaunchctl(args) {
  try {
    execFileSync('launchctl', args, { stdio: 'ignore' })
  } catch {
    // launchctl exits non-zero when a job is not loaded; that is fine here.
  }
}

if (process.platform !== 'darwin') {
  console.error('macOS autostart installation is only supported on macOS.')
  process.exit(1)
}

fs.mkdirSync(launchAgentsDir, { recursive: true })

const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapePlist(label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${escapePlist(nodePath)}</string>
    <string>${escapePlist(watcherPath)}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${escapePlist(path.join(os.homedir(), 'Library', 'Logs', 'kiro-buddy-autostart.log'))}</string>
  <key>StandardErrorPath</key>
  <string>${escapePlist(path.join(os.homedir(), 'Library', 'Logs', 'kiro-buddy-autostart.err.log'))}</string>
</dict>
</plist>
`

fs.writeFileSync(plistPath, plist, 'utf8')

const guiDomain = `gui/${process.getuid()}`
runLaunchctl(['bootout', `${guiDomain}/${label}`])
runLaunchctl(['bootout', guiDomain, plistPath])
runLaunchctl(['bootstrap', guiDomain, plistPath])
runLaunchctl(['kickstart', '-k', `${guiDomain}/${label}`])

console.log(`Installed Kiro Buddy macOS autostart watcher: ${plistPath}`)
