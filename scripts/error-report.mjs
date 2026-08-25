#!/usr/bin/env node
// R10 error-report — cluster the frontend error inbox and ask DeepSeek for a
// root cause + fix suggestion, then write a dated markdown report.
//
// SCOPE BOUNDARY (MVP — IMPORTANT): this script only READS the collected errors
// and WRITES an analysis report. It does NOT auto-modify source code. The
// design in system_design.md gates "auto-modify code to fix the error" behind
// a later, human-approved phase — see the boundary comment in
// src/lib/errorReporter.ts.
//
// Input : docs/error-inbox.jsonl (one JSON record per line, appended by the
//         server's POST /api/errors in dev).
// Output: docs/error-report-YYYY-MM-DD.md (clustered, with DeepSeek analysis).
//
// DeepSeek is optional: without DEEPSEEK_API_KEY the script still clusters the
// errors and writes a report, but the root-cause/suggestion fields are marked
// "需配置 DEEPSEEK_API_KEY". This is the graceful-degradation path the gate
// requires — it must run and produce a report even with no key.
//
// Run:
//   npm run errors:report

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseJsonLoose } from './lib/translate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INBOX_PATH = path.join(ROOT, 'docs', 'error-inbox.jsonl');
const TODAY = new Date().toISOString().slice(0, 10);
const REPORT_PATH = path.join(ROOT, 'docs', `error-report-${TODAY}.md`);

const DEEPSEEK_API_KEY = (process.env.DEEPSEEK_API_KEY ?? '').trim();
const DEEPSEEK_BASE_URL = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(
  /\/+$/,
  ''
);
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main() {
  const records = readInbox();
  console.log(`Read ${records.length} error record(s) from error-inbox.jsonl.`);

  if (records.length === 0) {
    writeReport({ records: [], clusters: [], note: '暂无报错。' });
    console.log('✓ report written (no errors recorded).');
    return;
  }

  const clusters = clusterRecords(records);
  console.log(`Clustered into ${clusters.length} signature(s):`);
  for (const cluster of clusters) {
    console.log(`  - ${cluster.label} (${cluster.count} 次)`);
  }

  const analysis = await analyzeClusters(clusters);
  writeReport({ records, clusters, analysis, note: null });

  console.log(`\n✓ report written: ${REPORT_PATH}`);
}

// --- inbox ---------------------------------------------------------------

// Read every JSONL line. A malformed line is skipped (one bad line must not
// take down the whole report). Returns [] when the file is absent.
function readInbox() {
  if (!fs.existsSync(INBOX_PATH)) return [];
  const lines = fs.readFileSync(INBOX_PATH, 'utf8').split('\n').filter(Boolean);
  const records = [];
  for (const line of lines) {
    try {
      const parsed = JSON.parse(line);
      if (parsed && typeof parsed === 'object' && (parsed.message || parsed.stack)) {
        records.push(parsed);
      }
    } catch {
      // skip
    }
  }
  return records;
}

// --- clustering -----------------------------------------------------------

// Cluster by the error's fingerprint: the message signature with the stack's
// first code frame (the top-most 'at ...' line) appended, plus the route/path
// so the same error on different screens is distinguished. This groups the
// exact recurring error rather than every distinct stack line.
function errorSignature(record) {
  const message = (record.message ?? '').trim().slice(0, 120);
  const frames = (record.stack ?? '').split('\n').filter((line) => line.includes('at '));
  const firstFrame = frames[0]?.trim().slice(0, 160) ?? '';
  const route = (record.route ?? record.url ?? '').slice(0, 80);
  return `${message} || ${firstFrame} || ${route}`;
}

function clusterRecords(records) {
  const bySignature = new Map();
  for (const record of records) {
    const sig = errorSignature(record);
    if (!bySignature.has(sig)) {
      bySignature.set(sig, { sig, count: 0, samples: [], routes: new Set() });
    }
    const cluster = bySignature.get(sig);
    cluster.count += 1;
    if (cluster.samples.length < 3) cluster.samples.push(record);
    cluster.routes.add(record.route ?? record.url ?? '(unknown)');
  }

  return [...bySignature.values()]
    .map((cluster, index) => ({
      ...cluster,
      index,
      label: (cluster.samples[0]?.message ?? 'unknown').slice(0, 90),
      routes: [...cluster.routes],
    }))
    .sort((a, b) => b.count - a.count)
    .map((cluster, index) => ({ ...cluster, index }));
}

// --- DeepSeek analysis -----------------------------------------------------

