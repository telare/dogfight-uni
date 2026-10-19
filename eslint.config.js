import js from '@eslint/js'
import globals from 'globals'
import prettier from 'eslint-config-prettier'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['**/dist/**', 'node_modules/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^_' }],
    },
  },
  prettier,
]
