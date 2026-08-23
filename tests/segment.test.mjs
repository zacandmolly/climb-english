// Regression tests for scripts/lib/segment.mjs sentence segmentation.
//
// The production bug (Issue #3): maxGapSeconds=0.7 closed a sentence on any
// mid-sentence pause, producing 1–6 word fragments ("power and strength to a",
// "get the last few", "hold From Below"). Those fragments survive because
// mergeFragments only merges < minWords (3). The LLM then merges them during
// translation, shifting its own index assignment — visible as neighbouring
// cues sharing the same zh.
//
// These tests pin the tuned behaviour:
//   1. A mid-sentence pause under maxGapSeconds (1.5s) does NOT split.
//   2. Sentence-ending punctuation still closes a sentence.
//   3. A pause longer than maxGapSeconds DOES split (real sentence boundary).
//   4. A short fragment with no punctuation merges into its neighbour.
//
// Run with:  node --test tests/segment.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { segmentWords } from '../scripts/lib/segment.mjs';

function w(time, text) {
  return { time, word: text.toLowerCase(), raw: text };
}

test('mid-sentence pause under 1.5s does not split the sentence', () => {
  // 0.9s gap (from t=2.1 to t=3.0) is a narrator breathing pause, not a
  // sentence boundary. Old maxGapSeconds=0.7 would split here.
  const words = [
    w(0.0, 'one'),
    w(0.3, 'of'),
    w(0.6, 'the'),
    w(0.9, 'golden'),
    w(1.2, 'rules'),
    w(1.5, 'is'),
    w(1.8, 'that'),
    w(2.1, 'two'),
    w(3.0, 'hands'),
    w(3.3, 'are'),
    w(3.6, 'better'),
    w(3.9, 'than'),
    w(4.2, 'one'),
  ];
  const { sentences } = segmentWords(words);
  assert.equal(sentences.length, 1, 'a 0.9s pause must not close the sentence');
  assert.equal(sentences[0].wordCount, 13);
});

test('sentence-ending punctuation still closes the sentence', () => {
  const words = [
    w(0.0, 'this'),
    w(0.3, 'was'),
    w(0.6, 'the'),
    w(0.9, 'top.'),
    w(2.5, 'It'),
    w(2.8, 'was'),
    w(3.1, 'blocked.'),
  ];
  const { sentences } = segmentWords(words);
  assert.equal(sentences.length, 2, 'period must still close the sentence');
  assert.equal(sentences[0].text, 'this was the top.');
  assert.equal(sentences[1].text, 'It was blocked.');
});

test('pause longer than maxGapSeconds splits into a new sentence', () => {
  // 2.0s gap exceeds maxGapSeconds=1.5 → real boundary.
  const words = [
    w(0.0, 'this'),
    w(0.3, 'was'),
    w(0.6, 'the'),
    w(0.9, 'top'),
    w(2.9, 'it'),
    w(3.2, 'was'),
    w(3.5, 'blocked'),
  ];
  const { sentences } = segmentWords(words);
  assert.equal(sentences.length, 2, 'a 2.0s pause must close the sentence');
});

test('short fragment with no punctuation merges into the previous sentence', () => {
  // "power and strength to a" is a 5-word fragment; with minWords=6 it must
  // merge backwards into the preceding sentence rather than surviving alone.
  const words = [
    w(0.0, 'bring'),
    w(0.3, 'more'),
    w(1.1, 'power'),
    w(1.4, 'and'),
    w(1.7, 'strength'),
    w(2.0, 'to'),
    w(2.3, 'a'),
  ];
  const { sentences } = segmentWords(words);
  assert.equal(sentences.length, 1, '5-word fragment must merge into the previous sentence');
  assert.equal(sentences[0].wordCount, 7);
});

test('regression: "get the last few / inches" merges instead of fragmenting', () => {
  // Mirrors the real technique-video case at c035/c036.
  const words = [
    w(0.0, 'just'),
    w(0.3, 'flexing'),
    w(0.6, 'your'),
    w(0.9, 'arm'),
    w(1.2, 'at'),
    w(1.5, 'the'),
    w(1.8, 'end'),
    w(2.1, 'to'),
    w(2.8, 'get'),
    w(3.1, 'the'),
    w(3.4, 'last'),
    w(3.7, 'few'),
    w(4.2, 'inches'),
  ];
  const { sentences } = segmentWords(words);
  assert.equal(sentences.length, 1, 'trailing "get the last few inches" must not fragment');
  assert.equal(sentences[0].wordCount, 13);
});

test('hard split looks ahead to the next punctuation instead of splitting mid-phrase', () => {
  // 25 punctuation-free words hit maxWords=26 at "with" (a preposition).
  // Old behaviour hard-split right after "with", leaving a sentence that ends
  // in a function word. New behaviour looks ahead to "palm," and splits there.
  const words = [];
  let time = 0;
  for (let i = 0; i < 25; i += 1) {
    words.push(w(time, `word${i}`));
    time += 0.2;
  }
  words.push(w(time, 'with'));
  time += 0.2; // word 26 (index 25) — preposition
  words.push(w(time, 'your'));
  time += 0.2;
  words.push(w(time, 'palm,'));
  time += 0.2; // comma right after
  words.push(w(time, 'and'));
  time += 0.2;
  words.push(w(time, 'thumb'));
  time += 0.2;
  words.push(w(time, 'and'));
  time += 0.2;
  words.push(w(time, 'index'));
  time += 0.2;
  words.push(w(time, 'and'));
  time += 0.2;
  words.push(w(time, 'middle'));
  time += 0.2;

  const { sentences } = segmentWords(words);
  assert.ok(sentences.length >= 2, `expected ≥2 sentences, got ${sentences.length}`);
  assert.match(sentences[0].text, /palm,$/, 'first sentence must end at "palm," not mid-phrase');
});
