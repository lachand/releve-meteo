import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import prettierConfig from 'eslint-config-prettier';
import globals from 'globals';

const domainBoundary = {
  files: ['src/domain/**/*.{ts,tsx}'],
  rules: {
    'import/no-restricted-paths': [
      'error',
      {
        zones: [
          { target: './src/domain', from: './src/data' },
          { target: './src/domain', from: './src/ui' },
          { target: './src/domain', from: './src/pwa' },
        ],
      },
    ],
    'no-restricted-globals': [
      'error',
      { name: 'fetch', message: 'domain/ est pur : pas de fetch. Passer par data/.' },
      { name: 'localStorage', message: 'domain/ est pur : pas de localStorage.' },
      { name: 'indexedDB', message: "domain/ est pur : pas d'indexedDB." },
    ],
  },
};

// Aucun new Date(str) ou new Date(number) hors de domain/time.ts : toute
// arithmetique de dates du domaine doit passer par ce module (ARCHITECTURE.md
// section 3.8). Les tests peuvent construire des Date librement pour fabriquer
// un instant "now" a injecter.
const dateConstructionGuard = {
  files: ['src/domain/**/*.{ts,tsx}'],
  ignores: ['src/domain/time.ts', 'src/domain/**/*.test.{ts,tsx}'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: "NewExpression[callee.name='Date']:not([arguments.length=0])",
        message:
          'domain/time.ts est le seul module autorise a construire des Date depuis une chaine ou un nombre.',
      },
    ],
  },
};

export default [
  { ignores: ['dist/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'public/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
      globals: { ...globals.browser, ...globals.es2022 },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      import: importPlugin,
      'jsx-a11y': jsxA11y,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: {
      'import/resolver': {
        typescript: true,
      },
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-restricted-globals': [
        'error',
        { name: 'name', message: 'Global window.name, presque toujours involontaire.' },
      ],
    },
  },
  domainBoundary,
  dateConstructionGuard,
  {
    files: ['*.config.{js,ts}', 'tests/**/*.{ts,tsx}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
  {
    files: ['src/data/**/*.{ts,tsx}'],
    rules: {
      'import/no-restricted-paths': [
        'error',
        { zones: [{ target: './src/data', from: './src/ui' }] },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
  prettierConfig,
];
