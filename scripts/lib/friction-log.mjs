// Friction log helper for the oxidize harness (Phase 3 / R11).
//
// Why this exists: the RETROSPECTIVE's recurring theme was AI friction — a
// command blocked by permissions, a missing library, a missing CLI tool, or a
// bug that ate a turn. R11 turns that friction into data: callers outside the
// npm dependency graph can append a structured row, and `npm run oxidize`
// aggregates those rows into an optimization plan.
//
// The log format is intentionally simple and append-only. Each row:
//   { ts, agent, phase, cmd, blockedBy, expected, actual, suggestion }
// where `blockedBy` is one of the closed set used by the report:
//   'permission' | 'missing-lib' | 'missing-tool' | 'bug' | 'other'.
//
// appendFriction/logFriction are a deliberate public harness boundary. They
// carry @public tags because external agent runners are invisible to Knip.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

function logPath() {
  return path.join(ROOT, 'docs', 'oxidize', 'log.json');
}

const BLOCKED_BY = ['permission', 'missing-lib', 'missing-tool', 'bug', 'other'];

// Read every recorded friction row. A missing or malformed log is not an error
// for the reporter: it simply means "no friction yet", so we return [] rather
// than throwing. Anything that is not a well-formed row is skipped so a single
// bad line cannot take the whole report down.
export function loadFrictionLog() {
  const file = logPath();
  if (!fs.existsSync(file)) return [];
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isValidRow);
}

// Append one row. `row.blockedBy` is validated against the closed set; an
// unknown value is coerced to 'other' so downstream grouping stays stable.
// Returns the canonical stored row.
/** @public */
export function appendFriction(row) {
  const entry = {
    ts: row.ts ?? new Date().toISOString(),
    agent: String(row.agent ?? 'harness'),
    phase: String(row.phase ?? ''),
    cmd: String(row.cmd ?? ''),
    blockedBy: BLOCKED_BY.includes(row.blockedBy) ? row.blockedBy : 'other',
    expected: String(row.expected ?? ''),
    actual: String(row.actual ?? ''),
    suggestion: String(row.suggestion ?? ''),
  };

  const existing = loadFrictionLog();
  existing.push(entry);
  const file = logPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');
  return entry;
}

// Append + echo to stderr. Useful from CLI callers that want visibility.
/** @public */
export function logFriction(row) {
  const entry = appendFriction(row);
  console.error(
    `[friction] ${entry.blockedBy}: ${entry.cmd || '(no command)'} — ${entry.suggestion || '(no suggestion)'}`
  );
  return entry;
}

function isValidRow(row) {
  return (
    row &&
    typeof row === 'object' &&
    typeof row.ts === 'string' &&
    typeof row.blockedBy === 'string' &&
    BLOCKED_BY.includes(row.blockedBy)
  );
}
