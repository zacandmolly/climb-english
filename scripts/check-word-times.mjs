#!/usr/bin/env node
// Full-data word-time gate (Issues #23/#29).
//
// Three gates in one run:
//   1. HASH gate — protected cue content (id/startTime/endTime/en/zh/note/
//      score/study/highlight/needsTranslation/keywords) plus video-level
//      metadata and the course-mapping files must match the committed
//      baseline exactly. Only `wordStartOffsetsMs` may change.
//   2. TOKEN gate — every offset must correspond one-to-one with a pronounced
//      English token (speaker markers excluded); word text is never duplicated.
//   3. TIME gate — re-derive word times from the committed VTT sources with
//      the same deterministic matcher and require deep equality; stored
//      times must be monotonic and inside the documented ASR error bounds.
//
// Any cue that cannot be matched reliably is an error: word times are never
// interpolated, and cues without times would degrade to sentence level only
// as an explicit fallback for future non-auto material.
//
// Usage:
//   node scripts/check-word-times.mjs
//   node scripts/check-word-times.mjs --emit-baseline > scripts/word-time-baseline.json

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadSubtitleWords } from './lib/timed-words.mjs';
import { backfillVideoCues, WORD_MATCH, tokenizeCueText } from './lib/word-times.mjs';
import { readGeneratedVideo } from './lib/generated-video.mjs';
import { readCaptionSource } from './lib/caption-source.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.join(ROOT, 'src/data/videos');
export const VTT_DIR = path.join(ROOT, 'scripts/fixtures/vtt');
export const BASELINE_PATH = path.join(ROOT, 'scripts/word-time-baseline.json');
const COURSE_FILES = [
  'src/data/lessons.ts',
  'src/data/lessons.generated.ts',
  'src/data/lessons.manual.ts',
];

const VIDEO_SOURCES = [
  {
    videoId: 'a-complete-guide-to-climbing-movement-and-technique-gtiggs-y2ny',
    vtt: path.join(VTT_DIR, 'gtIGgs_y2nY.en-orig.vtt.gz'),
  },
  { videoId: 'bern-2025-wb-rescut', vtt: path.join(VTT_DIR, 'CPhZ18zmrBs.en-orig.vtt.gz') },
  { videoId: 'innsbruck-2026-mb-full', vtt: path.join(VTT_DIR, 'LJFxLkPn_Vc.en-orig.vtt.gz') },
];

const PROTECTED_VIDEO_FIELDS = [
  'id',
  'title',
  'sourceUrl',
  'sourceLabel',
  'youtubeId',
  'channel',
  'category',
  'categoryLabel',
  'level',
  'mediaUrl',
  'mediaStartTime',
  'previewMediaUrl',
  'previewStartTime',
  'previewDurationSeconds',
  'preferPreview',
  'durationSeconds',
  'captionKind',
  'importedAt',
  'cueCount',
  'studyCueCount',
  'needsTranslationCount',
];

const PROTECTED_CUE_FIELDS = [
  'id',
  'startTime',
  'endTime',
  'en',
  'zh',
  'note',
  'score',
  'study',
  'highlight',
  'needsTranslation',
  'keywords',
];

const MS = (seconds) => Math.round(seconds * 1000);

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical(value[key])])
    );
  }
  return value;
}

