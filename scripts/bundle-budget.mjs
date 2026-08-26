import { gzipSync } from 'node:zlib';

export const BUNDLE_BUDGETS = Object.freeze({
  initial: Object.freeze({ raw: 400_000, gzip: 125_000 }),
  lessons: Object.freeze({ raw: 230_000, gzip: 65_000 }),
  innsbruck: Object.freeze({ raw: 750_000, gzip: 220_000 }),
});

const TARGET_SOURCES = Object.freeze({
  lessons: 'src/data/lessons.ts',
  innsbruck: 'src/data/videos/innsbruck-2026-mb-full.video.ts',
});

export function analyzeBundleManifest(manifest, readAsset) {
  assertManifest(manifest);
  if (typeof readAsset !== 'function') throw new Error('readAsset must be a function.');

  const entryKey = findEntryKey(manifest);
  const initialKeys = collectStaticGraph(manifest, entryKey);
  const lessonsKey = findSourceKey(manifest, TARGET_SOURCES.lessons);
  const innsbruckKey = findSourceKey(manifest, TARGET_SOURCES.innsbruck);
  const dynamicKeys = collectDynamicDescendants(manifest, initialKeys);

  assertDynamicTarget(manifest, lessonsKey, initialKeys, dynamicKeys, 'lessons');
  assertDynamicTarget(manifest, innsbruckKey, initialKeys, dynamicKeys, 'Innsbruck');

  return {
    initial: measureGraph(manifest, initialKeys, readAsset),
    lessons: measureGraph(manifest, collectStaticGraph(manifest, lessonsKey), readAsset),
    innsbruck: measureGraph(manifest, collectStaticGraph(manifest, innsbruckKey), readAsset),
  };
}

export function assertBundleBudgets(report, budgets = BUNDLE_BUDGETS) {
  for (const name of ['initial', 'lessons', 'innsbruck']) {
    const measurement = report?.[name];
    const budget = budgets?.[name];
    if (!measurement || !budget) throw new Error(`Missing ${name} measurement or budget.`);

    for (const encoding of ['raw', 'gzip']) {
      if (!Number.isFinite(measurement[encoding]) || !Number.isFinite(budget[encoding])) {
        throw new Error(`Invalid ${name} ${encoding} measurement or budget.`);
      }
      if (measurement[encoding] > budget[encoding]) {
        throw new Error(
          `${name} ${encoding} bundle is ${measurement[encoding]} bytes; budget is ${budget[encoding]} bytes.`
        );
      }
    }
  }
}

function assertManifest(manifest) {
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    throw new Error('Vite manifest must be an object.');
  }
}

function findEntryKey(manifest) {
  const entries = Object.entries(manifest).filter(([, chunk]) => chunk?.isEntry === true);
  if (entries.length !== 1) {
    throw new Error(`Expected exactly one Vite entry, found ${entries.length}.`);
  }

  const [[entryKey, entry]] = entries;
  if (entry.src !== 'index.html' && entryKey !== 'index.html') {
    throw new Error(`Expected the sole Vite entry to be index.html, found ${entryKey}.`);
  }
  return entryKey;
}

function findSourceKey(manifest, source) {
  const matches = Object.entries(manifest).filter(
    ([key, chunk]) => normalizePath(chunk?.src ?? key) === source
  );
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one manifest chunk for ${source}, found ${matches.length}.`);
  }
  return matches[0][0];
}

function collectStaticGraph(manifest, startKey) {
  return collectGraph(manifest, [startKey], false);
}

function collectDynamicDescendants(manifest, initialKeys) {
  const dynamicRoots = [];
  for (const key of initialKeys) {
    dynamicRoots.push(...getReferences(manifest, key, 'dynamicImports'));
  }
  return collectGraph(manifest, dynamicRoots, true);
}

function collectGraph(manifest, startKeys, includeDynamic) {
  const visited = new Set();
  const pending = [...startKeys];

  while (pending.length > 0) {
    const key = pending.pop();
    if (visited.has(key)) continue;
    requireChunk(manifest, key);
    visited.add(key);
    pending.push(...getReferences(manifest, key, 'imports'));
    if (includeDynamic) pending.push(...getReferences(manifest, key, 'dynamicImports'));
  }

  return visited;
}

function getReferences(manifest, key, property) {
  const chunk = requireChunk(manifest, key);
  const references = chunk[property] ?? [];
  if (!Array.isArray(references) || references.some((reference) => typeof reference !== 'string')) {
    throw new Error(`Manifest chunk ${key} has invalid ${property}.`);
  }
  for (const reference of references) requireChunk(manifest, reference);
  return references;
}

function requireChunk(manifest, key) {
  if (typeof key !== 'string' || !Object.prototype.hasOwnProperty.call(manifest, key)) {
    throw new Error(`Manifest references missing chunk ${String(key)}.`);
  }
  const chunk = manifest[key];
  if (!chunk || typeof chunk !== 'object' || Array.isArray(chunk)) {
    throw new Error(`Manifest chunk ${key} must be an object.`);
  }
  return chunk;
}

function assertDynamicTarget(manifest, key, initialKeys, dynamicKeys, label) {
  const chunk = requireChunk(manifest, key);
  if (chunk.isDynamicEntry !== true) {
    throw new Error(`${label} must be emitted as a Vite dynamic entry.`);
  }
  if (initialKeys.has(key)) {
    throw new Error(`${label} must not be reachable through the initial static import graph.`);
  }
  const initialFiles = new Set(
    [...initialKeys].map((initialKey) => requireChunk(manifest, initialKey).file)
  );
  if (initialFiles.has(chunk.file)) {
    throw new Error(`${label} must be emitted in a file outside the initial static bundle.`);
  }
  if (!dynamicKeys.has(key)) {
    throw new Error(`${label} is not dynamically reachable from the application entry.`);
  }
}

function measureGraph(manifest, keys, readAsset) {
  const files = [];
  const seenFiles = new Set();
  let raw = 0;
  let gzip = 0;

  for (const key of keys) {
    const file = requireChunk(manifest, key).file;
    if (typeof file !== 'string' || !file.endsWith('.js')) {
      throw new Error(`Manifest chunk ${key} must reference a JavaScript file.`);
    }
    if (seenFiles.has(file)) continue;

    const contents = readAsset(file);
    if (!Buffer.isBuffer(contents) && !(contents instanceof Uint8Array)) {
      throw new Error(`readAsset must return bytes for ${file}.`);
    }
    const bytes = Buffer.from(contents);
    seenFiles.add(file);
    raw += bytes.byteLength;
    gzip += gzipSync(bytes).byteLength;
    files.push(file);
  }

  files.sort();
  return { raw, gzip, files };
}

function normalizePath(value) {
  return String(value).replaceAll('\\', '/');
}
