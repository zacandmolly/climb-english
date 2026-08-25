// Pure frontend word-karaoke primitives (Issues #23/#29).
//
// Pinned behavior: state is a pure function of media time, so pause freezes
// (no time updates), seeks re-sync on the next timeupdate, and 0.75x/loop/
// continuous playback all stay consistent without player-specific code.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  activeWordIndex,
  displayText,
  speakerWordBoundaries,
  spokenWords,
  wordKaraokeStates,
} from '../src/lib/words.ts';

const offsets = [100, 500, 900];

test('activeWordIndex is -1 before the first word and advances with elapsed time', () => {
  assert.equal(activeWordIndex(offsets, 0), -1);
  assert.equal(activeWordIndex(offsets, 0.09), -1);
  assert.equal(activeWordIndex(offsets, 0.1), 0);
  assert.equal(activeWordIndex(offsets, 0.499), 0);
  assert.equal(activeWordIndex(offsets, 0.5), 1);
  assert.equal(activeWordIndex(offsets, 0.9), 2);
  assert.equal(activeWordIndex(offsets, 5), 2);
});

test('activeWordIndex handles empty timing as sentence-level (-1)', () => {
  assert.equal(activeWordIndex([], 1), -1);
});

test('wordKaraokeStates renders past/current/future states', () => {
  assert.deepEqual(wordKaraokeStates(offsets, 0.05), ['future', 'future', 'future']);
  assert.deepEqual(wordKaraokeStates(offsets, 0.1), ['current', 'future', 'future']);
  assert.deepEqual(wordKaraokeStates(offsets, 0.6), ['past', 'current', 'future']);
  // The last word stays "current" once reached, until the cue ends.
  assert.deepEqual(wordKaraokeStates(offsets, 5), ['past', 'past', 'current']);
});

test('displayText removes raw speaker markers from customer-facing text', () => {
  assert.equal(displayText('>> Wonderful.'), 'Wonderful.');
  assert.equal(displayText("So that's >> Yep."), "So that's Yep.");
  assert.equal(displayText('>> 非常棒。'), '非常棒。');
  assert.equal(displayText('>> >> Double.'), 'Double.');
});

test('spokenWords derives display text from cue.en without storing duplicate strings', () => {
  assert.deepEqual(spokenWords(">> It's a test."), ["It's", 'a', 'test.']);
  assert.deepEqual(spokenWords('hello — world [ ]'), ['hello', 'world']);
});

test('speakerWordBoundaries maps en token positions to word boundaries', () => {
  // "so that's >> yep." → token 2 is the marker, which sits before word index 2.
  assert.deepEqual(speakerWordBoundaries("so that's >> yep."), [2]);
  // Leading marker sits before word 0.
  assert.deepEqual(speakerWordBoundaries('>> hello world.'), [0]);
  assert.deepEqual(speakerWordBoundaries('hello world.'), []);
});
