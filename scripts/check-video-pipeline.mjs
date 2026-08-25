#!/usr/bin/env node

// Hard gate for generated video material. It validates three layers together:
//   1. cue/translation/timeline integrity in every *.video.ts module;
//   2. registry summaries/loaders staying in sync with those modules;
//   3. a usable playback source in deployments.
//
// A local mp4 is deployable only when Git tracks it. Large imports such as the
// 138-minute Innsbruck final intentionally remain local, so they must retain a
// YouTube id for CueMediaPlayer's timeline-preserving fallback.

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'src/data/videos');
const INDEX_PATH = path.join(DATA_DIR, 'index.ts');
const MAX_GITHUB_BLOB_BYTES = 100 * 1024 * 1024;
const TIMELINE_TOLERANCE_SECONDS = 1;

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = checkVideoPipeline();
  for (const line of result.lines) console.log(line);
  if (result.errors.length > 0) {
    for (const error of result.errors) console.error(`✗ ${error}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ ${result.videos.length} video materials passed cue + registry + playback gates`);
  }
}

export function checkVideoPipeline() {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.endsWith('.video.ts'))
    .sort();
  const videos = files.map((file) => ({
    file,
    video: readGeneratedVideo(path.join(DATA_DIR, file)),
  }));
  const errors = [];
  const lines = [];

  for (const { file, video } of videos) {
    errors.push(...validateVideoRecord(video, file));
    const media = classifyMedia(video);
    errors.push(...media.errors.map((error) => `${file}: ${error}`));
    lines.push(
      `  ${video.id}: ${video.cueCount} cues, ${video.studyCueCount} study, media=${media.mode}`
    );
  }

  errors.push(...validateRegistry(videos));
  return { errors, lines, videos };
}

export function validateVideoRecord(video, label = video?.id ?? 'video') {
  const errors = [];
  const cues = Array.isArray(video?.cues) ? video.cues : [];
  if (!video || typeof video !== 'object') return [`${label}: generated payload is not an object`];
  if (!video.id) errors.push(`${label}: id is required`);
  if (!/^[A-Za-z0-9_-]{11}$/.test(String(video.youtubeId ?? ''))) {
    errors.push(`${label}: youtubeId must be an 11-character YouTube id for media fallback`);
  }
  if (cues.length === 0) errors.push(`${label}: at least one cue is required`);
  if (video.cueCount !== cues.length) {
    errors.push(`${label}: cueCount=${video.cueCount} but found ${cues.length} cues`);
  }

  const clipStart = Number(video.mediaStartTime);
  const duration = Number(video.durationSeconds);
  if (!Number.isFinite(clipStart) || clipStart < 0) {
    errors.push(`${label}: mediaStartTime must be a finite non-negative number`);
  }
  if (!Number.isFinite(duration) || duration <= 0) {
    errors.push(`${label}: durationSeconds must be a finite positive number`);
  }

  const studyCount = cues.filter((cue) => cue.study).length;
  if (video.studyCueCount !== studyCount) {
    errors.push(`${label}: studyCueCount=${video.studyCueCount} but found ${studyCount}`);
  }
  const missingTranslations = cues.filter(
    (cue) => cue.needsTranslation || !String(cue.zh ?? '').trim()
  ).length;
  if ((video.needsTranslationCount ?? missingTranslations) !== missingTranslations) {
    errors.push(
      `${label}: needsTranslationCount=${video.needsTranslationCount} but found ${missingTranslations}`
    );
  }
  if (missingTranslations > 0) {
    errors.push(`${label}: ${missingTranslations} cues still need translation`);
  }

  const seenIds = new Set();
  for (let index = 0; index < cues.length; index += 1) {
    const cue = cues[index];
    const prefix = `${label}: cue[${index}]`;
    if (!cue.id || seenIds.has(cue.id)) errors.push(`${prefix} has a missing or duplicate id`);
    seenIds.add(cue.id);
    if (!Number.isFinite(cue.startTime) || !Number.isFinite(cue.endTime)) {
      errors.push(`${prefix} has a non-finite timestamp`);
      continue;
    }
    if (cue.endTime <= cue.startTime) errors.push(`${prefix} must end after it starts`);
    if (index > 0 && cue.startTime < cues[index - 1].startTime) {
      errors.push(`${prefix} starts before the preceding cue`);
    }
    if (!String(cue.en ?? '').trim()) errors.push(`${prefix} has no English transcript`);
  }

  if (cues.length > 0 && Number.isFinite(clipStart) && Number.isFinite(duration)) {
    const clipEnd = clipStart + duration;
    if (cues[0].startTime < clipStart - TIMELINE_TOLERANCE_SECONDS) {
      errors.push(`${label}: first cue starts before the declared media window`);
    }
    if (cues.at(-1).endTime > clipEnd + TIMELINE_TOLERANCE_SECONDS) {
      errors.push(`${label}: last cue ends after the declared media window`);
    }
  }
  return errors;
}

