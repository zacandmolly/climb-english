// Flat ESLint config for the AI harness.
//
// Scope policy (deliberately narrow):
//   - Lint ONLY the .mjs pipeline/tooling under scripts/ and tests/.
//     This is the defect-dense surface (TDZ swallowed by catch, silent
//     fallback, empty catch blocks) where the RETROSPECTIVE lessons live.
//   - Do NOT lint src/ TypeScript here. src/App.tsx is a 3000+ line module
//     and enabling JS rules on it would light the gate up red on day one;
//     TypeScript correctness is already enforced by `tsc -b` in CI.
//
// The rules below are conservative on purpose: they must pass against the
// existing scripts/tests *today* so the gate is green from the first commit.

import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    // Global ignores: everything that is not an mjs file we own. Applying
    // `ignores` at the top level (config object with only `ignores`) makes it
    // global regardless of the file patterns in other config objects.
    ignores: [
      'node_modules/**',
      'dist/**',
      'public/**',
      'src/**',
      'server/**',
      'workers/**',
      '.husky/**',
      'docs/**',
    ],
  },
  {
    // `@eslint/js` recommended is a bare ruleset (no languageOptions); scoping
    // it with `files` keeps it off the TypeScript modules above.
    ...js.configs.recommended,
    files: ['scripts/**/*.mjs', 'tests/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      // Defect-dense pitfalls called out explicitly (the rest come from the
      // recommended preset above). These are the "silent fallback" traps that
      // have bitten this project twice before.
      'no-empty': 'error',
      'no-empty-function': 'error',
      'no-undef': 'error',
      'no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'no-constant-condition': 'error',
      'no-fallthrough': 'error',
    },
  },
];
