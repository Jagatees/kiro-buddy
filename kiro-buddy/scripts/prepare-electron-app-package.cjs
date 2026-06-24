#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const projectRoot = path.resolve(__dirname, '..')
const appDir = path.join(projectRoot, '.electron-app')
const distDir = path.join(projectRoot, 'dist')
const sourcePackagePath = path.join(projectRoot, 'package.json')
const stagedPackagePath = path.join(appDir, 'package.json')

if (!fs.existsSync(distDir)) {
  console.error('Missing dist/. Run npm run build before packaging the Electron app.')
  process.exit(1)
}

const sourcePackage = JSON.parse(fs.readFileSync(sourcePackagePath, 'utf8'))
const dependencies = { ...(sourcePackage.dependencies || {}) }
delete dependencies.electron

const stagedPackage = {
  name: 'kiro-buddy',
  version: sourcePackage.version,
  description: sourcePackage.description,
  main: sourcePackage.main,
  author: sourcePackage.author || 'Jagatees',
  dependencies,
}

fs.rmSync(appDir, { recursive: true, force: true })
fs.mkdirSync(appDir, { recursive: true })
fs.cpSync(distDir, path.join(appDir, 'dist'), { recursive: true })
fs.writeFileSync(stagedPackagePath, `${JSON.stringify(stagedPackage, null, 2)}\n`, 'utf8')

console.log(`Prepared Electron app package at ${appDir}`)
