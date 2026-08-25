// Deterministic source-driven word timing (Issues #23/#29).
//
// Pinned behavior:
//   - tokens are normalized deterministically; ">>" becomes speaker metadata.
//   - a cue gets times only when its pronounced tokens appear in the source
//     word stream inside the documented ASR boundaries.
//   - shared cue boundaries are resolved by sequential claiming: adjacent
//     cues never consume the same source word occurrence.
//   - unmatched cues fail (return null / failures) instead of interpolating.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  backfillVideoCues,
  matchCueWords,
  speakerMarkersFromText,
  spreadSharedOffsets,
  tokenizeCueText,
  wordStartOffsetsFromTimedWords,
} from '../scripts/lib/word-times.mjs';

function stream(entries) {
  return entries.map(([time, raw]) => {
    const word = raw
      .toLowerCase()
      .replace(/[’]/g, "'")
      .replace(/^['"“”‘’.,!?;:()[\]–—-]+|['"“”‘’.,!?;:()[\]–—-]+$/g, '');
    return { time, raw, word };
  });
}

test('tokenizer normalizes words and marks ">>" as speaker tokens', () => {
  assert.deepEqual(
    tokenizeCueText(">> It's a test.").map(({ raw, norm, speaker }) => ({
      raw,
      norm,
      speaker,
    })),
    [
      { raw: '>>', norm: '>>', speaker: true },
      { raw: "It's", norm: "it's", speaker: false },
      { raw: 'a', norm: 'a', speaker: false },
      { raw: 'test.', norm: 'test', speaker: false },
    ]
  );
  assert.deepEqual(speakerMarkersFromText("so that's >> yep."), [2]);
});

test('exact source match produces relative integer-ms word times', () => {
  const words = stream([
    [10.1, 'hello'],
    [10.5, 'world'],
    [10.9, 'good.'],
  ]);
  const result = matchCueWords(words, { startTime: 10, endTime: 12, en: 'hello world good.' });
  assert.deepEqual(result.wordStartOffsetsMs, [100, 500, 900]);
  assert.deepEqual(result.source, {
    firstIndex: 0,
    lastIndex: 2,
    firstTime: 10.1,
    lastTime: 10.9,
  });
});

test('" >>" markers are skipped without corrupting the claimed source range', () => {
  const words = stream([
    [12.7, 'another'],
    [12.8, '>>'],
    [12.9, 'speaker'],
    [13.1, 'line.'],
  ]);
  const cue = { startTime: 12.5, endTime: 13.6, en: 'another >> speaker line.' };
  const result = matchCueWords(words, cue);
  assert.deepEqual(result.wordStartOffsetsMs, [200, 400, 600]);
  assert.deepEqual(speakerMarkersFromText(cue.en), [1]);
  assert.equal(result.source.firstIndex, 0);
  assert.equal(result.source.lastIndex, 3);
});

test('missing source words return null instead of fabricating times', () => {
  const words = stream([
    [10.1, 'hello'],
    [10.5, 'world'],
  ]);
  assert.equal(
    matchCueWords(words, { startTime: 10, endTime: 12, en: 'hello missing world' }),
    null
  );
});

test('first word beyond the ASR lookahead boundary is unreliable', () => {
  const words = stream([
    [13.2, 'hello'],
    [13.5, 'world'],
  ]);
  // startLookaheadSeconds = 3.0, so a first word at +3.2s must NOT match.
  assert.equal(matchCueWords(words, { startTime: 10, endTime: 15, en: 'hello world' }), null);
});

test('ambiguous candidates resolve deterministically to the closest cue start', () => {
  const words = stream([
    [10.1, 'hello'],
    [10.4, 'world'],
    [11.2, 'hello'],
    [11.5, 'world'],
  ]);
  const result = matchCueWords(words, { startTime: 10, endTime: 12, en: 'hello world' });
  assert.deepEqual(result.wordStartOffsetsMs, [100, 400]);
});

test('shared source timestamps are spread only inside the next real source gap', () => {
  assert.deepEqual(spreadSharedOffsets([100, 100, 500], 900), [100, 300, 500]);
  assert.deepEqual(spreadSharedOffsets([100, 100], 500), [100, 300]);
  assert.equal(spreadSharedOffsets([100, 100, 101], 500), null);

  const words = stream([
    [10.1, 'hello'],
    [10.1, 'there'],
    [10.5, 'world'],
  ]);
  const result = matchCueWords(words, {
    startTime: 10,
    endTime: 10.9,
    en: 'hello there world',
  });
  assert.deepEqual(result.wordStartOffsetsMs, [100, 300, 500]);
});

test('direct import timings use the same strict token and tie-spread contract', () => {
  const cue = { startTime: 10, endTime: 10.9, en: 'hello there world' };
  assert.deepEqual(
    wordStartOffsetsFromTimedWords(
      stream([
        [10.1, 'hello'],
        [10.1, 'there'],
        [10.5, 'world'],
      ]),
      cue
    ),
    [100, 300, 500]
  );
  assert.equal(wordStartOffsetsFromTimedWords(stream([[10.1, 'wrong']]), cue), null);
});

test('shared boundaries: sequential claiming gives each cue its own word', () => {
  const words = stream([
    [13.9, 'Yeah.'],
    [14.35, 'Yeah.'],
  ]);
  const first = matchCueWords(words, { startTime: 13.8, endTime: 14.3, en: 'Yeah.' });
  assert.deepEqual(first.wordStartOffsetsMs, [100]);

  const second = matchCueWords(
    words,
    { startTime: 14.2, endTime: 14.8, en: 'Yeah.' },
    first.source.lastIndex + 1
  );
  assert.deepEqual(second.wordStartOffsetsMs, [150]);
});

test('backfill reports failures and leaves unmatched cues at sentence level', () => {
  const cues = [
    { id: 'c001', startTime: 10, endTime: 12, en: 'hello world.' },
    { id: 'c002', startTime: 13, endTime: 15, en: 'this text has no source words at all' },
  ];
  const words = stream([
    [10.1, 'hello'],
    [10.4, 'world.'],
  ]);
  const { cues: backfilled, failures, stats } = backfillVideoCues(cues, words);
  assert.equal(stats.matched, 1);
  assert.equal(stats.failed, 1);
  assert.equal(failures[0].id, 'c002');
  assert.deepEqual(backfilled[0].wordStartOffsetsMs, [100, 400]);
  assert.equal(backfilled[1].wordStartOffsetsMs, undefined);
});
