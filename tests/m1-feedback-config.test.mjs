import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('M1 feedback operations refuse to fall back to an ephemeral public URL', () => {
  const result = spawnSync(process.execPath, ['scripts/m1-feedback-api.mjs', 'status'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: {
      ...process.env,
      FEEDBACK_API_BASE: '',
      VITE_FEEDBACK_API_BASE: '',
      M1_SSH_HOST: 'must-not-be-contacted',
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /FEEDBACK_API_BASE is required/);
  assert.doesNotMatch(result.stdout, /M1 SSH:/);
});

test('M1 feedback operations reject an explicitly configured trycloudflare URL', () => {
  const result = spawnSync(process.execPath, ['scripts/m1-feedback-api.mjs', 'status'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: {
      ...process.env,
      FEEDBACK_API_BASE: 'https://temporary-name.trycloudflare.com',
      VITE_FEEDBACK_API_BASE: '',
      M1_SSH_HOST: 'must-not-be-contacted',
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /must not use an ephemeral trycloudflare hostname/);
  assert.doesNotMatch(result.stdout, /M1 SSH:/);
});

test('M1 feedback operations reject a trailing-dot trycloudflare hostname', () => {
  const result = spawnSync(process.execPath, ['scripts/m1-feedback-api.mjs', 'status'], {
    cwd: new URL('..', import.meta.url),
    encoding: 'utf8',
    env: {
      ...process.env,
      FEEDBACK_API_BASE: 'https://temporary-name.trycloudflare.com.',
      VITE_FEEDBACK_API_BASE: '',
      M1_SSH_HOST: 'must-not-be-contacted',
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /must not use an ephemeral trycloudflare hostname/);
  assert.doesNotMatch(result.stdout, /M1 SSH:/);
});
