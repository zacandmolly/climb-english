#!/usr/bin/env node
// R11 oxidize report — turn recorded friction into an optimization plan.
//
// Input : docs/oxidize/log.json (append-only friction rows; seed file ships a
//         few examples so the plan is non-empty on first run).
// Output: docs/oxidize/plan.md — a human-readable plan that groups friction by
//         `blockedBy`, counts it, maps each cluster to a root cause and a
//         suggested tool/permission, and gives before/after targets so the
//         human can measure whether the fix worked.
//
// HUMAN GATE (R11 boundary, by design): this script only READS the log and
// WRITES the plan. It never edits scripts/*, .github/workflows/ci.yml, or
// package.json. A human picks which items to implement; each plan row names
// the files that would need to change so the choice is explicit.
//
// Run:
//   npm run oxidize

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadFrictionLog } from './lib/friction-log.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PLAN_PATH = path.join(ROOT, 'docs', 'oxidize', 'plan.md');

// Example row shown in the "no friction yet" section so a human can see the
// exact shape to append via scripts/lib/friction-log.mjs.
const EXAMPLE_ROW = {
  ts: '2026-08-25T00:00:00.000Z',
  agent: 'ai',
  phase: 'phase-3',
  cmd: 'npm run lint',
  blockedBy: 'other',
  expected: '全绿',
  actual: '一个文件 eslint 报错',
  suggestion: '用 prettier --write 修复后提交',
};

// Map each blockedBy cluster to the human-readable guidance the plan needs:
// the root cause to name and the kind of tool/permission to suggest.
const CLUSTER_META = {
  permission: {
    label: '权限拦截',
    rootCause: '命令需要写权限/网络权限/secret，当前环境下被拒绝或不可用',
    remedy: '补齐 workflow 权限（contents/write 等）、secret（DEEPSEEK_API_KEY）、或显式授权白名单',
    files: ['.github/workflows/ci.yml', 'package.json'],
  },
  'missing-lib': {
    label: '缺失库',
    rootCause: '脚本依赖的 npm/系统库尚未安装，或版本不匹配',
    remedy: '把依赖写入 package.json dependencies/devDependencies，并补 install 步骤',
    files: ['package.json'],
  },
  'missing-tool': {
    label: '缺失工具',
    rootCause: '脚本依赖的 CLI（如 gh、lsof、ffmpeg）在当前环境未安装或不可用',
    remedy: '在 CI 安装对应 CLI，或为脚本加优雅降级（无工具时打提示而非报错）',
    files: ['scripts/*', '.github/workflows/ci.yml', 'package.json'],
  },
  bug: {
    label: '脚本 bug',
    rootCause: '脚本逻辑错误/边界未处理，导致预期行为与实测不一致',
    remedy: '修复该脚本逻辑，并加回归测试（tests/*）防止回退',
    files: ['scripts/*', 'tests/*'],
  },
  other: {
    label: '其他摩擦',
    rootCause: '不属于上面四类的偶发摩擦',
    remedy: '人工判断，补充工具或权限',
    files: ['scripts/*'],
  },
};

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main() {
  const rows = loadFrictionLog();

  if (rows.length === 0) {
    writePlan({
      clusters: [],
      summary:
        '暂无摩擦日志。执行过程中被拦（权限/缺库/缺工具/bug）时，' +
        '用 scripts/lib/friction-log.mjs 的 appendFriction 追加一行即可在这里生成计划。',
    });
    console.log('✓ plan.md written (no friction recorded yet).');
    return;
  }

  const clusters = groupByBlockedBy(rows);
  writePlan({ clusters, summary: buildSummary(rows.length, clusters) });

  console.log(
    `✓ plan.md written from ${rows.length} friction row(s) across ${clusters.length} cluster(s).`
  );
  for (const cluster of clusters) {
    console.log(
      `  - ${cluster.label}: ${cluster.count} (${Math.round((cluster.count / rows.length) * 100)}%)`
    );
  }
}

