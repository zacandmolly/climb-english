#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { File } from 'node:buffer';

const command = process.argv[2] || 'status';
const sshHost = process.env.M1_SSH_HOST || 'm1-agent-ts';
const apiBase = stripTrailingSlash(
  process.env.FEEDBACK_API_BASE || process.env.VITE_FEEDBACK_API_BASE || ''
);
const envPath = process.env.M1_FEEDBACK_ENV_PATH || '~/.climb-english-api.env';
const serviceLabel = process.env.M1_FEEDBACK_SERVICE_LABEL || 'ai.climb-english-api';

try {
  if (['status', 'install-key', 'install-deepseek-key', 'test', 'usage'].includes(command)) {
    requireApiBase();
  }

  if (command === 'status') {
    await status();
  } else if (command === 'install-key') {
    await installOpenAiKey();
  } else if (command === 'install-deepseek-key') {
    await installDeepSeekKey();
  } else if (command === 'test') {
    await testFeedback();
  } else if (command === 'usage') {
    await usage();
  } else {
    usageText();
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

async function status() {
  console.log(`M1 SSH: ${sshHost}`);
  console.log(`API base: ${apiBase}`);
  console.log(`M1 health: ${remoteCurl('http://127.0.0.1:8789/api/health')}`);
  console.log(`Public health: ${JSON.stringify(await fetchJson('/api/health'))}`);
  console.log(`Provider state: ${remoteProviderState()}`);
}

async function installOpenAiKey() {
  const key = readClipboard().trim();
  validateOpenAiKey(key);
  upsertRemoteEnv({ AI_PROVIDER: 'openai', OPENAI_API_KEY: key });
  restartApiService();
  console.log('M1 OpenAI API key updated and service restarted.');
  await status();
}

async function installDeepSeekKey() {
  const key = readClipboard().trim();
  validateDeepSeekKey(key);
  upsertRemoteEnv({
    AI_PROVIDER: 'deepseek',
    DEEPSEEK_API_KEY: key,
    DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
  });
  restartApiService();
  console.log('M1 DeepSeek API key updated and service restarted.');
  await status();
}

function upsertRemoteEnv(values) {
  const script = `
import os
import stat
import sys
from pathlib import Path
import json

updates = json.loads(sys.stdin.read())
env_path = Path(os.path.expanduser(${JSON.stringify(envPath)}))
env_path.parent.mkdir(parents=True, exist_ok=True)

lines = env_path.read_text().splitlines() if env_path.exists() else []
next_lines = []
for line in lines:
    key = line.split("=", 1)[0] if "=" in line else line
    if key in updates:
        next_lines.append(key + "=" + updates.pop(key))
    else:
        next_lines.append(line)
for key, value in updates.items():
    next_lines.append(key + "=" + value)

env_path.write_text("\\n".join(next_lines).rstrip() + "\\n")
env_path.chmod(stat.S_IRUSR | stat.S_IWUSR)
print("updated")
`;

  run('ssh', [sshHost, `python3 -c ${shellQuote(script)}`], {
    input: `${JSON.stringify(values)}\n`,
  });
}

function restartApiService() {
  run('ssh', [sshHost, `launchctl kickstart -k gui/$(id -u)/${shellBare(serviceLabel)}`]);
}

async function testFeedback() {
  const audioPath = ensureTestAudio();
  const form = new FormData();
  form.append(
    'audio',
    new File([readFileSync(audioPath)], 'climb-english-test.wav', { type: 'audio/wav' })
  );
  form.append('clipId', 'ops:test:sentence');
  form.append('targetSentence', 'The top of the slab. It was blocked.');
  form.append('transcript', 'The top of the slab. It was blocked.');
  form.append('keywords', 'slab, blocked');
  form.append('durationSeconds', '3');
  form.append('recordedBytes', String(readFileSync(audioPath).byteLength));
  form.append('spokenText', 'The top of the slab was blocked.');

  const response = await fetch(`${apiBase}/api/speaking-feedback`, {
    method: 'POST',
    headers: {
      Origin: 'https://zacandmolly.github.io',
    },
    body: form,
  });
  const body = await response.text();
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`Feedback API returned non-JSON response: ${body.slice(0, 220)}`);
  }

  console.log(JSON.stringify(payload, null, 2));
  if (!response.ok || payload.mode !== 'ai') {
    throw new Error('Feedback API did not return real AI feedback.');
  }
}

async function usage() {
  const token = remoteEnvValue('API_ADMIN_TOKEN');
  if (!token) {
    throw new Error('API_ADMIN_TOKEN is not set on M1.');
  }

  const response = await fetch(`${apiBase}/api/usage`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: 'https://zacandmolly.github.io',
    },
  });
  const body = await response.text();
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    throw new Error(`Usage API returned non-JSON response: ${body.slice(0, 220)}`);
  }

  console.log(JSON.stringify(payload, null, 2));
  if (!response.ok) {
    throw new Error('Usage API request failed.');
  }
}

function remoteCurl(url) {
  return run('ssh', [sshHost, `curl -sS --max-time 5 ${shellQuote(url)}`]).trim();
}

