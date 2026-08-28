// Frontend error reporter for the R10 auto-fix loop (MVP: collect + report).
//
// WHY THIS EXISTS: the RETROSPECTIVE's recurring theme was silent frontend
// errors (a component throws in a lost render, an async chain rejects with no
// handler) that surface only as a blank screen with no trace. This module
// captures those errors at the window level and ships them to the dev server,
// where `npm run errors:report` clusters them and asks DeepSeek for a root
// cause + fix suggestion.
//
// SCOPE BOUNDARY (MVP — IMPORTANT): this reporter ONLY collects and reports.
// It does NOT auto-fix code. The design in system_design.md explicitly gates
// "auto-modify source to fix the error" behind a later, human-approved phase.
// Keep that boundary here so nobody mistakes the collection layer for a
// fixer.
//
// Behaviour:
//   - Hooks `window.onerror` and `unhandledrejection`.
//   - Dedupes: the same message+stack is only reported once per 30s window.
//   - Buffers locally in a ~200-entry localStorage ring.
//   - Dev flushes to /api/errors. Production only sends when
//     VITE_ERROR_REPORT_ENDPOINT is explicitly configured.
//   - If the POST fails or the browser is offline, the error stays in the ring.
//     Auth/unsupported/rate-limit responses are not retried again this session.

import { isUnsupportedErrorReportStatus, resolveErrorReportEndpoint } from './runtimeServices';

const STORAGE_KEY = 'climb-english:error-inbox';
const MAX_BUFFER = 200;
const DEDUPE_WINDOW_MS = 30_000;
const FLUSH_INTERVAL_MS = 20_000;
const ENDPOINT = resolveErrorReportEndpoint(
  import.meta.env.VITE_ERROR_REPORT_ENDPOINT,
  import.meta.env.DEV
);
let endpointDisabled = false;

type ErrorRecord = {
  id: string;
  kind: 'error' | 'unhandledrejection';
  message: string;
  stack: string;
  componentStack?: string;
  url: string;
  ts: string;
  route?: string;
};

// --- buffer (localStorage ring) --------------------------------------------

function readBuffer(): ErrorRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecord) : [];
  } catch {
    return [];
  }
}

function writeBuffer(records: ErrorRecord[]): void {
  try {
    // Ring buffer: keep the newest MAX_BUFFER entries.
    const trimmed = records.slice(-MAX_BUFFER);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch {
    // Storage full or unavailable; drop rather than crash the app.
  }
}

function isRecord(value: unknown): value is ErrorRecord {
  return Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as ErrorRecord).id === 'string' &&
    typeof (value as ErrorRecord).ts === 'string'
  );
}

// --- dedupe ---------------------------------------------------------------

const recent = new Map<string, number>();

function isDuplicate(record: ErrorRecord): boolean {
  const now = Date.now();
  const last = recent.get(record.id);
  if (last !== undefined && now - last < DEDUPE_WINDOW_MS) return true;
  recent.set(record.id, now);
  return false;
}

// --- reporters -------------------------------------------------------------

export function reportError(error: Error | string, kind: ErrorRecord['kind'] = 'error'): void {
  const message = typeof error === 'string' ? error : error.message || String(error);
  const stack = typeof error === 'string' ? '' : error.stack || '';
  const record: ErrorRecord = {
    id: hashRecord(message, stack),
    kind,
    message,
    stack,
    url: window.location.href,
    ts: new Date().toISOString(),
    route: window.location.pathname,
  };

  if (isDuplicate(record)) return;

  const buffer = readBuffer();
  buffer.push(record);
  writeBuffer(buffer);
  void flushBuffer();
}

// --- reporter helpers -----------------------------------------------------

// Deterministic, browser-safe fingerprint hash. `node:crypto` is not available
// in a browser bundle, so we use a small djb2-style hash (strong enough to
// dedupe identical message+stack strings, cheap and dependency-free). The
// server clusters by the same message/stack signature, so the exact hash is
// not a cross-process contract — only the dedupe window matters here.
function hashRecord(message: string, stack: string): string {
  const input = `${message}\n${stack.slice(0, 2000)}`;
  let hash = 5381;
  for (let index = 0; index < input.length; index += 1) {
    hash = (hash * 33) ^ input.charCodeAt(index);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

// --- flush --------------------------------------------------------------

async function flushBuffer(): Promise<void> {
  const buffer = readBuffer();
  if (buffer.length === 0) return;
  if (!ENDPOINT || endpointDisabled) return;
  if (typeof navigator !== 'undefined' && !navigator.onLine) return;

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ errors: buffer }),
    });
    if (response.ok) {
      // Only clear what we successfully sent.
      const sentIds = new Set(buffer.map((record) => record.id));
      const remaining = readBuffer().filter((record) => !sentIds.has(record.id));
      writeBuffer(remaining);
    } else if (isUnsupportedErrorReportStatus(response.status)) {
      // This target does not currently accept telemetry. Keep the local ring,
      // but stop creating permanent auth/unsupported/rate-limit network noise.
      endpointDisabled = true;
    }
  } catch {
    // Offline or server down; keep the buffer for a later flush.
  }
}

// --- install ---------------------------------------------------------------

let installed = false;

export function installErrorReporter(): void {
  if (installed) return;
  installed = true;

  window.addEventListener('error', (event) => {
    const error = event.error;
    if (error instanceof Error) reportError(error, 'error');
    else reportError(event.message || 'Unknown script error', 'error');
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    if (reason instanceof Error) reportError(reason, 'unhandledrejection');
    else reportError(`Unhandled rejection: ${String(reason)}`, 'unhandledrejection');
  });

  if (ENDPOINT) {
    // Periodic retry so offline errors eventually reach an explicitly enabled endpoint.
    window.setInterval(() => {
      void flushBuffer();
    }, FLUSH_INTERVAL_MS);
  }
}
