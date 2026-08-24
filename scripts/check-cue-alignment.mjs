#!/usr/bin/env node
// Diagnostic for the technique / Bern style zh vs. en index drift.
//
// What it does:
//   1. Walks src/data/videos/*.video.ts.
//   2. For every cue, runs three heuristic checks against the question
//      "is this zh actually a translation of cue[i].en, or is it borrowed
//      from cue[i±1] / a neighbour backfill?". Heuristics are intentionally
//      crude so they only flag obviously suspicious rows — the goal is to
//      point translate:videos at the right rows to re-run, not to auto-edit.
//   3. Prints a per-video report and the union of suspected row indexes.
//   4. With `--realign`, rewrites those rows in place to set
//      `needsTranslation: true` (and zeroes `zh`/`note`), so the next
//      `npm run translate:videos -- --video <id>` repaints them with the
//      now-correct alignment invariant.
//
// Heuristics:
//   A. Massive ratio gap: en has many words but zh has < 8 chars, or the
//      reverse — common signature of a fragment whose zh was borrowed from
//      a longer neighbour.
//   B. Substring overlap: cue[i].zh appears as a substring of cue[j].zh for
//      j ≠ i — a backfill-from-reference tell (the Bern short-cue problem).
//   C. Keyword signal: the cue advertises `keywords` that never appear in
//      its own zh, while a nearby cue's zh does mention them — drift tell.
//
// Run:
//   node scripts/check-cue-alignment.mjs                # report only
//   node scripts/check-cue-alignment.mjs --realign     # also clear bad rows
//   node scripts/check-cue-alignment.mjs --strict      # report + exit 1 if flagged
//   node scripts/check-cue-alignment.mjs --strict --baseline scripts/alignment-baseline.json
//                                                      # exempt known drift, fail only on new flags
//   node scripts/check-cue-alignment.mjs --emit-baseline > scripts/alignment-baseline.json
//                                                      # print current flags as a baseline (JSON)
//
// Baseline semantics (phase 02): the first import commits left 151 historical
// drift rows in place. Those are recorded in scripts/alignment-baseline.json
// as (videoId, cueIndex) pairs. With `--baseline <file>`, rows in the baseline
// are exempt — not counted and not fatal — so `--strict` fails only on NEW
// drift introduced by fresh material. `--emit-baseline` writes the current
// full flag set so the baseline can be regenerated after a drift-cleanup PR.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'src/data/videos');

const args = process.argv.slice(2);
const realign = args.includes('--realign');
const strict = args.includes('--strict');
const emitBaseline = args.includes('--emit-baseline');
const videoFlag = args.indexOf('--video');
const onlyId = videoFlag >= 0 ? args[videoFlag + 1] : null;
const baselineFlag = args.indexOf('--baseline');
const baselinePath = baselineFlag >= 0 ? args[baselineFlag + 1] : null;

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

async function main() {
  const baseline = loadBaseline(baselinePath);

  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith('.video.ts'))
    .filter((f) => !onlyId || f === `${onlyId}.video.ts`)
    .sort();

  let totalFlags = 0;
  let totalBaselined = 0;
  let totalCues = 0;
  const emitEntries = [];

  for (const file of files) {
    const fullPath = path.join(DATA_DIR, file);
    const video = parseVideoFile(fullPath);
    const { flagged, total } = inspect(video);
    totalCues += total;

    const { fresh, exempt } = partitionByBaseline(video.id, flagged, baseline);
    totalFlags += fresh.length;
    totalBaselined += exempt.length;

    if (emitBaseline) {
      for (const { index } of flagged) {
        emitEntries.push({ videoId: video.id, cueIndex: index });
      }
      continue;
    }

    console.log(`\n→ ${video.id} (${video.title})`);
    const exemptNote = exempt.length > 0 ? ` (${exempt.length} baselined)` : '';
    console.log(`  cues: ${total}, flagged: ${fresh.length}${exemptNote}`);
    if (fresh.length === 0) {
      console.log('  ✓ alignment looks clean');
      continue;
    }
    const sample = fresh.slice(0, 8);
    for (const { index, reason } of sample) {
      const cue = video.cues[index];
      console.log(
        `  c${String(index + 1).padStart(3, '0')}  ${reason.padEnd(28)}  en="${truncate(cue.en)}"  zh="${truncate(cue.zh)}"`
      );
    }
    if (fresh.length > sample.length) {
      console.log(`  …and ${fresh.length - sample.length} more`);
    }

    if (realign) {
      realignFlagged(video, fresh);
      writeVideoFile(fullPath, video);
      console.log(`  ✓ rewrote ${file} with ${fresh.length} cues marked needsTranslation`);
    }
  }

  if (emitBaseline) {
    emitEntries.sort((a, b) => a.videoId.localeCompare(b.videoId) || a.cueIndex - b.cueIndex);
    console.log(JSON.stringify(emitEntries, null, 2));
    return;
  }

  console.log(
    `\n${realign ? 'Cleared and re-flagged' : 'Suspected'}: ${totalFlags}/${totalCues} cues across ${files.length} video(s).`
  );
  if (baseline.size > 0) {
    console.log(`Baseline exempted: ${totalBaselined} known historical drift row(s).`);
  }

  // Hard-gate mode: the CI alignment job runs with --strict --baseline. Any
  // heuristic flag that is NOT recorded in the baseline means the alignment
  // invariant is broken by fresh material, so the run must fail rather than
  // silently pass. No --strict keeps the legacy "report only, exit 0" behaviour.
  if (strict && totalFlags > 0) {
    console.error(
      `\n✗ alignment check failed: ${totalFlags} new suspicious cue(s). ` +
        'Fix the drift (--realign) or re-run translate:videos for the flagged rows, then re-check.'
    );
    process.exit(1);
  }
}

