// Full-data word-time gate integration (Issues #23/#29).
//
// Runs the real pipeline on a small committed fixture:
//   fixture.en.vtt   — word-level auto captions (source of truth)
//   fixture.video.ts — pre-backfill video deck
//
// Pinned behavior:
//   - backfill must attach source-derived offsets while keeping speaker markers non-pronounced;
//   - the hash/token/time gate passes only when the backfilled deck is
//     byte-consistent with a source re-derivation;
//   - protected content edits, timing tampering, or missing offsets fail loudly.

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { loadSubtitleWords } from '../scripts/lib/timed-words.mjs';
import { backfillVideoCues } from '../scripts/lib/word-times.mjs';
import {
  readGeneratedVideo,
  stringifyGeneratedVideo,
  writeGeneratedVideo,
} from '../scripts/lib/generated-video.mjs';
import {
  checkVideo,
  courseMappingHashes,
  protectedVideoHash,
  ROOT,
} from '../scripts/check-word-times.mjs';

const FIXTURE_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/word-times');
const FIXTURE_VTT = path.join(FIXTURE_DIR, 'fixture.en.vtt');
const FIXTURE_VIDEO = path.join(FIXTURE_DIR, 'fixture.video.ts');
const CLI = path.join(ROOT, 'scripts/backfill-word-times.mjs');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function fileSha256(filePath) {
  return sha256(fs.readFileSync(filePath));
}

function fixtureVideo() {
  return readGeneratedVideo(FIXTURE_VIDEO);
}

function makeTempVideo(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'word-times-gate-'));
  const source = fixtureVideo();
  const parsed = loadSubtitleWords(fs.readFileSync(FIXTURE_VTT, 'utf8'));
  const { cues } = backfillVideoCues(source.cues, parsed.words);
  const video = { ...source, cues, ...overrides };
  writeGeneratedVideo(path.join(dir, 'fixture.video.ts'), video);
  return { dir, video };
}

function fixtureBaseline(video) {
  return {
    videos: {
      fixture: {
        protectedSha256: protectedVideoHash(video),
        vttSha256: fileSha256(FIXTURE_VTT),
      },
    },
    courseMapping: courseMappingHashes(),
  };
}

test('fixture parses as auto captions and backfills every cue from source', () => {
  const parsed = loadSubtitleWords(fs.readFileSync(FIXTURE_VTT, 'utf8'));
  assert.equal(parsed.kind, 'auto');
  const video = fixtureVideo();
  const { cues, failures, stats } = backfillVideoCues(video.cues, parsed.words);
  assert.equal(failures.length, 0);
  assert.equal(stats.matched, 4);
  assert.deepEqual(cues[0].wordStartOffsetsMs, [100, 500, 900]);
  assert.equal(cues[1].speaker, undefined);
  // Shared boundary: the two "Yeah." cues each own a distinct source word.
  assert.deepEqual(cues[2].wordStartOffsetsMs, [100]);
  assert.deepEqual(cues[3].wordStartOffsetsMs, [150]);
});

test('CLI backfill writes the deck through the real pipeline', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'word-times-cli-'));
  fs.copyFileSync(FIXTURE_VIDEO, path.join(dir, 'fixture.video.ts'));
  const before = fs.readFileSync(path.join(dir, 'fixture.video.ts'), 'utf8');
  execFileSync(process.execPath, [CLI, '--video', 'fixture', '--vtt', FIXTURE_VTT], {
    env: { ...process.env, CLIMB_WORDS_DATA_DIR: dir },
    encoding: 'utf8',
  });
  const after = fs.readFileSync(path.join(dir, 'fixture.video.ts'), 'utf8');
  assert.notEqual(after, before);
  assert.match(after, /"wordStartOffsetsMs": \[100,500,900\]/);
  assert.doesNotMatch(after, /"speaker":/);
});

test('CLI fails loudly and writes nothing when a cue cannot be matched', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'word-times-cli-fail-'));
  const video = fixtureVideo();
  video.cues[0].en = 'zzz completely different text';
  writeGeneratedVideo(path.join(dir, 'fixture.video.ts'), video);
  const before = fs.readFileSync(path.join(dir, 'fixture.video.ts'), 'utf8');
  let threw = false;
  try {
    execFileSync(process.execPath, [CLI, '--video', 'fixture', '--vtt', FIXTURE_VTT], {
      env: { ...process.env, CLIMB_WORDS_DATA_DIR: dir },
      encoding: 'utf8',
    });
  } catch {
    threw = true;
  }
  assert.equal(threw, true);
  assert.equal(fs.readFileSync(path.join(dir, 'fixture.video.ts'), 'utf8'), before);
});

test('hash + token + time gate passes for the backfilled fixture', () => {
  const { dir, video } = makeTempVideo();
  const result = checkVideo({ videoId: 'fixture', vtt: FIXTURE_VTT }, fixtureBaseline(video), dir);
  assert.deepEqual(result.errors, []);
});

test('protected content edits fail the hash gate', () => {
  const { dir, video } = makeTempVideo();
  const baseline = fixtureBaseline(video);
  video.cues[0].zh = '被篡改的翻译。';
  writeGeneratedVideo(path.join(dir, 'fixture.video.ts'), video);
  const result = checkVideo({ videoId: 'fixture', vtt: FIXTURE_VTT }, baseline, dir);
  assert.match(result.errors.join('\n'), /protected cue\/metadata content hash changed/);
});

test('fabricated word times fail the source re-derivation gate', () => {
  const { dir, video } = makeTempVideo();
  video.cues[0].wordStartOffsetsMs = [0, 1000, 2000];
  writeGeneratedVideo(path.join(dir, 'fixture.video.ts'), video);
  const result = checkVideo({ videoId: 'fixture', vtt: FIXTURE_VTT }, fixtureBaseline(video), dir);
  assert.match(result.errors.join('\n'), /stored word offsets differ from source re-derivation/);
});

test('missing word times fail the gate for auto-caption decks', () => {
  const { dir, video } = makeTempVideo();
  delete video.cues[0].wordStartOffsetsMs;
  writeGeneratedVideo(path.join(dir, 'fixture.video.ts'), video);
  const result = checkVideo({ videoId: 'fixture', vtt: FIXTURE_VTT }, fixtureBaseline(video), dir);
  assert.match(result.errors.join('\n'), /cue has no word times/);
});

test('legacy duplicate words fail the compact schema gate', () => {
  const { dir, video } = makeTempVideo();
  video.cues[0].words = ['hello', 'world', 'good'];
  writeGeneratedVideo(path.join(dir, 'fixture.video.ts'), video);
  const result = checkVideo({ videoId: 'fixture', vtt: FIXTURE_VTT }, fixtureBaseline(video), dir);
  assert.match(result.errors.join('\n'), /words duplicates text/);
});

test('generated serializer rejects empty word timing arrays', () => {
  assert.throws(
    () => stringifyGeneratedVideo({ cues: [{ wordStartOffsetsMs: [] }] }),
    /must not be an empty array/
  );
});
