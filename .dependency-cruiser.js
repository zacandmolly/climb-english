// dependency-cruiser config for the R6 module-boundary audit (phase 02).
//
// Job: catch circular dependencies inside src/ (the module-boundary regression
// signal that a monolith is forming). File-size (>500 lines) is covered by the
// ESLint `max-lines` rule, not here — dependency-cruiser tracks edges, not
// line counts.
//
// Severity is `warn` on purpose: report, don't block. After App.tsx is split,
// bump the `no-circular` rule to `error` to make this a hard gate.

export default {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'warn',
      comment:
        'Circular dependency detected. Warn-only for now; tighten to error after the App.tsx split.',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    // Resolve TypeScript imports (including `import type` and lazy
    // dynamic imports) so the graph mirrors what `tsc -b` compiles.
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    // Never chase third-party code or build/test output.
    doNotFollow: {
      path: ['node_modules', 'dist', 'test-results', 'playwright-report'],
    },
    exclude: {
      path: ['node_modules', 'dist', 'test-results', 'playwright-report'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: 'node_modules/(?:@[^/]+/)?[^/]+',
      },
    },
  },
};