export function classifyMedia(video) {
  const errors = [];
  const youtubeId = String(video.youtubeId ?? '').trim();
  const mediaUrl = String(video.mediaUrl ?? '').trim();
  if (!mediaUrl) {
    if (!youtubeId) errors.push('neither mediaUrl nor youtubeId is available');
    return { mode: youtubeId ? 'youtube' : 'unavailable', errors };
  }

  if (!mediaUrl.startsWith('/media/')) {
    return { mode: 'remote', errors };
  }

  if (!/^\/media\/[A-Za-z0-9._-]+\.mp4$/.test(mediaUrl)) {
    errors.push(`unsafe or unsupported local media path: ${mediaUrl}`);
    return { mode: 'unavailable', errors };
  }

  const relativePath = path.posix.join('public', mediaUrl.replace(/^\//, ''));
  const absolutePath = path.join(ROOT, relativePath);
  const exists = fs.existsSync(absolutePath);
  const tracked = isGitTracked(relativePath);

  if (exists) errors.push(...validateMp4(absolutePath));
  if (exists && tracked) {
    const size = fs.statSync(absolutePath).size;
    if (size >= MAX_GITHUB_BLOB_BYTES) {
      errors.push(`tracked media exceeds GitHub's 100 MiB blob limit (${relativePath})`);
    }
    return { mode: 'local-deployed', errors };
  }

  if (!youtubeId) {
    errors.push(
      `${relativePath} is ${exists ? 'not Git-tracked' : 'missing'} and no YouTube fallback exists`
    );
    return { mode: 'unavailable', errors };
  }
  return { mode: exists ? 'youtube-fallback (local-only mp4)' : 'youtube-fallback', errors };
}

function validateRegistry(videos) {
  const errors = [];
  const text = fs.readFileSync(INDEX_PATH, 'utf8');
  const summaryMatch = text.match(/videoSummaries:\s*VideoSummary\[\]\s*=\s*(\[[\s\S]*?\]);/);
  if (!summaryMatch) return ['videos/index.ts: could not parse videoSummaries'];

  let summaries;
  try {
    summaries = JSON.parse(summaryMatch[1]);
  } catch (error) {
    return [`videos/index.ts: invalid summary JSON (${error.message})`];
  }
  const loaderIds = new Set(
    Array.from(text.matchAll(/^\s*'([^']+)'\s*:\s*\(\)\s*=>\s*import\(/gm), (match) => match[1])
  );
  const summaryById = new Map(summaries.map((summary) => [summary.id, summary]));

  for (const { file, video } of videos) {
    if (!loaderIds.has(video.id)) errors.push(`videos/index.ts: missing loader for ${video.id}`);
    const { cues: _cues, ...expectedSummary } = video;
    const actualSummary = summaryById.get(video.id);
    if (!actualSummary) {
      errors.push(`videos/index.ts: missing summary for ${video.id}`);
    } else if (JSON.stringify(actualSummary) !== JSON.stringify(expectedSummary)) {
      errors.push(`videos/index.ts: stale summary for ${video.id}; rerun writeRegistry`);
    }
    if (!file.startsWith(`${video.id}.`)) {
      errors.push(`${file}: filename must match generated video id ${video.id}`);
    }
  }

  if (loaderIds.size !== videos.length || summaries.length !== videos.length) {
    errors.push(
      `videos/index.ts: expected ${videos.length} loaders/summaries, found ${loaderIds.size}/${summaries.length}`
    );
  }
  return errors;
}

function validateMp4(file) {
  const errors = [];
  const stat = fs.statSync(file);
  if (stat.size === 0) return [`${path.relative(ROOT, file)} is empty`];
  const sampleSize = Math.min(stat.size, 16 * 1024 * 1024);
  const descriptor = fs.openSync(file, 'r');
  const sample = Buffer.allocUnsafe(sampleSize);
  try {
    fs.readSync(descriptor, sample, 0, sampleSize, 0);
  } finally {
    fs.closeSync(descriptor);
  }
  const ftyp = sample.indexOf('ftyp');
  const moov = sample.indexOf('moov');
  const mdat = sample.indexOf('mdat');
  const avc1 = sample.indexOf('avc1');
  const mp4a = sample.indexOf('mp4a');
  if (ftyp < 0 || moov < 0 || mdat < 0) {
    errors.push(`${path.relative(ROOT, file)} is missing ftyp/moov/mdat in its first 16 MiB`);
  } else if (moov > mdat) {
    errors.push(`${path.relative(ROOT, file)} is not faststart (moov appears after mdat)`);
  }
  if (avc1 < 0 || mp4a < 0) {
    errors.push(`${path.relative(ROOT, file)} must contain browser-safe H.264 video + AAC audio`);
  }
  return errors;
}

function isGitTracked(relativePath) {
  const result = spawnSync('git', ['ls-files', '--error-unmatch', '--', relativePath], {
    cwd: ROOT,
    stdio: 'ignore',
  });
  return result.status === 0;
}

function readGeneratedVideo(file) {
  const text = fs.readFileSync(file, 'utf8');
  const match = text.match(/=\s*(\{[\s\S]*\})\s*;?\s*$/);
  if (!match) throw new Error(`Could not parse generated video: ${file}`);
  return JSON.parse(match[1]);
}
