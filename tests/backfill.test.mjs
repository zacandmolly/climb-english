// Regression tests for backfillFromReference (scripts/lib/translate.mjs).
//
// Issue #2: Case 2 reused a reference sentence's WHOLE zh whenever a cue was
// a *fragment* of that reference (cueCoverage >= 0.5), ignoring refCoverage.
// When the new segmenter split one reviewed sentence into 2–3 short cues,
// every fragment got the same long zh — neighbouring cards showing the same
// translation while the audio advances (Bern 664/670 cues flagged).
//
// Pinned behaviour:
//   1. A cue that covers most of the reference (both coverages high) reuses
//      its zh.
//   2. A fragment cue (cueCoverage high, refCoverage low) must NOT borrow the
//      whole zh — it stays needsTranslation so DeepSeek translates it on its
//      own.
//   3. A cue spanning several reviewed blocks joins their zh (Case 1).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { backfillFromReference } from '../scripts/lib/translate.mjs';

// One reviewed block: "this was the top of the slab. it was blocked."
const reference = [
  {
    startTime: 630,
    endTime: 640,
    en: 'this was the top of the slab it was blocked',
    zh: '这是板壁线路的顶部。那里被挡住了。',
    note: 'slab=板壁',
  },
];

test('cue covering most of the reference reuses its zh', () => {
  const sentences = [
    { startTime: 630, endTime: 640, text: 'this was the top of the slab it was blocked' },
  ];
  const result = backfillFromReference(sentences, reference);
  assert.equal(result[0].zh, '这是板壁线路的顶部。那里被挡住了。');
  assert.equal(result[0].needsTranslation, false);
  assert.equal(result[0].backfilled, true);
});

test('fragment cue does NOT borrow the whole reference zh', () => {
  // A long reviewed block, split by the new segmenter into fragments.
  const longRef = [
    {
      startTime: 630,
      endTime: 650,
      en: 'this was the top of the slab and it was blocked so most athletes did what Zelia did there peeled off',
      zh: '这是板壁线路的顶部，那里被挡住了，所以大多数运动员都像 Zelia 那样在那里脱落。',
      note: 'slab=板壁',
    },
  ];
  // The fragment is a small slice of the block: cueCoverage ~1.0 but
  // refCoverage ~0.3. Old Case 2 would reuse the whole zh; the fix must leave
  // it for machine translation.
  const sentences = [{ startTime: 630, endTime: 634, text: 'this was the top of the slab' }];
  const result = backfillFromReference(sentences, longRef);
  assert.equal(result[0].zh, '');
  assert.equal(result[0].needsTranslation, true);
  assert.equal(result[0].backfilled, undefined);
});

test('a very short fragment (one word) also stays needsTranslation', () => {
  const longRef = [
    {
      startTime: 630,
      endTime: 650,
      en: 'this was the top of the slab and it was blocked so most athletes did what Zelia did there',
      zh: '这是板壁线路的顶部，那里被挡住了，所以大多数运动员都像 Zelia 那样。',
      note: '',
    },
  ];
  const sentences = [{ startTime: 630, endTime: 631, text: 'this' }];
  const result = backfillFromReference(sentences, longRef);
  assert.equal(result[0].needsTranslation, true);
  assert.equal(result[0].zh, '');
});

test('Case 1 still joins zh when the cue spans several reviewed blocks', () => {
  const refs = [
    {
      startTime: 630,
      endTime: 635,
      en: 'this was the top of the slab',
      zh: '这是板壁线路的顶部。',
      note: '',
    },
    { startTime: 636, endTime: 640, en: 'it was blocked', zh: '那里被挡住了。', note: '' },
  ];
  const sentences = [
    { startTime: 630, endTime: 640, text: 'this was the top of the slab it was blocked' },
  ];
  const result = backfillFromReference(sentences, refs);
  assert.equal(result[0].zh, '这是板壁线路的顶部。 那里被挡住了。');
  assert.equal(result[0].needsTranslation, false);
});

test('partial overlap (~60%) does NOT reuse the whole reference zh', () => {
  // Mirrors Bern c003 vs lessons s01: 9/15 words shared, but each side has its
  // own extra words. The old 0.6 threshold copied the whole translation; the
  // near-match threshold (0.8) must leave it for machine translation.
  const refs = [
    {
      startTime: 630,
      endTime: 640,
      en: 'the top of the slab it was blocked most athletes did what Zelia did there peeled off',
      zh: '这是板壁线路的顶部。那里被挡住了。大多数运动员都像 Zelia 那样掉了下来。',
      note: '',
    },
  ];
  const sentences = [
    {
      startTime: 632,
      endTime: 638,
      text: 'and most athletes did what Zelia did there peeled off but Zillia was strong earlier on',
    },
  ];
  const result = backfillFromReference(sentences, refs);
  assert.equal(result[0].zh, '');
  assert.equal(result[0].needsTranslation, true);
  assert.equal(result[0].backfilled, undefined);
});
