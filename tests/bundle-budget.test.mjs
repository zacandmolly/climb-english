import assert from 'node:assert/strict';
import { gzipSync } from 'node:zlib';
import test from 'node:test';
import {
  BUNDLE_BUDGETS,
  analyzeBundleManifest,
  assertBundleBudgets,
} from '../scripts/bundle-budget.mjs';

const LESSONS_KEY = 'src/data/lessons.ts';
const INNSBRUCK_KEY = 'src/data/videos/innsbruck-2026-mb-full.video.ts';

function fixtureManifest() {
  return {
    'index.html': {
      file: 'assets/index.js',
      src: 'index.html',
      isEntry: true,
      imports: ['_vendor.js'],
      dynamicImports: [LESSONS_KEY, INNSBRUCK_KEY],
    },
    '_vendor.js': {
      file: 'assets/vendor.js',
      imports: ['_react.js'],
    },
    '_react.js': { file: 'assets/react.js' },
    [LESSONS_KEY]: {
      file: 'assets/lessons.js',
      src: LESSONS_KEY,
      isDynamicEntry: true,
      imports: ['_lesson-shared.js'],
    },
    '_lesson-shared.js': { file: 'assets/lesson-shared.js' },
    [INNSBRUCK_KEY]: {
      file: 'assets/innsbruck.js',
      src: INNSBRUCK_KEY,
      isDynamicEntry: true,
    },
  };
}

function fixtureAssets() {
  return new Map([
    ['assets/index.js', Buffer.from('entry12345')],
    ['assets/vendor.js', Buffer.from('vendor123456789')],
    ['assets/react.js', Buffer.from('react1234567890')],
    ['assets/lessons.js', Buffer.from('lessons12345678901234567890')],
    ['assets/lesson-shared.js', Buffer.from('shared123456789')],
    ['assets/innsbruck.js', Buffer.from('innsbruck12345678901234567890')],
  ]);
}

function analyze(manifest = fixtureManifest(), assets = fixtureAssets()) {
  return analyzeBundleManifest(manifest, (file) => {
    const contents = assets.get(file);
    if (!contents) throw new Error(`missing fixture asset ${file}`);
    return contents;
  });
}

test('initial budget recursively counts static imports but excludes dynamic lesson data', () => {
  const assets = fixtureAssets();
  const report = analyze(fixtureManifest(), assets);

  assert.deepEqual(report.initial.files, [
    'assets/index.js',
    'assets/react.js',
    'assets/vendor.js',
  ]);
  assert.equal(report.initial.raw, 40);
  assert.equal(
    report.initial.gzip,
    ['assets/index.js', 'assets/react.js', 'assets/vendor.js'].reduce(
      (total, file) => total + gzipSync(assets.get(file)).byteLength,
      0
    )
  );
  assert.deepEqual(report.lessons.files, ['assets/lesson-shared.js', 'assets/lessons.js']);
  assert.equal(report.lessons.raw, 42);
  assert.deepEqual(report.innsbruck.files, ['assets/innsbruck.js']);
  assert.equal(report.innsbruck.raw, 29);
});

test('production budgets stay at the issue #36 limits', () => {
  assert.deepEqual(BUNDLE_BUDGETS, {
    initial: { raw: 400_000, gzip: 125_000 },
    lessons: { raw: 230_000, gzip: 65_000 },
    innsbruck: { raw: 750_000, gzip: 220_000 },
  });
});

test('transitive static vendor chunks cannot bypass the initial budget', () => {
  const report = analyze();

  assert.throws(
    () =>
      assertBundleBudgets(report, {
        initial: { raw: 39, gzip: Number.MAX_SAFE_INTEGER },
        lessons: { raw: Number.MAX_SAFE_INTEGER, gzip: Number.MAX_SAFE_INTEGER },
        innsbruck: { raw: Number.MAX_SAFE_INTEGER, gzip: Number.MAX_SAFE_INTEGER },
      }),
    /initial raw bundle is 40 bytes; budget is 39 bytes/
  );
});

test('lesson data must be a dynamically reachable entry outside the initial graph', () => {
  const staticManifest = fixtureManifest();
  staticManifest['index.html'].imports.push(LESSONS_KEY);
  assert.throws(() => analyze(staticManifest), /lessons must not be reachable through the initial/);

  const unreachableManifest = fixtureManifest();
  unreachableManifest['index.html'].dynamicImports = [INNSBRUCK_KEY];
  assert.throws(() => analyze(unreachableManifest), /lessons is not dynamically reachable/);

  const nonEntryManifest = fixtureManifest();
  nonEntryManifest[LESSONS_KEY].isDynamicEntry = false;
  assert.throws(() => analyze(nonEntryManifest), /lessons must be emitted as a Vite dynamic entry/);

  const aliasedFileManifest = fixtureManifest();
  aliasedFileManifest[LESSONS_KEY].file = 'assets/index.js';
  assert.throws(
    () => analyze(aliasedFileManifest),
    /lessons must be emitted in a file outside the initial static bundle/
  );

  const staticInnsbruckManifest = fixtureManifest();
  staticInnsbruckManifest[INNSBRUCK_KEY].isDynamicEntry = false;
  assert.throws(
    () => analyze(staticInnsbruckManifest),
    /Innsbruck must be emitted as a Vite dynamic entry/
  );
});

test('missing entry, target, or transitive manifest reference fails closed', () => {
  const noEntryManifest = fixtureManifest();
  noEntryManifest['index.html'].isEntry = false;
  assert.throws(() => analyze(noEntryManifest), /exactly one Vite entry, found 0/);

  const noLessonsManifest = fixtureManifest();
  delete noLessonsManifest[LESSONS_KEY];
  noLessonsManifest['index.html'].dynamicImports = [INNSBRUCK_KEY];
  assert.throws(
    () => analyze(noLessonsManifest),
    /manifest chunk for src\/data\/lessons.ts, found 0/
  );

  const missingVendorManifest = fixtureManifest();
  delete missingVendorManifest['_react.js'];
  assert.throws(() => analyze(missingVendorManifest), /references missing chunk _react.js/);
});