// Split a video's flagged rows into "new" (not in baseline) and "exempt"
// (recorded in the baseline). Baseline rows are ignored by the report and by
// the --strict exit code, so historical drift stays green while new drift
// fails hard.
function partitionByBaseline(videoId, flagged, baseline) {
  const fresh = [];
  const exempt = [];
  for (const entry of flagged) {
    if (baseline.has(baselineKey(videoId, entry.index))) {
      exempt.push(entry);
    } else {
      fresh.push(entry);
    }
  }
  return { fresh, exempt };
}

function baselineKey(videoId, cueIndex) {
  return `${videoId}::${cueIndex}`;
}

function loadBaseline(filePath) {
  if (!filePath) return new Set();
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Baseline file ${filePath} must contain a JSON array of { videoId, cueIndex }.`
    );
  }
  const keys = new Set();
  for (const entry of parsed) {
    if (typeof entry?.videoId !== 'string' || !Number.isInteger(entry?.cueIndex)) {
      throw new Error(
        `Baseline entry in ${filePath} must be { videoId: string, cueIndex: number }, got: ${JSON.stringify(entry)}`
      );
    }
    keys.add(baselineKey(entry.videoId, entry.cueIndex));
  }
  return keys;
}

function inspect(video) {
  const cues = video.cues;
  const flagged = [];

  for (let i = 0; i < cues.length; i += 1) {
    const cue = cues[i];
    const enTokens = tokenize(cue.en ?? '');
    const zhTokens = tokenize(cue.zh ?? '');
    const reasons = [];

    // Heuristic A: ratio collapse. EN has content (≥ 4 words) but ZH is tiny
    // (< 8 chars after trim) is the most common drift tell
    // (e.g. c030 zh = '力量和强度。').
    if (enTokens.words.length >= 4 && zhTokens.text.length > 0 && zhTokens.text.length < 8) {
      reasons.push(`zh-too-short(${zhTokens.text.length}c/${enTokens.words.length}w)`);
    }

    // Heuristic A2: ZH massively longer than EN — borrowed long zh from a
    // neighbour (Case-2 backfill on Bern, or drifted zh on technique).
    if (zhTokens.text.length > 60 && enTokens.words.length < 8) {
      reasons.push(`zh-too-long(${zhTokens.text.length}c/${enTokens.words.length}w)`);
    }

    // Heuristic B: substring overlap with another cue's zh.
    for (let j = 0; j < cues.length; j += 1) {
      if (j === i) continue;
      const other = cues[j];
      if (!other.zh || !cue.zh) continue;
      if (other.zh.length >= 12 && cue.zh.includes(other.zh)) {
        reasons.push(`zh-substring(c${String(j + 1).padStart(3, '0')})`);
        break;
      }
    }

    // Heuristic C: keyword signal. cue.keywords that don't show up in the
    // cue's own zh but appear in some other cue's zh → suspect of drift.
    const ownZh = (cue.zh ?? '').toLowerCase();
    const keywords = cue.keywords ?? [];
    if (keywords.length > 0) {
      const ownHit = keywords.find((kw) => ownZh.includes(kw.toLowerCase()));
      if (!ownHit) {
        const neighbourHit = cues.findIndex(
          (other, j) =>
            j !== i && (other.zh ?? '').toLowerCase().includes(keywords[0].toLowerCase())
        );
        if (neighbourHit >= 0 && Math.abs(neighbourHit - i) <= 3) {
          reasons.push(`keyword-missing("${keywords[0]}")`);
        }
      }
    }

    if (reasons.length > 0 && reasons.length <= 3) {
      flagged.push({ index: i, reason: reasons.join(' | ') });
    }
  }

  return { flagged, total: cues.length };
}

function realignFlagged(video, flagged) {
  const indexes = new Set(flagged.map((entry) => entry.index));
  for (const index of indexes) {
    const cue = video.cues[index];
    cue.zh = '';
    cue.note = '';
    cue.needsTranslation = true;
  }
  video.needsTranslationCount = video.cues.filter((cue) => cue.needsTranslation).length;
}

function tokenize(text) {
  const words = text.toLowerCase().match(/[a-z']+/g) ?? [];
  const chinese = (text.match(/[\u4e00-\u9fa5]/g) ?? []).length;
  return { words, text, length: text.length, chinese };
}

function truncate(text) {
  if (!text) return '∅';
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length <= 40 ? flat : `${flat.slice(0, 38)}…`;
}

function parseVideoFile(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  const match = text.match(/=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!match) throw new Error(`Could not parse ${filePath}`);
  return JSON.parse(match[1]);
}

function writeVideoFile(filePath, video) {
  fs.writeFileSync(
    filePath,
    `import type { VideoEntry } from '../../types';\n\nexport const video: VideoEntry = ${JSON.stringify(video, null, 2)};\n`
  );
}