function groupByBlockedBy(rows) {
  // Count per cluster and surface every distinct command so the human sees the
  // literal commands that kept failing.
  const byCluster = new Map();
  for (const row of rows) {
    const key = row.blockedBy;
    if (!byCluster.has(key)) {
      byCluster.set(key, { count: 0, commands: new Map(), suggestions: new Set() });
    }
    const cluster = byCluster.get(key);
    cluster.count += 1;
    const cmd = row.cmd || '(no command)';
    cluster.commands.set(cmd, (cluster.commands.get(cmd) ?? 0) + 1);
    if (row.suggestion) cluster.suggestions.add(row.suggestion);
  }

  return [...byCluster.entries()]
    .map(([key, data]) => {
      const meta = CLUSTER_META[key] ?? CLUSTER_META.other;
      const examples = [...data.commands.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([command, count]) => ({ command, count }));
      return {
        key,
        label: meta.label,
        count: data.count,
        rootCause: meta.rootCause,
        remedy: meta.remedy,
        files: meta.files,
        suggestions: [...data.suggestions].slice(0, 4),
        examples,
      };
    })
    .sort((a, b) => b.count - a.count);
}

function buildSummary(total, clusters) {
  const lines = [];
  lines.push(`共记录 ${total} 条摩擦，归类为 ${clusters.length} 类。`);
  for (const cluster of clusters) {
    lines.push(
      `- **${cluster.label}**：${cluster.count} 条（${Math.round((cluster.count / total) * 100)}%）`
    );
  }
  return lines.join('\n');
}

function writePlan({ clusters, summary }) {
  const date = new Date().toISOString().slice(0, 10);
  const lines = [];

  lines.push(`# Oxidize 优化计划（${date}）`);
  lines.push('');
  lines.push(
    '> 本计划由 `npm run oxidize` 从 `docs/oxidize/log.json` 自动生成，**仅作供人挑选的建议**，不自动修改 scripts/CI。'
  );
  lines.push('');
  lines.push(summary);
  lines.push('');
  lines.push('## 各摩擦簇与建议');
  lines.push('');

  if (clusters.length === 0) {
    lines.push('暂无摩擦记录。');
    lines.push('');
    lines.push('### 日志格式示例');
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(EXAMPLE_ROW, null, 2));
    lines.push('```');
  }

  for (const cluster of clusters) {
    lines.push(`### ${cluster.label}`);
    lines.push('');
    lines.push(`- **发生次数**：${cluster.count}（before）`);
    lines.push(`- **根因**：${cluster.rootCause}`);
    lines.push(`- **建议补工具/权限**：${cluster.remedy}`);
    lines.push(`- **需改动文件**：${cluster.files.join('、')}`);
    lines.push(`- **目标（after）**：该类摩擦降至 ${targetFor(cluster.key)}。`);
    if (cluster.suggestions.length > 0) {
      lines.push(`- **已有建议**：${cluster.suggestions.map((s) => `「${s}」`).join('；')}`);
    }
    if (cluster.examples.length > 0) {
      lines.push('- **高频命令**：');
      for (const example of cluster.examples) {
        lines.push(`  - ${example.command}（×${example.count}）`);
      }
    }
    lines.push('');
  }

  lines.push('## 人机边界');
  lines.push('');
  lines.push('1. **只出计划**：本脚本只读日志、写计划，不改任何 scripts/CI；');
  lines.push(
    '2. **人挑执行**：由人逐条决定是否实施，选中后单独提交并验证（before/after 对照本文件）；'
  );
  lines.push('3. **可量化验收**：每类摩擦的目标次数写在 after 列，达到即视为该项闭合。');
  lines.push('');

  fs.mkdirSync(path.dirname(PLAN_PATH), { recursive: true });
  fs.writeFileSync(PLAN_PATH, lines.join('\n'), 'utf8');
}

// A deliberate, modest target per cluster. These are the before/after numbers
// the plan promises; raising them is a human decision.
function targetFor(key) {
  switch (key) {
    case 'permission':
      return '0 次（权限补齐后不再被拦）';
    case 'missing-lib':
      return '0 次（依赖入 package.json）';
    case 'missing-tool':
      return '0 次（CI 安装对应 CLI）';
    case 'bug':
      return '0 次（修复并加回归测试）';
    default:
      return '减少一半（人工判断）';
  }
}
