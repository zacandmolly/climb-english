import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../src/lib/runtimeServices.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const runtime = await import(
  `data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`
);

const offlineFeedbackSource = readFileSync(
  new URL('../src/lib/offlineFeedback.ts', import.meta.url),
  'utf8'
);
const compiledOfflineFeedback = ts.transpileModule(offlineFeedbackSource, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2020,
  },
}).outputText;
const offlineFeedback = await import(
  `data:text/javascript;base64,${Buffer.from(compiledOfflineFeedback).toString('base64')}`
);

test('public Pages defaults to explicit offline feedback without a health request', async () => {
  let requestCount = 0;
  const state = await runtime.probeFeedbackService({
    apiBase: '',
    hostname: 'zacandmolly.github.io',
    fetcher: async () => {
      requestCount += 1;
      return new Response();
    },
  });

  assert.equal(state.status, 'offline');
  assert.equal(requestCount, 0);
  assert.match(state.message, /AI 不会分析/);
});

test('configured feedback is online only when health explicitly reports AI ready', async () => {
  const online = await runtime.probeFeedbackService({
    apiBase: 'https://feedback.example.com/',
    hostname: 'zacandmolly.github.io',
    fetcher: async (url) => {
      assert.equal(url, 'https://feedback.example.com/api/health');
      return Response.json({ ok: true, ai: true });
    },
  });
  const noKey = await runtime.probeFeedbackService({
    apiBase: 'https://feedback.example.com',
    hostname: 'zacandmolly.github.io',
    fetcher: async () => Response.json({ ok: true, ai: false }),
  });
  const corsFailure = await runtime.probeFeedbackService({
    apiBase: 'https://feedback.example.com',
    hostname: 'zacandmolly.github.io',
    fetcher: async () => {
      throw new TypeError('Failed to fetch');
    },
  });

  assert.equal(online.status, 'online');
  assert.equal(noKey.status, 'unavailable');
  assert.equal(corsFailure.status, 'unavailable');
  assert.equal(
    runtime.feedbackRequestUrl('https://feedback.example.com/'),
    'https://feedback.example.com/api/speaking-feedback'
  );
});

test('production telemetry is opt-in while development keeps the local inbox', () => {
  assert.equal(runtime.resolveErrorReportEndpoint('', false), '');
  assert.equal(runtime.resolveErrorReportEndpoint('', true), '/api/errors');
  assert.equal(
    runtime.resolveErrorReportEndpoint('https://errors.example.com/collect/', false),
    'https://errors.example.com/collect'
  );
  assert.equal(runtime.isUnsupportedErrorReportStatus(403), true);
  assert.equal(runtime.isUnsupportedErrorReportStatus(404), true);
  assert.equal(runtime.isUnsupportedErrorReportStatus(405), true);
  assert.equal(runtime.isUnsupportedErrorReportStatus(401), true);
  assert.equal(runtime.isUnsupportedErrorReportStatus(410), true);
  assert.equal(runtime.isUnsupportedErrorReportStatus(429), true);
  assert.equal(runtime.isUnsupportedErrorReportStatus(500), false);
});

test('offline feedback distinguishes local-only recording from a failed upload', () => {
  const args = {
    targetSentence: 'Trust your feet.',
    keywords: [{ term: 'feet', zh: '脚', example: 'Trust your feet.' }],
  };
  const localOnly = offlineFeedback.makeClientDemoFeedback(args);
  const remoteFailed = offlineFeedback.makeClientDemoFeedback({
    ...args,
    delivery: 'remote-failed',
  });

  assert.match(localOnly.transcript, /录音没有上传/);
  assert.doesNotMatch(localOnly.transcript, /已尝试发送/);
  assert.match(remoteFailed.transcript, /无法确认服务端是否已经接收或处理/);
  assert.deepEqual(localOnly.keywordHits, []);
  assert.deepEqual(remoteFailed.keywordHits, []);
});
