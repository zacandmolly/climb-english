import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

const projectRoot = new URL('..', import.meta.url);
const configScript = new URL('../scripts/check-public-runtime-config.mjs', import.meta.url);

function runConfigCheck(feedbackBase, errorEndpoint = '') {
  return spawnSync(process.execPath, ['scripts/check-public-runtime-config.mjs'], {
    cwd: projectRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      VITE_FEEDBACK_API_BASE: feedbackBase,
      VITE_ERROR_REPORT_ENDPOINT: errorEndpoint,
    },
  });
}

test('public runtime config accepts explicit offline or stable HTTPS endpoints', () => {
  const offline = runConfigCheck('');
  const stable = runConfigCheck(
    'https://feedback.example.com',
    'https://errors.example.com/collect'
  );

  assert.equal(offline.status, 0);
  assert.match(offline.stdout, /explicitly offline/);
  assert.equal(stable.status, 0);
  assert.match(stable.stdout, /stable feedback endpoint configured/);
});

test('public runtime config validates values loaded from .env.production', () => {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'climb-runtime-config-'));

  try {
    writeFileSync(
      join(fixtureRoot, '.env.production'),
      'VITE_FEEDBACK_API_BASE=https://temporary.trycloudflare.com\n',
      'utf8'
    );
    const env = { ...process.env };
    delete env.VITE_FEEDBACK_API_BASE;
    delete env.VITE_ERROR_REPORT_ENDPOINT;
    const result = spawnSync(process.execPath, [configScript.pathname], {
      cwd: fixtureRoot,
      encoding: 'utf8',
      env,
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /must not use an ephemeral trycloudflare hostname/);
  } finally {
    rmSync(fixtureRoot, { recursive: true, force: true });
  }
});

test('public runtime config rejects insecure, credentialed, and ephemeral endpoints', () => {
  const insecure = runConfigCheck('http://feedback.example.com');
  const credentialed = runConfigCheck('https://user:secret@feedback.example.com');
  const ephemeral = runConfigCheck('https://temporary.trycloudflare.com');
  const trailingDotEphemeral = runConfigCheck('https://temporary.trycloudflare.com.');

  assert.equal(insecure.status, 1);
  assert.match(insecure.stderr, /must use HTTPS/);
  assert.equal(credentialed.status, 1);
  assert.match(credentialed.stderr, /must not contain credentials/);
  assert.equal(ephemeral.status, 1);
  assert.match(ephemeral.stderr, /must not use an ephemeral trycloudflare hostname/);
  assert.equal(trailingDotEphemeral.status, 1);
  assert.match(trailingDotEphemeral.stderr, /must not use an ephemeral trycloudflare hostname/);
});
