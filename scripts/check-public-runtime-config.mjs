#!/usr/bin/env node

import { loadEnv } from 'vite';

const mode = process.env.VITE_BUILD_MODE || process.env.NODE_ENV || 'production';
const publicEnv = loadEnv(mode, process.cwd(), 'VITE_');

for (const name of ['VITE_FEEDBACK_API_BASE', 'VITE_ERROR_REPORT_ENDPOINT']) {
  if (Object.prototype.hasOwnProperty.call(process.env, name)) {
    publicEnv[name] = process.env[name];
  }
}

const endpoints = [
  ['VITE_FEEDBACK_API_BASE', publicEnv.VITE_FEEDBACK_API_BASE],
  ['VITE_ERROR_REPORT_ENDPOINT', publicEnv.VITE_ERROR_REPORT_ENDPOINT],
];

for (const [name, rawValue] of endpoints) {
  validateOptionalStableEndpoint(name, rawValue);
}

function validateOptionalStableEndpoint(name, rawValue) {
  const value = String(rawValue || '').trim();
  if (!value) return;

  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    fail(`${name} must be an absolute HTTPS URL or empty.`);
  }

  if (endpoint.protocol !== 'https:') {
    fail(`${name} must use HTTPS.`);
  }
  if (endpoint.username || endpoint.password) {
    fail(`${name} must not contain credentials.`);
  }
  const hostname = endpoint.hostname.replace(/\.+$/, '').toLowerCase();
  if (hostname === 'trycloudflare.com' || hostname.endsWith('.trycloudflare.com')) {
    fail(`${name} must not use an ephemeral trycloudflare hostname.`);
  }
}

function fail(message) {
  console.error(`Runtime configuration rejected: ${message}`);
  process.exit(1);
}

console.log(
  publicEnv.VITE_FEEDBACK_API_BASE
    ? 'Runtime configuration: stable feedback endpoint configured.'
    : 'Runtime configuration: public feedback is explicitly offline.'
);
