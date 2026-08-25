#!/usr/bin/env node
// Backfill source-driven word timing (and structured speaker metadata) for the
// generated video decks (Issues #23/#29).
//
// Every cue must match the original auto-caption word stream reliably. Any
// unmatched cue fails the run before anything is written — word times are
// never interpolated or invented.
//
// Usage:
//   node scripts/backfill-word-times.mjs
//   node scripts/backfill-word-times.mjs --video <id> --vtt <file>
//   node scripts/backfill-word-times.mjs --dry-run

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSubtitleWords } from './lib/timed-words.mjs';
import { backfillVideoCues } from './lib/word-times.mjs';
import { readGeneratedVideo, writeGeneratedVideo } from './lib/generated-video.mjs';
import { readCaptionSource } from './lib/caption-source.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = process.env.CLIMB_WORDS_DATA_DIR
  ? path.resolve(process.env.CLIMB_WORDS_DATA_DIR)
  : path.join(ROOT, 'src/data/videos');
const VTT_DIR = path.join(ROOT, 'scripts/fixtures/vtt');

const DEFAULT_SOURCES = [
  {
    videoId: 'a-complete-guide-to-climbing-movement-and-technique-gtiggs-y2ny',
    vtt: path.join(VTT_DIR, 'gtIGgs_y2nY.en-orig.vtt.gz'),
  },
  { videoId: 'bern-2025-wb-rescut', vtt: path.join(VTT_DIR, 'CPhZ18zmrBs.en-orig.vtt.gz') },
  { videoId: 'innsbruck-2026-mb-full', vtt: path.join(VTT_DIR, 'LJFxLkPn_Vc.en-orig.vtt.gz') },
];

function parseArgs(argv) {
  const args = { videoId: null, vtt: null, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === '--dry-run') args.dryRun = true;
    else if (token === '--video') args.videoId = argv[++index];
    else if (token === '--vtt') args.vtt = argv[++index];
    else throw new Error(`Unknown option: ${token}`);
  }
  if (Boolean(args.videoId) !== Boolean(args.vtt)) {
    throw new Error('--video and --vtt must be provided together');
  }
  return args;
}

function backfillOne({ videoId, vtt }, { dryRun }) {
  const dataFile = path.join(DATA_DIR, `${videoId}.video.ts`);
  if (!fs.existsSync(dataFile)) throw new Error(`No video module found: ${dataFile}`);
  if (!fs.existsSync(vtt)) throw new Error(`No caption source found: ${vtt}`);

  const video = readGeneratedVideo(dataFile);
  const parsed = loadSubtitleWords(readCaptionSource(vtt));
  if (parsed.kind !== 'auto') {
    throw new Error(`${videoId}: caption source is not word-level auto captions (${parsed.kind})`);
  }

  const { cues, failures, stats } = backfillVideoCues(video.cues, parsed.words);
  console.log(
    `  ${videoId}: ${stats.matched}/${stats.cues} cues matched, ${stats.words} words from source`
  );
  if (failures.length > 0) {
    for (const failure of failures) {
      console.error(
        `✗ ${videoId} cue ${failure.id} [${failure.startTime}..${failure.endTime}] ` +
          `could not be matched reliably: ${failure.en.slice(0, 120)}`
      );
    }
    return { ok: false, failures };
  }
  if (!dryRun) {
    writeGeneratedVideo(dataFile, { ...video, cues });
    console.log(`  ✓ wrote ${path.relative(ROOT, dataFile)}`);
  } else {
    console.log('  (dry run, no files written)');
  }
  return { ok: true, failures: [] };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const sources = args.videoId ? [{ videoId: args.videoId, vtt: args.vtt }] : DEFAULT_SOURCES;

  let failed = 0;
  for (const source of sources) {
    const result = backfillOne(source, args);
    if (!result.ok) failed += result.failures.length;
  }
  if (failed > 0) {
    console.error(`\n✗ ${failed} cue(s) failed reliable matching; nothing fabricated.`);
    process.exitCode = 1;
  } else {
    console.log(`\n✓ word-time backfill complete (${args.dryRun ? 'dry run' : 'written'})`);
  }
}

main();
