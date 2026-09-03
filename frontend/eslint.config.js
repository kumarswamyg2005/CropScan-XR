import js from '@eslint/js'
import reactHooks from 'eslint-plugin-react-hooks'
import globals from 'globals'

/**
 * Minimal config with one job: catch hooks-order bugs.
 *
 * A `useCallback` written inline in JSX, inside a conditional branch and below
 * two early returns, shipped and crashed the field module with "Rendered more
 * hooks than during the previous render". It is invisible in review and the
 * linter that exists for exactly this was not installed.
 */
export default [
  { ignores: ['dist/**', 'node_modules/**', 'e2e/**', 'scripts/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Off: without eslint-plugin-react this cannot see a component used in
      // JSX, so every import in every file reads as unused. Pure noise, and
      // noise is how a real error gets scrolled past.
      'no-unused-vars': 'off',
    },
  },
]
