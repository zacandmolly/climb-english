// dependency-cruiser config for the R6 module-boundary audit (phase 02).
//
// Job: catch circular dependencies inside src/ (the module-boundary regression
// signal that a monolith is forming). File-size (>500 lines) is covered by the
// ESLint `max-lines` rule, not here — dependency-cruiser tracks edges, not
// line counts.
//
// Severity is `error` now: the App.tsx split landed (no cycles remain), so the
// `no-circular` rule is a hard gate — any new circular dependency fails CI.

export default {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'Circular dependency detected. Hard gate after the App.tsx split.',
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
