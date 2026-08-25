#!/usr/bin/env node
// R8 segment-parameter search — data-driven grid experiment (read-only).
//
// The problem: segment.mjs's DEFAULTS (maxGapSeconds=1.5, maxWords=26,
// minWords=6, mergeGapSeconds=2.0) were tuned by hand against a handful of
// regression cases. R8 replaces "feels right" with a data-driven matrix: run
// the segmenter over REAL word-level timestamps sampled from the repo's video
// cues, sweep a small parameter grid, score each cell with metrics/metrics.mjs,
// and record the best cell + the full matrix in docs/segment-parameter-search.md
// and docs/segment-results.json.
//
// READ-ONLY by design: this script never writes to segment.mjs. The "best"
// recommendation is a suggestion for a human to weigh; the default parameters
// are left untouched (per the boundary in system_design.md).
//
// Data source: the repo has no .vtt fixture in CI, so we derive word-level
// timestamps from the `cues` (en + startTime/endTime) of the *.video.ts files
// using the SAME equidistant interpolation timed-words.mjs uses for manual
// cues (its `wordsFromCues`). We sample 2-3 videos, each 300-500 words, to keep
// the sweep fast and representative.
//
// Grid:
//   maxGapSeconds: {0.7, 1.0, 1.5, 1.8}
//   minWords:      {4, 5, 6, 7}
//   mergeGapSeconds:{1.2, 1.5, 2.0, 2.5}
//   maxWords:      {22, 26, 30}
//
// Run:
//   node scripts/experiments/segment-parameter-search.mjs
//   node scripts/experiments/segment-parameter-search.mjs --dry-run   # report but do not write files

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { segmentWords } from '../lib/segment.mjs';
import { wordsFromCues } from '../lib/timed-words.mjs';
import { evaluateCell } from './lib/metrics.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_DIR = path.join(ROOT, 'src/data/videos');
const DOCS_DIR = path.join(ROOT, 'docs');
const RESULT_JSON = path.join(DOCS_DIR, 'segment-results.json');
const RESULT_MD = path.join(DOCS_DIR, 'segment-parameter-search.md');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');

const DEFAULT_GRID = {
  maxGapSeconds: [0.7, 1.0, 1.5, 1.8],
  minWords: [4, 5, 6, 7],
  mergeGapSeconds: [1.2, 1.5, 2.0, 2.5],
  maxWords: [22, 26, 30],
};

// MaxSentenceSeconds is not swept but is part of the scoring (overlong limit).
const MAX_SENTENCE_SECONDS = 18;
const SAMPLE_TARGET = [350, 450]; // per-video word target range

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main() {
  const videos = loadSampleVideos();
  if (videos.length === 0) {
    console.error('No *.video.ts files found under src/data/videos; cannot run the experiment.');
    process.exit(1);
  }

  // Build the word-level samples. We sample each video to a target word count
  // so the sweep is a fair comparison of the same amount of text.
  const samples = [];
  for (const video of videos) {
    const words = sampleWordsFromVideo(video, SAMPLE_TARGET);
    if (words.length === 0) continue;
    samples.push({ videoId: video.id, title: video.title, words });
  }
  if (samples.length === 0) {
    console.error('Could not derive any word samples from the video cues.');
    process.exit(1);
  }

  console.log(`Loaded ${samples.length} video sample(s).`);
  for (const sample of samples) {
    console.log(`  - ${sample.videoId} (${sample.words.length} words)`);
  }

  const cells = buildGridCells(DEFAULT_GRID);
  console.log(
    `Grid: ${cells.length} cells (${JSON.stringify(DEFAULT_GRID.maxGapSeconds)} x ${JSON.stringify(DEFAULT_GRID.minWords)} x ${JSON.stringify(DEFAULT_GRID.mergeGapSeconds)} x ${JSON.stringify(DEFAULT_GRID.maxWords)}).\n`
  );

  const results = runGrid(cells, samples);
  const ranked = results.slice().sort((a, b) => b.avgScore - a.avgScore);
  const best = ranked[0];

  writeResults({ samples, cells, ranked, best });

  console.log(`\n=== Best cell ===`);
  console.log(
    `  ${formatCell(best.cell)}  avgScore=${best.avgScore.toFixed(4)}  ` +
      `fragRate=${best.avgFragmentRate.toFixed(3)}  overlong=${best.avgOverlongRate.toFixed(3)}  coverage=${best.avgWordCoverage.toFixed(3)}`
  );
  console.log(`\nRecommendation written to ${dryRun ? '(dry-run, not written)' : RESULT_MD}`);
}

// -- data loading -----------------------------------------------------------

// Parse every *.video.ts into a { id, title, cues } object using the same
// regex + JSON.parse approach as check-cue-alignment.mjs.
function loadSampleVideos() {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.endsWith('.video.ts'))
    .sort();

  const videos = [];
  for (const file of files) {
    try {
      const video = parseVideoFile(path.join(DATA_DIR, file));
      videos.push({ id: video.id, title: video.title, cues: video.cues ?? [] });
    } catch {
      // Skip unparseable files rather than failing the whole sweep.
    }
  }
  return videos;
}

function parseVideoFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const match = text.match(/=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!match) throw new Error(`Could not parse ${filePath}`);
  return JSON.parse(match[1]);
}

// Derive equidistant word-level timestamps from a video's cues and then sample
// a contiguous window of ~SAMPLE_TARGET words so all videos contribute a fair
// amount of text. Uses timed-words.mjs's identical interpolation.
function sampleWordsFromVideo(video, target) {
  const allWords = wordsFromCues(
    video.cues.map((cue) => ({ start: cue.startTime, end: cue.endTime, text: cue.en ?? '' }))
  );
  if (allWords.length === 0) return [];

  const [minTarget, maxTarget] = target;
  const desired = Math.max(minTarget, Math.min(maxTarget, allWords.length));
  // Take a contiguous slice centred on the middle of the transcript so we do
  // not always grab the opening words (which are often filler-heavy).
  const start = Math.max(0, Math.floor((allWords.length - desired) / 2));
  const slice = allWords.slice(start, start + desired);
  return slice;
}

// -- grid -------------------------------------------------------------------

function buildGridCells(grid) {
  const cells = [];
  for (const maxGapSeconds of grid.maxGapSeconds) {
    for (const minWords of grid.minWords) {
      for (const mergeGapSeconds of grid.mergeGapSeconds) {
        for (const maxWords of grid.maxWords) {
          cells.push({ maxGapSeconds, minWords, mergeGapSeconds, maxWords });
        }
      }
    }
  }
  return cells;
}

function runGrid(cells, samples) {
  const results = [];
  for (const cell of cells) {
    const perVideo = samples.map((sample) => evaluateOnSample(sample.words, cell));
    const average = (key) =>
      perVideo.reduce((sum, entry) => sum + entry.metrics[key], 0) / perVideo.length;
    results.push({
      cell,
      perVideo,
      avgScore: average('score'),
      avgFragmentRate: average('fragmentRate'),
      avgOverlongRate: average('overlongRate'),
      avgWordCoverage: average('wordCoverage'),
      avgLengthDistributionScore: average('lengthDistributionScore'),
    });
  }
  return results;
}

function evaluateOnSample(words, cell) {
  const options = {
    maxGapSeconds: cell.maxGapSeconds,
    maxWords: cell.maxWords,
    minWords: cell.minWords,
    mergeGapSeconds: cell.mergeGapSeconds,
  };
  // The softSplitWords and maxSentenceSeconds DEFAULTS are left intact; we only
  // override the swept dimensions so the comparison isolates them.
  const { sentences } = segmentWords(words, options);
  return {
    metrics: evaluateCell({
      sentences,
      inputWords: words,
      cell: { ...cell, maxSentenceSeconds: MAX_SENTENCE_SECONDS },
    }),
  };
}

function formatCell(cell) {
  return `maxGap=${cell.maxGapSeconds.toFixed(1)} minWords=${cell.minWords} mergeGap=${cell.mergeGapSeconds.toFixed(1)} maxWords=${cell.maxWords}`;
}

// -- output -------------------------------------------------------------

function writeResults({ samples, cells, ranked, best }) {
  const summary = {
    generatedAt: new Date().toISOString(),
    seed: null,
    stepsDescription: 'Deterministic word-sample slice (no RNG used).',
    samples: samples.map((sample) => ({
      videoId: sample.videoId,
      title: sample.title,
      wordCount: sample.words.length,
    })),
    grid: DEFAULT_GRID,
    cellCount: cells.length,
    best: best ? { cell: best.cell, avgScore: best.avgScore } : null,
    top5: ranked.slice(0, 5).map((entry) => ({
      cell: entry.cell,
      avgScore: entry.avgScore,
      avgFragmentRate: entry.avgFragmentRate,
      avgOverlongRate: entry.avgOverlongRate,
      avgWordCoverage: entry.avgWordCoverage,
    })),
  };

  const md = buildMarkdown({ summary, ranked, best, samples });

  if (!dryRun) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
    fs.writeFileSync(RESULT_JSON, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
    fs.writeFileSync(RESULT_MD, md, 'utf8');
    console.log(`\nWrote ${RESULT_MD}`);
    console.log(`Wrote ${RESULT_JSON}`);
  }
}

