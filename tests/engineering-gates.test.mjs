import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import dependencyConfig from '../.dependency-cruiser.js';
import eslintConfig from '../eslint.config.js';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const ciWorkflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const deadCssScript = readFileSync(
  new URL('../scripts/find-dead-css.mjs', import.meta.url),
  'utf8'
);

test('source-shape rules are errors with only content data exempt from line count', () => {
  const sourceConfig = eslintConfig.find((entry) => entry.files?.includes('src/**/*.{ts,tsx}'));
  assert.ok(sourceConfig, 'source-shape ESLint config is missing');
  for (const rule of ['complexity', 'max-depth', 'max-params', 'max-lines']) {
    const value = sourceConfig.rules?.[rule];
    assert.equal(Array.isArray(value) ? value[0] : value, 'error', `${rule} must be an error`);
  }

  const contentConfig = eslintConfig.find((entry) =>
    entry.files?.includes('src/data/lessons.generated.ts')
  );
  assert.deepEqual(contentConfig?.files, [
    'src/data/lessons.generated.ts',
    'src/data/lessons.manual.ts',
    'src/data/videos/*.video.ts',
  ]);
  assert.deepEqual(contentConfig?.rules, { 'max-lines': 'off' });
  assert.match(packageJson.scripts['lint:complexity'], /--max-warnings 0$/);
});

test('bundle, dead-code, and dead-CSS checks are blocking CI gates', () => {
  assert.match(packageJson.scripts.build, /npm run check:bundle$/);
  const boundaryJob = ciWorkflow.split('\n  boundary-check:')[1]?.split('\n  dead-code:')[0] ?? '';
  const deadCodeJob = ciWorkflow.split('\n  dead-code:')[1]?.split('\n  data-protect:')[0] ?? '';

  assert.match(boundaryJob, /run: npm run lint:complexity/);
  assert.match(deadCodeJob, /run: npm run knip/);
  assert.match(deadCodeJob, /run: npm run deadcss/);
  assert.doesNotMatch(deadCodeJob, /continue-on-error/);
  assert.match(deadCssScript, /process\.exitCode = 1/);
});

test('application runtime cannot depend on presentation modules', () => {
  const rule = dependencyConfig.forbidden.find(
    (entry) => entry.name === 'app-runtime-does-not-import-ui'
  );
  assert.equal(rule?.severity, 'error');
  assert.match('src/app/useAppRuntime.ts', new RegExp(rule?.from.path ?? 'never'));
  assert.match('src/components/MaterialBar.tsx', new RegExp(rule?.to.path ?? 'never'));
});
