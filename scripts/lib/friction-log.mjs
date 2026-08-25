// Friction log helper for the oxidize harness (Phase 3 / R11).
//
// Why this exists: the RETROSPECTIVE's recurring theme was AI friction — a
// command blocked by permissions, a missing library, a missing CLI tool, or a
// bug that ate a turn. R11 turns that friction into data: every time the
// self-driving harness hits a wall, it appends one structured row to
// scripts' docs/oxidize/log.json. `npm run oxidize` then aggregates the rows
// into an optimization plan that a human can pick from.
//
// The log format is intentionally simple and append-only. Each row:
//   { ts, agent, phase, cmd, blockedBy, expected, actual, suggestion }
// where `blockedBy` is one of the closed set used by the report:
//   'permission' | 'missing-lib' | 'missing-tool' | 'bug' | 'other'.
//
// This module exposes:
//   logPath()            — resolved path to docs/oxidize/log.json
//   loadFrictionLog()    — read + parse the log (returns [] if absent/invalid)
//   appendFriction(row)  — append a row, creating the file/dir if needed
//   logFriction(row)     — convenience wrapper: append + print to stderr

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function logPath() {
  return path.join(ROOT, 'docs', 'oxidize', 'log.json');
}

export const BLOCKED_BY = ['permission', 'missing-lib', 'missing-tool', 'bug', 'other'];

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