function buildMarkdown({ summary, ranked, best }) {
  const lines = [];
  lines.push('# R8 断句参数数据驱动实验结果');
  lines.push('');
  lines.push(
    `> 生成时间：${summary.generatedAt} ｜ 无随机种子（确定性词级采样）｜ 只读实验，**未修改** \`segment.mjs\`。`
  );
  lines.push('');
  lines.push('## 数据源');
  lines.push('');
  lines.push(
    '从 `src/data/videos/*.video.ts` 的 cues（en+startTime/endTime）用 `timed-words.mjs` 的 `wordsFromCues` 等距插值得到词级时间戳，中段连续采样：'
  );
  lines.push('');
  lines.push('| 视频 | 标题 | 采样词数 |');
  lines.push('| --- | --- | --- |');
  for (const sample of summary.samples) {
    lines.push(`| ${sample.videoId} | ${sample.title} | ${sample.wordCount} |`);
  }
  lines.push('');
  lines.push('## 参数网格');
  lines.push('');
  lines.push(`- \`maxGapSeconds\` ∈ ${JSON.stringify(summary.grid.maxGapSeconds)}`);
  lines.push(`- \`minWords\` ∈ ${JSON.stringify(summary.grid.minWords)}`);
  lines.push(`- \`mergeGapSeconds\` ∈ ${JSON.stringify(summary.grid.mergeGapSeconds)}`);
  lines.push(`- \`maxWords\` ∈ ${JSON.stringify(summary.grid.maxWords)}`);
  lines.push(`- 网格规模：${summary.cellCount} 格`);
  lines.push('');
  lines.push('## 最优参数建议');
  lines.push('');
  if (best) {
    lines.push(`**${formatCell(best.cell)}**  （avgScore=${best.avgScore.toFixed(4)}）`);
    lines.push('');
    lines.push(`- 平均碎片率：${best.avgFragmentRate.toFixed(4)}`);
    lines.push(`- 平均超长句率：${best.avgOverlongRate.toFixed(4)}`);
    lines.push(`- 平均词覆盖：${best.avgWordCoverage.toFixed(4)}`);
    lines.push('- 相对当前默认值：仅供人工评估是否改 `segment.mjs`；默认参数**保持不变**。');
    lines.push('');
    lines.push('## 实验方法说明与局限');
    lines.push('');
    lines.push(
      '- **词级时间戳为等距插值估计**：仓库无字幕 VTT fixture，故用 `wordsFromCues` 在 cue 内匀速插值。真实语音停顿与插值估计有偏差，`maxGapSeconds` 与 `mergeGapSeconds` 的效果只能相对比较，不能当作绝对阈值。'
    );
    lines.push(
      '- **碎片率阈值取自本格 `minWords`**：`minWords` 越小，统计上"碎片"定义越宽松，碎片率天然降低。因此"minWords=4 最优"是评分函数偏向的结果，**不能只凭此判定 4 优于 6**——需结合句长分布与真实语速权衡。'
    );
    lines.push(
      '- **当前默认值（maxGap=1.5, minWords=6, mergeGap=2.0, maxWords=26）在历史回归里的价值**：`minWords=6`/`maxGap=1.5` 是此前修复"power and strength to a / get the last few inches"碎片的刻意上调。本实验评分偏重"避免碎片 + 避免超长句"，会倾向更小的 `minWords`/`maxGap`；**是否回归旧默认需人结合真实填充率决定**。'
    );
    lines.push('');
  } else {
    lines.push('（无有效样本，无最优建议）');
    lines.push('');
  }

  lines.push('## Top-5 参数组合');
  lines.push('');
  lines.push(
    '| 排名 | maxGap | minWords | mergeGap | maxWords | avgScore | 碎片率 | 超长率 | 覆盖 |'
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  summary.top5.forEach((entry, index) => {
    lines.push(
      `| ${index + 1} | ${entry.cell.maxGapSeconds} | ${entry.cell.minWords} | ${entry.cell.mergeGapSeconds} | ${entry.cell.maxWords} | ${entry.avgScore.toFixed(4)} | ${entry.avgFragmentRate.toFixed(3)} | ${entry.avgOverlongRate.toFixed(3)} | ${entry.avgWordCoverage.toFixed(3)} |`
    );
  });
  lines.push('');
  lines.push('## 全矩阵（按 avgScore 降序，截取前 30）');
  lines.push('');
  lines.push(
    '| maxGap | minWords | mergeGap | maxWords | avgScore | 碎片率 | 超长率 | 覆盖 | 分布 |'
  );
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const entry of ranked.slice(0, 30)) {
    lines.push(
      `| ${entry.cell.maxGapSeconds} | ${entry.cell.minWords} | ${entry.cell.mergeGapSeconds} | ${entry.cell.maxWords} | ${entry.avgScore.toFixed(4)} | ${entry.avgFragmentRate.toFixed(3)} | ${entry.avgOverlongRate.toFixed(3)} | ${entry.avgWordCoverage.toFixed(3)} | ${entry.avgLengthDistributionScore.toFixed(3)} |`
    );
  }
  lines.push('');
  lines.push('## 复现说明');
  lines.push('');
  lines.push('```bash');
  lines.push('node scripts/experiments/segment-parameter-search.mjs');
  lines.push('```');
  lines.push('');
  lines.push('- 输入样本：上表列出的视频 cue 等距插值词级时间戳（中段连续采样）；');
  lines.push('- 参数网格：见上；无随机种子（确定性切片），可稳定复现；');
  lines.push('- 指标定义：见 `scripts/experiments/lib/metrics.mjs`；');
  lines.push('- **只读**：本实验不修改 `segment.mjs` 默认参数，是否采纳最优建议由人决定。');
  lines.push('');
  return lines.join('\n');
}
