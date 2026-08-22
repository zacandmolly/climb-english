// Sentence segmentation + learning-value scoring.
//
// Why this exists: the original pipeline cut the video on a fixed 25-second
// grid. That chopped sentences mid-stream (so clips started halfway into a
// sentence) and produced low-value clips ("Yeah." / "Come on!").
//
// This module instead:
//  1. Rebuilds real sentences from word-level caption timestamps, using
//     punctuation, inter-word gaps and clause structure.
//  2. Snaps clip boundaries to the actual first/last word of each sentence,
//     with small configurable pads, so no sentence start is ever cut off.
//  3. Scores every sentence for learning value and drops or merges clips
//     that are too short, too filler-heavy, or not teachable.

import { endsSentence, wordsToText } from './timed-words.mjs';
import { FILLER_WORDS, GRAMMAR_SIGNALS, STOPWORDS, findClimbingTerms } from './climbing-terms.mjs';

const DEFAULTS = {
  // A pause longer than this closes the sentence. Tuned up from 0.7s:
  // YouTube auto-caption narration pauses mid-sentence to breathe/think, and
  // 0.7s turned those pauses into sentence boundaries, producing 1–6 word
  // fragments ("power and strength to a", "get the last few", "hold From
  // Below") that the LLM then merged during translation (Issue #3). 1.5s
  // still splits on real inter-sentence pauses but keeps one spoken sentence
  // intact.
  maxGapSeconds: 1.5,
  maxWords: 26, // force a split beyond this many words
  softSplitWords: 16, // prefer splitting at a comma once past this length
  maxSentenceSeconds: 18,
  maxLookaheadWords: 10, // when maxWords forces a split, look this far ahead
  // for the next punctuation so we don't hard-split mid-phrase
  minWords: 6, // shorter than this merges into a neighbour (raised from 3 so
  // 4–6 word trailing fragments rejoin the sentence they continue)
  mergeGapSeconds: 2.0, // only merge across gaps smaller than this (raised
  // from 1.2 to match the larger maxGapSeconds)
  startPadSeconds: 0.15, // pad before the first word so its attack is never clipped
  endPadSeconds: 0.4, // room for the final word to finish
  minScore: 38, // keep threshold for learning value
  highlightScore: 62,
};

export function segmentWords(words, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const sentences = [];
  let current = [];

  const closeSentence = () => {
    if (current.length > 0) {
      sentences.push({ words: current });
      current = [];
    }
  };

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const next = words[index + 1];

    current.push(word);
    const wordCount = current.length;
    const sentenceDuration = word.time - current[0].time;

    let shouldClose = false;

    if (!next) {
      shouldClose = true;
    } else if (endsSentence(word.raw)) {
      shouldClose = true;
    } else if (next.time - word.time > opts.maxGapSeconds) {
      shouldClose = true;
    } else if (wordCount >= opts.maxWords || sentenceDuration > opts.maxSentenceSeconds) {
      // Too long: split at the most recent comma if we have one.
      const commaIndex = findLastComma(current);
      if (commaIndex > 2) {
        const tail = current.splice(commaIndex + 1);
        closeSentence();
        current = tail;
        continue;
      }
      // No comma behind — look ahead for the next punctuation so we don't
      // hard-split mid-phrase (e.g. after "…grasp it with" → "your palm,").
      const lookahead = findNextPunctuation(words, index, opts.maxLookaheadWords);
      if (lookahead > index) {
        for (let ahead = index + 1; ahead <= lookahead; ahead += 1) {
          current.push(words[ahead]);
        }
        closeSentence();
        index = lookahead;
        continue;
      }
      shouldClose = true;
    } else if (wordCount >= opts.softSplitWords && /,$/.test(word.raw) && next.time - word.time > 0.25) {
      shouldClose = true;
    }

    if (shouldClose) closeSentence();
  }

  const merged = mergeFragments(sentences, opts);
  const timed = merged.map((sentence, index, all) => withTimes(sentence, index, all, opts));
  const scored = timed.map((sentence) => withScore(sentence, opts));

  // Every sentence stays in the subtitle track so continuous playback reads
  // naturally; `keep` marks whether it is worth practicing. `dropped` is the
  // same information from the other side, for pipeline reporting.
  return { sentences: scored, dropped: scored.filter((sentence) => !sentence.keep) };
}

function findLastComma(words) {
  for (let index = words.length - 2; index >= 2; index -= 1) {
    if (/[,,;]$/.test(words[index].raw)) return index;
  }
  return -1;
}

// Scan ahead (exclusive of fromIndex) for the first word ending in sentence
// punctuation or a comma/semicolon/colon. Returns its index, or -1 when none
// appears within maxLookahead words.
function findNextPunctuation(words, fromIndex, maxLookahead) {
  const limit = Math.min(words.length, fromIndex + 1 + maxLookahead);
  for (let index = fromIndex + 1; index < limit; index += 1) {
    const raw = words[index].raw;
    if (endsSentence(raw) || /[,,;:]$/.test(raw)) return index;
  }
  return -1;
}

