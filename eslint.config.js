// Flat ESLint config for the AI harness.
//
// Scope policy (deliberately narrow):
//   - Hard-gate the .mjs pipeline/tooling under scripts/ and tests/ with the
//     recommended ruleset. This is the defect-dense surface (TDZ swallowed by
//     catch, silent fallback, empty catch blocks) where the RETROSPECTIVE
//     lessons live.
//   - Report-only complexity rules over src/ (phase 02 / R6). src/App.tsx is
//     a 3000+ line module, so the rules are `warn` (not `error`) and run as a
//     separate `lint:complexity` script; they must not block the merge today.
//     TypeScript correctness is still enforced by `tsc -b` in CI.
//
// The scripts/tests rules below are conservative on purpose: they must pass
// against the existing tree *today* so the gate is green from the first commit.

import js from '@eslint/js';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  {
    // Global ignores: everything that is not a source file we own. Applying
    // `ignores` at the top level (config object with only `ignores`) makes it
    // global regardless of the file patterns in other config objects.
    // NOTE: src/ is intentionally NOT ignored — the complexity config below
    // scopes itself to src/**/*.{ts,tsx} at warn level only.
    ignores: [
      'node_modules/**',
      'dist/**',
      'public/**',
      'server/**',
      'workers/**',
      '.husky/**',
      'docs/**',
      'e2e/**',
      'playwright.config.ts',
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
  {
    // R6 module-boundary lint (phase 02): shape/complexity rules over src/,
    // all at WARN so they report the 3000-line App.tsx monolith without failing
    // the gate today. `tsc -b` still owns type-correctness; these rules only
    // measure shape (cyclomatic complexity, nesting, arity, file length).
    // After App.tsx is split, tighten these to error (or --max-warnings 0).
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    // react-hooks is registered so the pre-existing
    // `// eslint-disable-next-line react-hooks/exhaustive-deps` directive in
    // SpeakingCoach.tsx resolves to a known rule; the rule itself stays off to
    // keep this audit scoped to module shape/complexity.
    plugins: { 'react-hooks': reactHooks },
    linterOptions: {
      reportUnusedDisableDirectives: 'off',
    },
    rules: {
      'react-hooks/exhaustive-deps': 'off',
      complexity: ['warn', { max: 20 }],
      'max-depth': ['warn', { max: 4 }],
      'max-params': ['warn', { max: 4 }],
      'max-lines': [
        'warn',
        { max: 500, skipBlankLines: true, skipComments: true },
      ],
    },
  },
];