function remoteProviderState() {
  const script = `
import os
from pathlib import Path

env_path = Path(os.path.expanduser(${JSON.stringify(envPath)}))
if not env_path.exists():
    print("missing")
    raise SystemExit
values = {}
provider = "openai"
for line in env_path.read_text().splitlines():
    if "=" in line:
        key, value = line.split("=", 1)
        values[key] = value.strip().strip("'\\\"")
provider = values.get("AI_PROVIDER", "openai").lower()
key_name = "DEEPSEEK_API_KEY" if provider == "deepseek" else "OPENAI_API_KEY"
value = values.get(key_name, "")
if not value:
    state = "missing"
elif value.startswith("dummy") or value in {"SET", "placeholder"}:
    state = "placeholder"
elif value.startswith("sk-") and len(value) >= 30:
    state = "looks_real"
else:
    state = "unknown_format"
print(f"{provider}:{state}")
`;
  return run('ssh', [sshHost, `python3 -c ${shellQuote(script)}`]).trim();
}

function remoteEnvValue(name) {
  if (!/^[A-Z0-9_]+$/.test(name)) {
    throw new Error(`Unsafe env name: ${name}`);
  }
  const script = `
import os
from pathlib import Path

env_path = Path(os.path.expanduser(${JSON.stringify(envPath)}))
if not env_path.exists():
    raise SystemExit
for line in env_path.read_text().splitlines():
    if line.startswith(${JSON.stringify(`${name}=`)}):
        print(line.split("=", 1)[1].strip().strip("'\\\""))
        break
`;
  return run('ssh', [sshHost, `python3 -c ${shellQuote(script)}`]).trim();
}

async function fetchJson(path) {
  const response = await fetch(`${apiBase}${path}`, {
    headers: {
      Origin: 'https://zacandmolly.github.io',
    },
  });
  const body = await response.text();
  try {
    return JSON.parse(body);
  } catch {
    throw new Error(`Expected JSON from ${path}, got: ${body.slice(0, 220)}`);
  }
}

function ensureTestAudio() {
  const wavPath = join(tmpdir(), 'climb-english-test.wav');
  if (existsSync(wavPath)) {
    return wavPath;
  }

  const aiffPath = join(tmpdir(), 'climb-english-test.aiff');
  run('say', ['-o', aiffPath, 'The top of the slab was blocked.']);

  const afconvert = spawnSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', aiffPath, wavPath], {
    encoding: 'utf8',
  });
  if (afconvert.status === 0 && existsSync(wavPath)) {
    return wavPath;
  }

  run('ffmpeg', [
    '-y',
    '-hide_banner',
    '-loglevel',
    'error',
    '-i',
    aiffPath,
    '-ar',
    '16000',
    '-ac',
    '1',
    wavPath,
  ]);
  return wavPath;
}

function readClipboard() {
  return run('pbpaste', []);
}

function validateOpenAiKey(key) {
  if (!key.startsWith('sk-') || key.length < 40 || /\s/.test(key)) {
    throw new Error(
      'Clipboard does not look like an OpenAI API key. Copy the key first, then rerun.'
    );
  }
}

function validateDeepSeekKey(key) {
  if (!key.startsWith('sk-') || key.length < 30 || /\s/.test(key)) {
    throw new Error(
      'Clipboard does not look like a DeepSeek API key. Copy the key first, then rerun.'
    );
  }
}

function run(file, args, options = {}) {
  const result = spawnSync(file, args, {
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr.trim()}` : '';
    const stdout = result.stdout ? `\n${result.stdout.trim()}` : '';
    throw new Error(`${file} ${args.join(' ')} failed.${stderr}${stdout}`);
  }
  return result.stdout || '';
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function shellBare(value) {
  if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
    throw new Error(`Unsafe shell token: ${value}`);
  }
  return value;
}

function stripTrailingSlash(value) {
  return String(value).replace(/\/+$/, '');
}

function requireApiBase() {
  if (!apiBase) {
    throw new Error('FEEDBACK_API_BASE is required. Use a stable HTTPS endpoint.');
  }

  let endpoint;
  try {
    endpoint = new URL(apiBase);
  } catch {
    throw new Error('FEEDBACK_API_BASE must be a valid stable HTTPS URL.');
  }
  if (endpoint.protocol !== 'https:') {
    throw new Error('FEEDBACK_API_BASE must use HTTPS.');
  }
  if (endpoint.username || endpoint.password) {
    throw new Error('FEEDBACK_API_BASE must not contain credentials.');
  }
  const hostname = endpoint.hostname.replace(/\.+$/, '').toLowerCase();
  if (hostname === 'trycloudflare.com' || hostname.endsWith('.trycloudflare.com')) {
    throw new Error('FEEDBACK_API_BASE must not use an ephemeral trycloudflare hostname.');
  }
}

function usageText() {
  console.log(`Usage:
  npm run m1:status
  npm run m1:install-key
  npm run m1:install-deepseek-key
  npm run m1:test
  npm run m1:usage

Environment overrides:
  M1_SSH_HOST=${sshHost}
  FEEDBACK_API_BASE=${apiBase || '<required stable HTTPS endpoint>'}
  M1_FEEDBACK_ENV_PATH=${envPath}
  M1_FEEDBACK_SERVICE_LABEL=${serviceLabel}`);
}
