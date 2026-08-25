// Issue #25: pure virtual-row mapping helpers. Dynamic measurement, distant
// scrolling and blank-window prevention are browser behaviors and therefore
// live in e2e/mobile-studio.spec.ts against the real React adapter and DOM.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  subtitleVirtualIndexForCue,
  subtitleVirtualRows,
} from '../src/lib/subtitleVirtualization.ts';

function cue(id, study = true) {
  return {
    id,
    startTime: 0,
    endTime: 1,
    en: `en ${id}`,
    zh: `zh ${id}`,
    score: 0,
    study,
    keywords: [],
  };
}

test('subtitleVirtualRows keeps all rows with original indices', () => {
  const cues = [cue('c001'), cue('c002', false), cue('c003')];
  const rows = subtitleVirtualRows(cues, 1, false);
  assert.deepEqual(
    rows.map((row) => [row.cue.id, row.originalIndex]),
    [
      ['c001', 0],
      ['c002', 1],
      ['c003', 2],
    ]
  );
});

test('study-only mode filters filler cues but always keeps the active cue', () => {
  const cues = [cue('c001'), cue('c002', false), cue('c003', false), cue('c004')];
  const activeFirst = subtitleVirtualRows(cues, 1, true);
  assert.deepEqual(
    activeFirst.map((row) => [row.cue.id, row.originalIndex]),
    [
      ['c001', 0],
      ['c002', 1],
      ['c004', 3],
    ]
  );

  const activeAfter = subtitleVirtualRows(cues, 3, true);
  assert.deepEqual(
    activeAfter.map((row) => [row.cue.id, row.originalIndex]),
    [
      ['c001', 0],
      ['c004', 3],
    ]
  );
});

test('subtitleVirtualIndexForCue maps original indices to virtual rows', () => {
  const cues = [cue('c001'), cue('c002', false), cue('c003', false), cue('c004')];
  const rows = subtitleVirtualRows(cues, 1, true);
  assert.equal(subtitleVirtualIndexForCue(rows, 1), 1);
  assert.equal(subtitleVirtualIndexForCue(rows, 3), 2);
  assert.equal(subtitleVirtualIndexForCue(rows, 2), -1);
  assert.equal(subtitleVirtualIndexForCue(rows, 0), 0);
  assert.equal(subtitleVirtualIndexForCue([], 0), -1);
});
