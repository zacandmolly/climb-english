// Regression tests for scripts/lib/translate.mjs batch alignment.
//
// Root cause of the production bug: when DeepSeek drops an item, reuses an
// index from a previous batch, or returns rows out of order, the original
// fallback `items[index]` silently rewrites the wrong cue — keeping the
// original count, but shifting zh/note columns. These tests pin the
// invariants the fixer relies on:
//   1. Every output element corresponds 1:1 to its input sentence by INDEX.
//   2. Rows whose `i` is missing or non-numeric get `needsTranslation: true`,
//      not a borrowed translation.
//   3. Rows whose length exceeds the input batch are ignored.
//   4. Coverage warnings surface loudly so the import pipeline can stop.
//
// Run with:  node --test tests/translate.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignTranslationResponse, pickTranslationForIndex } from '../scripts/lib/translate.mjs';

test('all 24 items present with matching i → returns full translations in order', () => {
  const batch = range(24).map((i) => ({ text: `en-${i}` }));
  const items = range(24).map((i) => ({ i, zh: `zh-${i}`, tip: `tip-${i}` }));
  const result = alignTranslationResponse(items, batch);
  assert.equal(result.length, 24);
  for (let i = 0; i < 24; i += 1) {
    assert.equal(result[i].zh, `zh-${i}`);
    assert.equal(result[i].note, `tip-${i}`);
    assert.equal(result[i].needsTranslation, false);
  }
});

test('Dropped item (DeepSeek skips i=5) → missing row gets needsTranslation, NOT a borrowed row', () => {
  // 24 input sentences, LLM returns 23 items, indices 0–4 and 6–23, missing i=5.
  // Old fallback would silently substitute items[5] (which is actually i=6)
  // onto sentence 5, producing +1 drift on every following row.
  const batch = range(24).map((i) => ({ text: `en-${i}` }));
  const items = [];
  for (let i = 0; i < 24; i += 1) {
    if (i === 5) continue;
    items.push({ i, zh: `zh-${i}`, tip: `tip-${i}` });
  }
  const result = alignTranslationResponse(items, batch);
  assert.equal(result.length, 24);

  // Index 5 must be the missing one — flagged, NOT filled from a neighbour.
  assert.equal(result[5].zh, '');
  assert.equal(result[5].needsTranslation, true);
  assert.equal(result[5].note, '');

  // Index 6 must keep its own translation, not the value originally at items[5].
  assert.equal(result[6].zh, 'zh-6');
});

test('LLM uses 1-based indices → only the row with no matching i is flagged', () => {
  // Four-row batch. LLM returns i=1..4 (off-by-one). Only index 0 has no
  // matching key, so the other three must keep their translations — the old
  // fallback would have stolen items[0] (which is i=1) onto sentence 0 and
  // shifted the rest, but the new picker refuses to guess.
  const batch = range(4).map((i) => ({ text: `en-${i}` }));
  const items = [
    { i: 1, zh: 'one', tip: 't1' },
    { i: 2, zh: 'two', tip: 't2' },
    { i: 3, zh: 'three', tip: 't3' },
    { i: 4, zh: 'four', tip: 't4' },
  ];
  const result = alignTranslationResponse(items, batch);
  assert.equal(result[0].zh, '');
  assert.equal(result[0].needsTranslation, true);
  assert.equal(result[1].zh, 'one');
  assert.equal(result[1].needsTranslation, false);
  assert.equal(result[2].zh, 'two');
  assert.equal(result[3].zh, 'three');
});

test('Extra item beyond batch length → ignored, batch output still 24 long', () => {
  const batch = range(3).map((i) => ({ text: `en-${i}` }));
  const items = [
    { i: 0, zh: 'a', tip: 'ta' },
    { i: 1, zh: 'b', tip: 'tb' },
    { i: 2, zh: 'c', tip: 'tc' },
    { i: 99, zh: 'spillover', tip: 'tz' }, // off-by-one from a previous batch
  ];
  const result = alignTranslationResponse(items, batch);
  assert.equal(result.length, 3);
  assert.equal(result[0].zh, 'a');
  assert.equal(result[1].zh, 'b');
  assert.equal(result[2].zh, 'c');
});

test('Non-numeric i → ignored, no drift', () => {
  const batch = range(3).map((i) => ({ text: `en-${i}` }));
  const items = [
    { i: 0, zh: 'a', tip: 'ta' },
    { i: 'one', zh: 'should-not-leak', tip: 'tx' },
    { i: 2, zh: 'c', tip: 'tc' },
  ];
  const result = alignTranslationResponse(items, batch);
  assert.equal(result[0].zh, 'a');
  assert.equal(result[1].zh, '');
  assert.equal(result[1].needsTranslation, true);
  assert.equal(result[2].zh, 'c');
});

test('pickTranslationForIndex returns the row whose i matches exactly', () => {
  const items = [{ i: 0 }, { i: 1 }, { i: 2 }];
  assert.deepEqual(pickTranslationForIndex(items, 1), { i: 1 });
  assert.equal(pickTranslationForIndex(items, 99), null);
  // String `i` is NOT a match — only numeric exact match counts.
  const onlyStringI = [{ i: '1' }, { i: '2' }];
  assert.equal(pickTranslationForIndex(onlyStringI, 1), null);
});

function range(n) {
  return Array.from({ length: n }, (_, i) => i);
}
