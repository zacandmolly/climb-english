// R12 Step 2 tests — verify the unified timeline semantics in src/lib/cue.ts.
//
// The regression pin (RETROSPECTIVE alignment drift) is that the course line
// (Lesson/PracticeSentence) and the video line (VideoEntry/SubtitleCue) each
// maintained their own "which cue is speaking" judgement, and behaved slightly
// differently in the gap between two cues. R12 unifies both onto `cueAtTime`.
//
// Pinned behaviour (matches the course line's documented intent):
//   1. t before the first cue's startTime → clamped to index 0 (pre-roll safe).
//   2. t inside a cue → that cue's index.
//   3. t in the gap between two cues → the PREVIOUS cue stays highlighted
//      (so a karaoke head doesn't flash the next sentence during a pause).
//   4. t past the last cue → clamped to the last index.
//   5. wordsInRange returns cues overlapping [start, end) in original order.
//
// Run with:  node --test tests/cue.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cueAtTime, wordsInRange } from '../src/lib/cue.ts';

const cues = [
  { startTime: 10, endTime: 12 },
  { startTime: 15, endTime: 18 },
  { startTime: 20, endTime: 24 },
];

test('t before the first cue clamps to index 0 (pre-roll safe)', () => {
  assert.equal(cueAtTime(cues, 0), 0);
  assert.equal(cueAtTime(cues, 9.9), 0);
});

test('t inside a cue returns that cue index', () => {
  assert.equal(cueAtTime(cues, 10), 0);
  assert.equal(cueAtTime(cues, 11.5), 0);
  assert.equal(cueAtTime(cues, 15.2), 1);
  assert.equal(cueAtTime(cues, 23), 2);
});

test('gap between two cues keeps the previous cue highlighted', () => {
  // t=14 sits between cue[0] (ends 12) and cue[1] (starts 15). The unified
  // semantics keep the previous sentence highlighted rather than flashing the
  // next one at the pause — so the karaoke head does not drift early.
  assert.equal(cueAtTime(cues, 14), 0);
  assert.equal(cueAtTime(cues, 19), 1);
});

test('t past the last cue clamps to the last index', () => {
  assert.equal(cueAtTime(cues, 30), 2);
  assert.equal(cueAtTime(cues, 9999), 2);
});

test('empty cue list returns 0 without throwing', () => {
  assert.equal(cueAtTime([], 10), 0);
});

test('wordsInRange returns overlapping cues in original order', () => {
  const result = wordsInRange(cues, 11, 16);
  assert.deepEqual(
    result.map((cue) => cue.startTime),
    [10, 15]
  );
});

test('wordsInRange excludes cues entirely outside the window', () => {
  const result = wordsInRange(cues, 13, 14);
  assert.deepEqual(result, []);
  // Window covering only the last cue.
  const onlyLast = wordsInRange(cues, 20, 24);
  assert.deepEqual(
    onlyLast.map((cue) => cue.startTime),
    [20]
  );
});
