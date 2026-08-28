#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BUNDLE_BUDGETS, analyzeBundleManifest, assertBundleBudgets } from './bundle-budget.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = resolve(projectRoot, 'dist');
const manifestPath = resolve(distRoot, '.vite/manifest.json');

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
} catch (error) {
  fail(`Cannot read Vite manifest at ${manifestPath}: ${errorMessage(error)}`);
}

try {
  const report = analyzeBundleManifest(manifest, readDistAsset);
  assertBundleBudgets(report, BUNDLE_BUDGETS);

  for (const name of ['initial', 'lessons', 'innsbruck']) {
    const measurement = report[name];
    const budget = BUNDLE_BUDGETS[name];
    console.log(
      `${name}: ${measurement.raw}/${budget.raw} raw, ${measurement.gzip}/${budget.gzip} gzip bytes (${measurement.files.length} files)`
    );
  }
  console.log('Bundle budgets passed.');
} catch (error) {
  fail(errorMessage(error));
}

function readDistAsset(file) {
  if (isAbsolute(file)) throw new Error(`Manifest asset must be relative: ${file}.`);
  const assetPath = resolve(distRoot, file);
  const assetRelative = relative(distRoot, assetPath);
  if (assetRelative === '..' || assetRelative.startsWith(`..${sep}`)) {
    throw new Error(`Manifest asset escapes dist: ${file}.`);
  }
  return readFileSync(assetPath);
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

function fail(message) {
  console.error(`Bundle budget rejected: ${message}`);
  process.exit(1);
}
