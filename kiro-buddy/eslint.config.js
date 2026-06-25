const tseslint = require('typescript-eslint')

module.exports = [
  {
    ignores: ['dist/**', 'release/**', '.electron-app/**', 'node_modules/**'],
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['src/**/*.ts'],
  })),
  {
    files: ['src/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
        },
      ],
    },
  },
]
