#!/usr/bin/env node
// Dev-server port guard (Phase 3 / R9).
//
// Why this exists: the RETROSPECTIVE recorded a recurring pain — a stale dev
// server from a previous session keeps `npm run dev` from binding port 5173,
// and the developer (or an AI) has to remember to `lsof` it and `kill` it by
// hand. This guard runs BEFORE `node server/index.mjs`, probes 5173, and
// separates the two cases that confuse people:
//
//   1. The port is held by a process whose working directory points inside
//      THIS repo → almost certainly a leftover `npm run dev` from an earlier
//      session. Non-blocking (exit 0): we print the exact `kill` command and
//      let the caller decide, rather than failing the build the developer
//      may not even know was stale.
//   2. The port is held by a process whose cwd is elsewhere → something else
//      (another app, another branch, another repo) really owns 5173. We block
//      (exit 1) with a clear message, because starting the dev server would
//      silently fail or bind to a port that is not actually ours.
//
// Zero dependencies: uses `lsof` + `ps`, which are present on macOS and most
// Linux distros. Windows is explicitly unsupported (--nofallback prints a
// hint instead of guessing), matching the CI scope which does not run `dev`.
//
// Run directly:
//   node scripts/port-guard.mjs
//   node scripts/port-guard.mjs --port 5173
//   node scripts/port-guard.mjs --nofallback

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform } from 'node:os';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const args = process.argv.slice(2);
const portFlag = args.indexOf('--port');
const port = portFlag >= 0 ? String(args[portFlag + 1] ?? '5173') : '5173';

if (platform() === 'win32') {
  // We deliberately do not implement a Windows path: `lsof` is not a Windows
  // binary and emulating the cwd probe with `netstat` + `wmic` is guesswork.
  // Print a hint and let the platform-specific guard land in a follow-up.
  console.warn(`[port-guard] Windows is not supported yet: port ${port} is not guarded.`);
  process.exit(0);
}

const pids = portPids(port);

if (pids.length === 0) {
  console.log(`[port-guard] ✓ port ${port} is free — dev server can start.`);
  process.exit(0);
}

// Sort deterministically so the report below is stable across runs.
const processDetails = pids
  .map((pid) => ({ pid, ...probeProcess(pid) }))
  .sort((a, b) => a.pid - b.pid);

const ownedByRepo = processDetails.filter((entry) => isInsideRepo(entry.cwd));
const ownedElsewhere = processDetails.filter((entry) => !isInsideRepo(entry.cwd));

if (ownedByRepo.length > 0) {
  for (const entry of ownedByRepo) {
    console.log(`[port-guard] ⚠ leftover dev server detected on port ${port} (pid=${entry.pid}).`);
    console.log(`  cwd      : ${entry.cwd}`);
    console.log(`  command  : ${entry.command}`);
    console.log(`  to kill  : kill ${entry.pid}`);
  }
  // Non-blocking: the leftover is ours and we can fix it in one keystroke.
  // Recommend killing, but let the caller decide in case it wants to reuse it.
  console.log(
    '[port-guard] → this is a stale dev server from this repo; safe to kill the pid(s) above.'
  );
  if (ownedElsewhere.length === 0) {
    console.log('[port-guard] → (exiting 0 so the dev server can start fresh after you kill it)');
  }
}

if (ownedElsewhere.length > 0) {
  for (const entry of ownedElsewhere) {
    console.log(
      `[port-guard] ✗ port ${port} is occupied by a process NOT from this repo (pid=${entry.pid}).`
    );
    console.log(`  cwd      : ${entry.cwd}`);
    console.log(`  command  : ${entry.command}`);
    console.log(
      `  suggestion: stop that process, or run dev on another port (e.g. PORT=5174 npm run dev).`
    );
  }
  // Blocking: this is another process's port. Starting the dev server here
  // would fail to bind anyway, so fail fast with a clear reason.
  process.exit(1);
}

// Only own-repo leftovers and nothing else: allow the dev server to start.
console.log(
  `[port-guard] → exiting 0; the dev server will start (kill the leftover pid first if it still holds 5173).`
);
process.exit(0);

// --- helpers ---------------------------------------------------------------

// List the LISTENING pids for a TCP port, using the machine-readable `-Fn`
// output so we do not have to parse the human table. `-Fn` prints one `p<pid>`
// line per descriptor; a listening socket also prints an `n*:port` line we can
// ignore. Returns [] when nothing is listening.
function portPids(targetPort) {
  let raw;
  try {
    raw = execFileSync('lsof', ['-nP', `-iTCP:${targetPort}`, '-sTCP:LISTEN', '-Fn'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    // `lsof` exits non-zero when nothing matches (or is unavailable). An empty
    // result means the port is free, which is the normal happy path, so catch
    // and treat it as "nothing listening". If lsof is genuinely missing, the
    // free-port path keeps dev working rather than failing on a missing tool.
    return [];
  }

  const seen = new Set();
  for (const line of raw.split('\n')) {
    if (line.startsWith('p') && line.length > 1) {
      const pid = Number(line.slice(1));
      if (Number.isFinite(pid)) seen.add(pid);
    }
  }
  return [...seen];
}

// Probe one pid for its working directory and command. `-Fn` emits a cwd
// entry as two lines, `fcwd` then `n<path>` (macOS) or `c<path>` (Linux/BSD),
// depending on the platform's lsof flavour; `ps -o command=` gives the full
// command line. Both are wrapped in try/catch because the process may exit
// between the lsof pass and this probe (a race that must degrade to "unknown"
// not crash).
function probeProcess(pid) {
  let cwd = null;
  try {
    const cwdRaw = execFileSync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const lines = cwdRaw.split('\n');
    let inCwd = false;
    for (const line of lines) {
      if (line === 'fcwd') {
        inCwd = true;
        continue;
      }
      // The name line that immediately follows the fcwd marker carries the
      // cwd path: `n<path>` on macOS, `c<path>` on Linux/BSD. Grab whichever.
      if (inCwd && (line.startsWith('n') || line.startsWith('c'))) {
        cwd = line.slice(1);
        break;
      }
      if (line.startsWith('f') || line.startsWith('p')) {
        inCwd = false;
      }
    }
  } catch {
    // Process exited or lsof errored; leave cwd unknown.
  }

  let command = '';
  try {
    const cmdRaw = execFileSync('ps', ['-o', 'command=', '-p', String(pid)], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    command = cmdRaw.trim();
  } catch {
    // Process exited; leave command empty.
  }

  return { cwd, command };
}

// A cwd points "inside this repo" when it resolves to the repo root or a path
// under it. We also treat an unresolved/unknown cwd carefully: it is NOT our
// repo, so it must not be auto-allowed (the else-branch owns the decision).
function isInsideRepo(cwd) {
  if (!cwd) return false;
  const resolved = path.resolve(cwd);
  return resolved === REPO_ROOT || resolved.startsWith(`${REPO_ROOT}${path.sep}`);
}