function mergeFragments(sentences, opts) {
  const result = [];

  // A short run of words is a *fragment* (merge it into the neighbour) only
  // when it does NOT end in sentence punctuation. "power and strength to a"
  // has no terminal punctuation → it continues the previous sentence; "It was
  // blocked." does → it is a complete short sentence and must stay separate.
  // Without this guard, raising minWords to 6 would swallow real short
  // sentences like "Yeah." / "It was blocked.".
  const isFragment = (sentence) =>
    !endsSentence(sentence.words[sentence.words.length - 1].raw);

  for (const sentence of sentences) {
    const wordCount = sentence.words.length;
    const previous = result[result.length - 1];

    if (wordCount < opts.minWords && previous && isFragment(sentence)) {
      const gap = sentence.words[0].time - previous.words[previous.words.length - 1].time;
      if (gap < opts.mergeGapSeconds) {
        previous.words.push(...sentence.words);
        continue;
      }
    }

    if (wordCount < opts.minWords && !previous) {
      result.push(sentence);
      continue;
    }

    result.push(sentence);
  }

  // A trailing fragment merges backwards, again only if it lacks punctuation.
  if (result.length >= 2) {
    const last = result[result.length - 1];
    const previous = result[result.length - 2];
    const gap = last.words[0].time - previous.words[previous.words.length - 1].time;
    if (last.words.length < opts.minWords && isFragment(last) && gap < opts.mergeGapSeconds) {
      previous.words.push(...last.words);
      result.pop();
    }
  }

  return result;
}

function withTimes(sentence, index, all, opts) {
  const firstWord = sentence.words[0];
  const lastWord = sentence.words[sentence.words.length - 1];
  const previousEnd = index > 0 ? all[index - 1].words[all[index - 1].words.length - 1].time : 0;
  const nextStart = index < all.length - 1 ? all[index + 1].words[0].time : Number.POSITIVE_INFINITY;

  // Snap to the real first word, then pad slightly so the initial consonant
  // is never clipped — this is the fix for "sentence starts get cut off".
  const startTime = Math.max(previousEnd + 0.05, firstWord.time - opts.startPadSeconds);
  const endTime = Math.min(nextStart - 0.05, lastWord.time + opts.endPadSeconds);

  return {
    startTime: Number(startTime.toFixed(2)),
    endTime: Number(Math.max(endTime, startTime + 0.6).toFixed(2)),
    text: wordsToText(sentence.words),
    wordCount: sentence.words.length,
  };
}

function withScore(sentence, opts) {
  const { score, parts } = scoreSentence(sentence.text);
  const keep = score >= opts.minScore || (parts.termHits >= 1 && sentence.wordCount >= 4);
  return {
    ...sentence,
    score,
    scoreParts: parts,
    highlight: score >= opts.highlightScore && parts.termHits >= 1,
    keep,
    dropReason: keep ? null : dropReasonFor(sentence, parts),
  };
}

export function scoreSentence(text) {
  const tokens = text.toLowerCase().match(/[a-z']+/g) ?? [];
  const n = tokens.length;

  if (n === 0) {
    return { score: 0, parts: { lengthScore: 0, contentScore: 0, termHits: 0, grammarHits: 0, fillerPenalty: 60, repetitionPenalty: 0 } };
  }

  const unique = new Set(tokens);
  const contentWords = tokens.filter((token) => !STOPWORDS.has(token));
  const fillerCount = tokens.filter((token) => FILLER_WORDS.has(token)).length;
  const contentRatio = contentWords.length / n;
  const fillerRatio = fillerCount / n;
  const termHits = findClimbingTerms(text).length;
  const grammarHits = (text.match(new RegExp(GRAMMAR_SIGNALS, 'gi')) ?? []).length;

  // Length: peak at 6-20 words, decay outside.
  let lengthScore;
  if (n < 4) lengthScore = 4;
  else if (n < 6) lengthScore = 14;
  else if (n <= 20) lengthScore = 30;
  else if (n <= 30) lengthScore = 30 - (n - 20) * 1.5;
  else lengthScore = 8;

  const contentScore = Math.round(contentRatio * 25);
  const termScore = Math.min(25, termHits * 9);
  const grammarScore = Math.min(15, grammarHits * 5);

  let fillerPenalty = 0;
  if (fillerRatio > 0.5) fillerPenalty = 25;
  else if (fillerRatio > 0.25) fillerPenalty = 12;

  const repetitionPenalty = unique.size / n < 0.5 ? 10 : 0;

  const score = Math.max(
    0,
    Math.min(100, Math.round(lengthScore + contentScore + termScore + grammarScore - fillerPenalty - repetitionPenalty)),
  );

  return {
    score,
    parts: {
      lengthScore,
      contentScore,
      termHits,
      grammarHits,
      fillerPenalty,
      repetitionPenalty,
    },
  };
}

function dropReasonFor(sentence, parts) {
  if (sentence.wordCount < 4) return 'too-short';
  if (parts.fillerPenalty >= 25) return 'mostly-filler';
  if (parts.termHits === 0 && parts.contentScore < 10) return 'low-information';
  return 'below-min-score';
}

// Split a long time range into daily-practice-friendly chunks at sentence
// boundaries (replaces the old fixed 25s grid when building sessions).
export function chunkSentences(sentences, targetChunkSeconds = 300) {
  const chunks = [];
  let current = [];
  let currentSeconds = 0;

  for (const sentence of sentences) {
    const duration = sentence.endTime - sentence.startTime;
    if (current.length > 0 && currentSeconds + duration > targetChunkSeconds) {
      chunks.push(current);
      current = [];
      currentSeconds = 0;
    }
    current.push(sentence);
    currentSeconds += duration;
  }

  if (current.length > 0) chunks.push(current);
  return chunks;
}
