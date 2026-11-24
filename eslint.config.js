import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

const noDirectStorage = [
  { name: 'localStorage', message: 'Use ProgressStore from src/storage (CLAUDE.md, rule 4).' },
  { name: 'sessionStorage', message: 'Use src/storage (CLAUDE.md, rule 4).' },
];

const noDomInCore = [
  ...noDirectStorage,
  { name: 'window', message: 'src/core must run in Node (CLAUDE.md, rule 1).' },
  { name: 'document', message: 'src/core must run in Node (CLAUDE.md, rule 1).' },
  { name: 'navigator', message: 'src/core must run in Node (CLAUDE.md, rule 1).' },
  { name: 'performance', message: 'Time is passed into core (CLAUDE.md, rule 3).' },
];

export default tseslint.config(
  { ignores: ['dist', 'dist-e2e', 'coverage', 'test-results', 'playwright-report'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      'no-console': 'error',
      'no-eval': 'error',
      'no-new-func': 'error',
      'no-restricted-globals': ['error', ...noDirectStorage],
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Use textContent (CLAUDE.md, security).' },
        { property: 'outerHTML', message: 'Use textContent (CLAUDE.md, security).' },
        { property: 'insertAdjacentHTML', message: 'Use textContent (CLAUDE.md, security).' },
      ],
    },
  },
  {
    files: ['src/core/**'],
    rules: {
      'no-restricted-globals': ['error', ...noDomInCore],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded generator in core/rng.' },
        { object: 'Date', property: 'now', message: 'Time is passed into core.' },
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'core must not depend on Three.js.' },
            {
              group: ['**/render/**', '**/ui/**', '**/audio/**', '**/storage/**'],
              message: 'core must not depend on render, ui, audio or storage.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/storage/**'],
    rules: { 'no-restricted-globals': 'off' },
  },
  {
    // The performance test prints its measurements, so they can be copied into docs/PERFORMANCE.md.
    files: ['src/logging/console-sink.ts', 'scripts/**', 'tests/e2e/performance.spec.ts'],
    rules: { 'no-console': 'off' },
  },
  prettier,
);