export function protectedVideoHash(video) {
  const protectedVideo = Object.fromEntries(
    PROTECTED_VIDEO_FIELDS.map((field) => [field, video[field]])
  );
  const protectedCues = (video.cues ?? []).map((cue) =>
    Object.fromEntries(PROTECTED_CUE_FIELDS.map((field) => [field, cue[field]]))
  );
  return sha256(JSON.stringify(canonical({ video: protectedVideo, cues: protectedCues })));
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function loadBaseline(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function validateWordOffsets(cue, errors, label) {
  const tokens = tokenizeCueText(cue.en);
  const pronouncedNorms = tokens
    .filter((token) => !token.speaker && token.norm)
    .map((token) => token.norm);
  const offsets = cue.wordStartOffsetsMs ?? [];

  if (offsets.length === 0) {
    errors.push(`${label}: cue has no word times (sentence-level degradation is not allowed here)`);
    return;
  }
  if (pronouncedNorms.length !== offsets.length) {
    errors.push(
      `${label}: ${offsets.length} stored offsets but ${pronouncedNorms.length} pronounced en tokens`
    );
    return;
  }

  const durationMs = (cue.endTime - cue.startTime) * 1000;
  const minFirstMs = -MS(WORD_MATCH.startToleranceSeconds);
  const maxLastMs = durationMs + MS(WORD_MATCH.endToleranceSeconds);
  const maxFirstMs = MS(WORD_MATCH.startLookaheadSeconds);

  let previous = -Infinity;
  offsets.forEach((offset, index) => {
    if (!Number.isInteger(offset)) {
      errors.push(`${label}: wordStartOffsetsMs[${index}] is not an integer ms value`);
    } else {
      if (offset <= previous) {
        errors.push(`${label}: word times not strictly increasing at index ${index}`);
      }
      previous = offset;
      if (index === 0 && (offset < minFirstMs || offset > maxFirstMs)) {
        errors.push(
          `${label}: first word offset=${offset} outside ASR start boundary [${minFirstMs}, ${maxFirstMs}]`
        );
      }
      if (index === offsets.length - 1 && offset > maxLastMs) {
        errors.push(`${label}: last word offset=${offset} beyond ASR end boundary ${maxLastMs}`);
      }
    }
  });

  if ('speaker' in cue) {
    errors.push(`${label}: speaker metadata duplicates a boundary already derivable from cue.en`);
  }
  if ('words' in cue) {
    errors.push(`${label}: words duplicates text already derivable from cue.en`);
  }
}

export function checkVideo({ videoId, vtt }, baseline, dataDir = DATA_DIR) {
  const errors = [];
  const video = readGeneratedVideo(path.join(dataDir, `${videoId}.video.ts`));

  // 1. Hash gate.
  const protectedHash = protectedVideoHash(video);
  const baselineHash = baseline?.videos?.[videoId]?.protectedSha256;
  if (!baselineHash) {
    errors.push(`${videoId}: no baseline hash recorded`);
  } else if (protectedHash !== baselineHash) {
    errors.push(
      `${videoId}: protected cue/metadata content hash changed (${baselineHash.slice(0, 12)} → ${protectedHash.slice(0, 12)})`
    );
  }
  const baselineVtt = baseline?.videos?.[videoId]?.vttSha256;
  const vttText = readCaptionSource(vtt);
  const vttHash = sha256(vttText);
  if (baselineVtt && baselineVtt !== vttHash) {
    errors.push(
      `${videoId}: caption source fixture changed (${baselineVtt.slice(0, 12)} → ${vttHash.slice(0, 12)})`
    );
  }

  // 2 + 3. Token/time gates plus source re-derivation.
  const parsed = loadSubtitleWords(vttText);
  if (parsed.kind !== 'auto')
    errors.push(`${videoId}: caption source is not word-level auto captions`);
  const derived = backfillVideoCues(video.cues, parsed.words);
  if (derived.failures.length > 0) {
    for (const failure of derived.failures) {
      errors.push(`${videoId}: cue ${failure.id} cannot be matched reliably from source`);
    }
  }

  video.cues.forEach((cue, index) => {
    const label = `${videoId} ${cue.id}`;
    validateWordOffsets(cue, errors, label);
    const expected = derived.cues[index];
    if (
      JSON.stringify(cue.wordStartOffsetsMs ?? null) !==
      JSON.stringify(expected.wordStartOffsetsMs ?? null)
    ) {
      errors.push(`${label}: stored word offsets differ from source re-derivation`);
    }
  });

  const speakerCues = video.cues.filter((cue) =>
    tokenizeCueText(cue.en).some((token) => token.speaker)
  ).length;
  return {
    errors,
    stats: {
      videoId,
      cues: video.cues.length,
      words: video.cues.reduce((sum, cue) => sum + (cue.wordStartOffsetsMs?.length ?? 0), 0),
      speakerCues,
      protectedHash,
      vttHash,
    },
  };
}

export function courseMappingHashes(root = ROOT) {
  const hashes = {};
  for (const file of COURSE_FILES) {
    const absolute = path.join(root, file);
    if (!fs.existsSync(absolute)) throw new Error(`Missing course mapping file: ${file}`);
    hashes[file] = fileSha256(absolute);
  }
  return hashes;
}

export function runWordTimeGate({
  dataDir = DATA_DIR,
  vttDir = VTT_DIR,
  baselinePath = BASELINE_PATH,
  emitBaseline = false,
} = {}) {
  const baseline = emitBaseline ? null : loadBaseline(baselinePath);
  const errors = [];
  const stats = [];

  for (const source of VIDEO_SOURCES) {
    const result = checkVideo(
      { ...source, vtt: source.vtt.replace(VTT_DIR, vttDir) },
      baseline,
      dataDir
    );
    errors.push(...result.errors);
    stats.push(result.stats);
    const { videoId, cues, words, speakerCues } = result.stats;
    const line =
      `  ${videoId}: ${cues} cues, ${words} words, ${speakerCues} speaker-marker cues, ` +
      `hash=${result.stats.protectedHash.slice(0, 12)}`;
    if (emitBaseline) console.error(line);
    else console.log(line);
  }

  if (baseline) {
    const mapping = courseMappingHashes();
    for (const file of COURSE_FILES) {
      if (baseline.courseMapping?.[file] !== mapping[file]) {
        errors.push(`course mapping content changed: ${file}`);
      }
    }
  }

  if (emitBaseline) {
    const baselinePayload = {
      generated: new Date().toLocaleDateString('en-CA'),
      videos: Object.fromEntries(
        stats.map((entry) => [
          entry.videoId,
          { protectedSha256: entry.protectedHash, vttSha256: entry.vttHash },
        ])
      ),
      courseMapping: courseMappingHashes(),
    };
    process.stdout.write(`${JSON.stringify(baselinePayload, null, 2)}\n`);
    return { errors: [], stats };
  }

  for (const error of errors) console.error(`✗ ${error}`);
  if (errors.length > 0) {
    console.error(`\n✗ word-time gate failed with ${errors.length} error(s)`);
    process.exitCode = 1;
  } else {
    console.log('\n✓ word-time gate passed: hash + token + time + source re-derivation');
  }
  return { errors, stats };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  runWordTimeGate({ emitBaseline: process.argv.includes('--emit-baseline') });
}
