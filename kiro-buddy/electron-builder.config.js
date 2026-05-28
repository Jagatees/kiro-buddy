/**
 * Electron Builder configuration for Kiro Buddy
 */
module.exports = {
  appId: 'com.kiro.buddy',
  productName: 'Kiro Buddy',
  copyright: 'Copyright © 2024',

  directories: {
    output: 'release',
    buildResources: 'assets'
  },

  files: [
    'dist/**/*',
    'package.json'
  ],

  win: {
    target: ['nsis', 'portable'],
    icon: 'assets/icon.ico'
  },

  mac: {
    target: ['dmg', 'zip'],
    icon: 'assets/icon.icns',
    category: 'public.app-category.developer-tools'
  },

  linux: {
    target: ['AppImage', 'deb'],
    icon: 'assets/icon.png',
    category: 'Development'
  },

  nsis: {
    oneClick: false,
    allowToChangeInstallationDirectory: true
  },

  // Reference the preload script for packaging
  extraMetadata: {
    main: 'dist/main/main/index.js'
  },

  // Ensure preload script is included
  asar: true,
  asarUnpack: []
}
