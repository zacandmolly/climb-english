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
import {
  cueAtTime,
  patternsForEnglish,
  toCue,
  transcriptOfCues,
  translationOfCues,
  wordsInRange,
} from '../src/lib/cue.ts';

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

// ---------------------------------------------------------------------------
// toCue (R12 step4 data single-source bridge).
//
// Both the course line (PracticeSentence) and the video line (SubtitleCue) must
// produce the SAME canonical Cue view (id/startTime/endTime/en/zh) so that the
// timeline primitives cueAtTime/wordsInRange read through one source. This does
// NOT rewrite or delete any original field — it is a normalization view.
// ---------------------------------------------------------------------------

test('toCue maps a SubtitleCue onto the unified Cue view (identity on Cue fields)', () => {
  const cue = {
    id: 'c001',
    startTime: 10,
    endTime: 12,
    en: 'hello world',
    zh: '你好世界',
    note: 'note',
    score: 55,
    study: true,
    keywords: ['hello'],
  };
  const result = toCue(cue);
  assert.deepEqual(result, {
    id: 'c001',
    startTime: 10,
    endTime: 12,
    en: 'hello world',
    zh: '你好世界',
    note: 'note',
  });
});

test('toCue maps a PracticeSentence onto the unified Cue view (transcript→en, zhTranslation→zh)', () => {
  const sentence = {
    id: 's01',
    label: 'Top of the slab',
    startTime: 632.44,
    endTime: 636,
    transcript: 'The top of the slab.',
    zhTranslation: '这是板壁线路的顶部。',
    zhExplanation: 'explanation',
    keywords: [],
    sentencePatterns: [],
    speakingPrompt: 'ping',
  };
  const result = toCue(sentence);
  assert.deepEqual(result, {
    id: 's01',
    startTime: 632.44,
    endTime: 636,
    en: 'The top of the slab.',
    zh: '这是板壁线路的顶部。',
  });
  // The original curated fields are NOT present on the Cue view (they stay on
  // the PracticeSentence), so the source data is never lost.
  assert.equal('zhExplanation' in result, false);
});

test('toCue preserves id/startTime/endTime exactly for both sources', () => {
  const sentence = {
    id: 'd1-b06',
    label: 'block',
    startTime: 682,
    endTime: 707,
    transcript: 'text',
    zhTranslation: 'zh',
    zhExplanation: 'e',
    keywords: [],
    sentencePatterns: [],
    speakingPrompt: 'p',
  };
  const c = toCue(sentence);
  assert.equal(c.id, 'd1-b06');
  assert.equal(c.startTime, 682);
  assert.equal(c.endTime, 707);
});

// ---------------------------------------------------------------------------
// transcriptOfCues / translationOfCues (R12 step5 tool consolidation).
//
// The course line (PracticeSentence.transcript/zhTranslation) and the video line
// (SubtitleCue.en/zh) both aggregate text over a list of sentence/cue. These use
// the unified Cue view via toCue() so there is ONE "join the全段 text" primitive.
// ---------------------------------------------------------------------------

test('transcriptOfCues joins the en text of a Cue list with single spaces', () => {
  const cues = [
    { id: 'c1', startTime: 0, endTime: 1, en: 'hello', zh: '你好' },
    { id: 'c2', startTime: 1, endTime: 2, en: 'world', zh: '世界' },
  ];
  assert.equal(transcriptOfCues(cues), 'hello world');
});

test('translationOfCues joins the zh of a Cue list without separators', () => {
  const cues = [
    { id: 'c1', startTime: 0, endTime: 1, en: 'hello', zh: '你好' },
    { id: 'c2', startTime: 1, endTime: 2, en: 'world', zh: '世界' },
  ];
  assert.equal(translationOfCues(cues), '你好世界');
});

test('transcriptOfCues agrees with the lesson line fullTranscript semantics', () => {
  // A PracticeSentence with transcript → toCue().en → joined.
  const sentence = {
    id: 's01',
    label: 'label',
    startTime: 0,
    endTime: 1,
    transcript: 'The top of the slab.',
    zhTranslation: '这是板壁线路的顶部。',
    zhExplanation: 'e',
    keywords: [],
    sentencePatterns: [],
    speakingPrompt: 'p',
  };
  assert.equal(transcriptOfCues([toCue(sentence)]), 'The top of the slab.');
});

// ---------------------------------------------------------------------------
// patternsForEnglish (R12 step5 tool consolidation).
//
// The video line used a private patternsForCue() in BilingualStudio and the
// course generation script inlined the same rules. Now it is one primitive.
// ---------------------------------------------------------------------------

test('patternsForEnglish returns up to 3 matched patterns', () => {
  const patterns = patternsForEnglish(
    'You can see she has to trust the heel because the hold is small.'
  );
  assert.deepEqual(patterns, ['You can see...', 'She/He has to...', '..., because...']);
});

test('patternsForEnglish returns empty when nothing matches', () => {
  assert.deepEqual(patternsForEnglish('hold the crimp tightly'), []);
});
