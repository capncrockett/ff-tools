import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import globals from 'globals'
import hooks from 'eslint-plugin-react-hooks'

export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'coverage/**',
      '.local/**',
      '.cache/**',
      'commish-recap/**',
      'flea-flicker/**',
      'sleeper-lfas/**',
      'sleeper-mini/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}', 'tests/**/*.ts', 'e2e/**/*.ts'],
    languageOptions: { globals: { ...globals.node, ...globals.browser, ...globals.jest } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['src/web/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': hooks },
    rules: hooks.configs.recommended.rules,
  },
)