async function analyzeClusters(clusters) {
  const hasKey = DEEPSEEK_API_KEY.startsWith('sk-') && DEEPSEEK_API_KEY.length >= 30;
  if (!hasKey) {
    console.log('  ! DEEPSEEK_API_KEY not set; writing report without AI analysis.');
    return {
      mode: 'no-key',
      items: clusters.map((cluster) => ({
        index: cluster.index,
        label: cluster.label,
        rootCause: '需配置 DEEPSEEK_API_KEY 后生成。',
        suggestion: '需配置 DEEPSEEK_API_KEY 后生成。',
      })),
    };
  }

  const payload = clusters.slice(0, 12).map((cluster, index) => ({
    i: index,
    label: cluster.label,
    count: cluster.count,
    stack: (cluster.samples[0]?.stack ?? '').slice(0, 1200),
    route: cluster.routes.join(', '),
  }));

  const body = {
    model: DEEPSEEK_MODEL,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are a senior frontend debugger for a React + TypeScript climbing-English app. ' +
          'Given clusters of window.onerror / unhandledrejection errors, return a root cause and a concrete fix suggestion for each. ' +
          'Return ONLY JSON: {"items":[{"i":0,"rootCause":"...","suggestion":"..."}]}. ' +
          'Do not invent errors; infer the most likely cause from the stack and message.',
      },
      { role: 'user', content: JSON.stringify(payload) },
    ],
  };

  let response;
  try {
    response = await fetch(`${DEEPSEEK_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (error) {
    console.warn(`  ! DeepSeek request failed: ${error.message}`);
    return { mode: 'error', items: fallbackItems(clusters) };
  }

  if (!response.ok) {
    const text = await response.text();
    console.warn(`  ! DeepSeek API error ${response.status}: ${text.slice(0, 200)}`);
    return { mode: 'error', items: fallbackItems(clusters) };
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content ?? '{}';
  const parsed = parseJsonLoose(content);
  const byIndex = new Map(
    (Array.isArray(parsed.items) ? parsed.items : []).map((item) => [item?.i, item])
  );

  const items = clusters.slice(0, 12).map((cluster, index) => {
    const item = byIndex.get(index);
    return {
      index: cluster.index,
      label: cluster.label,
      rootCause: item?.rootCause ?? '（AI 未返回，请人工判断）',
      suggestion: item?.suggestion ?? '（AI 未返回，请人工判断）',
    };
  });
  return { mode: 'ai', items };
}

function fallbackItems(clusters) {
  return clusters.slice(0, 12).map((cluster) => ({
    index: cluster.index,
    label: cluster.label,
    rootCause: 'AI 调用失败，请输入 stack 后人工分析。',
    suggestion: '请根据 stack 判断是否加空值兜底、边界处理或 try/catch。',
  }));
}

// --- report ---------------------------------------------------------------

function writeReport({ records, clusters, analysis, note }) {
  const lines = [];
  lines.push(`# 前端报错分析报告（${TODAY}）`);
  lines.push('');
  if (note) {
    lines.push(note);
    lines.push('');
    lines.push('## 报错明细');
    lines.push('');
    lines.push('暂无报错记录。');
    lines.push('');
  } else {
    lines.push(`- 报错总数：${records.length}`);
    lines.push(`- 去重签名数：${clusters.length}`);
    lines.push(`- 分析模式：${analysis?.mode === 'ai' ? 'DeepSeek AI' : '本地聚类（无 AI）'}`);
    lines.push('');
    lines.push('## 聚类摘要');
    lines.push('');
    lines.push('| 签名 | 次数 | 页面 |');
    lines.push('| --- | --- | --- |');
    for (const cluster of clusters) {
      lines.push(
        `| ${escapeCell(cluster.label)} | ${cluster.count} | ${escapeCell(cluster.routes.join(', ') || '-')} |`
      );
    }
    lines.push('');
    lines.push('## 根因与修复建议');
    lines.push('');
    lines.push(
      '> 本报告为建议性，**不做自动改码**；自动修复需人验收后再实施（见 errorReporter.ts 边界注释）。'
    );
    lines.push('');
    const items = analysis?.items ?? fallbackItems(clusters);
    for (const cluster of clusters.slice(0, 12)) {
      const item = items.find((entry) => entry.index === cluster.index) ?? {
        rootCause: '（待人工分析）',
        suggestion: '（待人工分析）',
      };
      lines.push(`### ${cluster.label}`);
      lines.push('');
      lines.push(`- **次数**：${cluster.count}`);
      lines.push(`- **栈帧**：\`\`\`\n${(cluster.samples[0]?.stack ?? '').slice(0, 800)}\n\`\`\``);
      lines.push(`- **根因**：${item.rootCause}`);
      lines.push(`- **建议**：${item.suggestion}`);
      lines.push('');
    }
  }

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${lines.join('\n')}\n`, 'utf8');
}

function escapeCell(value) {
  return String(value ?? '')
    .replace(/\|/g, '/')
    .replace(/\n/g, ' ');
}
