// Deterministic source-driven word timing for the Climb English pipeline.
//
// Goal (Issues #23/#29): per-word karaoke driven by the *source* caption word
// stream, not a whole-sentence linear sweep and not fabricated uniform timing.
//
// Reliability contract:
//   - A cue gets word times ONLY when its pronounced tokens match the auto
//     caption word stream inside a bounded window. Any cue that cannot be
//     matched reliably stays at sentence level (no `wordStartOffsetsMs` field) and the
//     caller-facing gate fails loudly instead of inventing times.
//   - Times are relative integer milliseconds from cue.startTime (compact
//     schema). Source timestamps are preserved; a run of equal timestamps is
//     spread only inside the following real source gap so every word is visible.
//   - Raw ">>" speaker markers are never pronounced. Rendering derives a
//     neutral boundary from cue.en without duplicating marker metadata.
//
// ASR-aware error boundaries (documented, tested):
//   - startToleranceSeconds: 0.5 — a cue may begin up to 0.5s before its first
//     source word (segmenter start pad is 0.15s; some historical imports padded
//     harder, e.g. Innsbruck c001 has ~0.71s of pre-word padding).
//   - endToleranceSeconds: 1.0 — a cue may trail its last source word by up to
//     1.0s (segmenter end pad is 0.4s; shared-boundary windows overlap).
//   - startLookaheadSeconds: 3.0 — first word must start within 3s after
//     cue.startTime; larger drift is treated as unreliable (no matching).
//   - Shared time boundaries are handled by sequential claiming: cues are
//     matched in data order and each source word index can be claimed once, so
//     adjacent cues with overlapping windows (e.g. two consecutive "Yeah.")
//     never both consume the same word occurrence.

import { normalizeWord } from './timed-words.mjs';

export const WORD_MATCH = {
  startToleranceSeconds: 0.5,
  endToleranceSeconds: 1.0,
  startLookaheadSeconds: 3.0,
};

export function tokenizeCueText(en) {
  return String(en ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((raw) => {
      const norm = normalizeWord(raw);
      return { raw, norm, speaker: norm === '>>' };
    });
}

/** 0-based indices of raw ">>" tokens in the whitespace-split cue.en. */
export function speakerMarkersFromText(en) {
  return tokenizeCueText(en)
    .map((token, index) => (token.speaker ? index : -1))
    .filter((index) => index >= 0);
}

/**
 * YouTube occasionally assigns two adjacent words the same timestamp. Spread
 * only those ties, evenly and strictly before the next real word (or cue end).
 * Return null if integer milliseconds cannot represent every word distinctly;
 * callers then fail closed instead of silently skipping a karaoke word.
 */
export function spreadSharedOffsets(offsets, cueDurationMs) {
  const spread = [...offsets];
  for (let start = 0; start < spread.length;) {
    let end = start + 1;
    while (end < spread.length && spread[end] === spread[start]) end += 1;
    const runLength = end - start;
    if (runLength > 1) {
      const boundary = end < spread.length ? spread[end] : Math.round(cueDurationMs);
      const gap = boundary - spread[start];
      if (gap < runLength) return null;
      for (let offset = 1; offset < runLength; offset += 1) {
        spread[start + offset] = spread[start] + Math.floor((gap * offset) / runLength);
      }
    }
    start = end;
  }
  return spread;
}

/** Build a cue's compact timing array from its own matched source words. */
export function wordStartOffsetsFromTimedWords(timedWords, cue) {
  const cueWords = tokenizeCueText(cue.en)
    .filter((token) => !token.speaker && token.norm)
    .map((token) => token.norm);
  const sourceWords = timedWords
    .map((word) => ({ ...word, norm: normalizeWord(word.raw ?? word.word ?? '') }))
    .filter((word) => word.norm && word.norm !== '>>');
  if (
    cueWords.length === 0 ||
    cueWords.length !== sourceWords.length ||
    cueWords.some((word, index) => word !== sourceWords[index].norm)
  ) {
    return null;
  }
  const offsets = sourceWords.map((word) => Math.round((word.time - cue.startTime) * 1000));
  return spreadSharedOffsets(offsets, (cue.endTime - cue.startTime) * 1000);
}

/**
 * Match one cue against the parsed source word stream.
 *
 * `startAt` is the first source index not claimed by an earlier cue
 * (sequential shared-boundary handling). Returns a structured result or
 * null when no reliable match exists. The matcher is fully deterministic:
 * candidates are scanned in stream order and the winner minimizes the
 * absolute gap between its first word and cue.startTime (earliest index wins
 * ties).
 */
export function matchCueWords(wordStream, cue, startAt = 0) {
  const tokens = tokenizeCueText(cue.en);
  const pronounced = tokens.filter((token) => !token.speaker && token.norm);
  if (pronounced.length === 0) return null;

  const { startToleranceSeconds, endToleranceSeconds, startLookaheadSeconds } = WORD_MATCH;
  const startFloor = cue.startTime - startToleranceSeconds;
  const endCeiling = cue.endTime + endToleranceSeconds;
  const startCeiling = cue.startTime + startLookaheadSeconds;

  let best = null;
  let bestStartDelta = Number.POSITIVE_INFINITY;
  let bestFirstIndex = Number.POSITIVE_INFINITY;

  for (let startIndex = startAt; startIndex < wordStream.length; startIndex += 1) {
    const first = wordStream[startIndex];
    if (
      first.word === '>>' ||
      !first.word ||
      first.time < startFloor ||
      first.time > endCeiling ||
      first.time > startCeiling ||
      first.word !== pronounced[0].norm
    ) {
      continue;
    }

    const matched = [];
    const matchedIndices = [];
    let tokenIndex = 0;
    let cursor = startIndex;
    let reliable = true;

    while (tokenIndex < pronounced.length && cursor < wordStream.length) {
      const streamWord = wordStream[cursor];
      if (streamWord.word === '>>' || !streamWord.word) {
        cursor += 1;
        continue;
      }
      if (streamWord.time > endCeiling) {
        reliable = false;
        break;
      }
      if (streamWord.time < startFloor) {
        cursor += 1;
        continue;
      }
      if (streamWord.word !== pronounced[tokenIndex].norm) {
        reliable = false;
        break;
      }
      matched.push(streamWord);
      matchedIndices.push(cursor);
      tokenIndex += 1;
      cursor += 1;
    }

    if (!reliable || tokenIndex !== pronounced.length) continue;

    const startDelta = Math.abs(first.time - cue.startTime);
    if (
      startDelta < bestStartDelta ||
      (startDelta === bestStartDelta && startIndex < bestFirstIndex)
    ) {
      best = { words: matched, indices: matchedIndices };
      bestStartDelta = startDelta;
      bestFirstIndex = startIndex;
    }
  }

  if (!best) return null;

  const wordStartOffsetsMs = wordStartOffsetsFromTimedWords(best.words, cue);
  if (!wordStartOffsetsMs) return null;
  return {
    wordStartOffsetsMs,
    source: {
      firstIndex: bestFirstIndex,
      lastIndex: best.indices[best.indices.length - 1],
      firstTime: best.words[0].time,
      lastTime: best.words[best.words.length - 1].time,
    },
  };
}

/**
 * Backfill word times for every cue of a video deck, in order.
 *
 * Cues are matched sequentially against one shared `consumed` index set so
 * shared boundaries are claimed exactly once. Any cue that fails the reliable
 * match is reported in `failures` and left untouched (sentence-level);
 * callers decide whether that fails the pipeline (the CLI and gate do).
 */
export function backfillVideoCues(cues, wordStream) {
  let nextSourceIndex = 0;
  const failures = [];
  let wordCount = 0;

  const backfilled = cues.map((cue, index) => {
    const result = matchCueWords(wordStream, cue, nextSourceIndex);
    if (!result) {
      failures.push({
        index,
        id: cue.id,
        startTime: cue.startTime,
        endTime: cue.endTime,
        en: cue.en,
      });
      return cue;
    }
    nextSourceIndex = result.source.lastIndex + 1;
    wordCount += result.wordStartOffsetsMs.length;
    const baseCue = { ...cue };
    delete baseCue.words;
    delete baseCue.wordStartOffsetsMs;
    delete baseCue.speaker;
    return {
      ...baseCue,
      wordStartOffsetsMs: result.wordStartOffsetsMs,
    };
  });

  return {
    cues: backfilled,
    failures,
    stats: {
      cues: cues.length,
      matched: cues.length - failures.length,
      failed: failures.length,
      words: wordCount,
    },
  };
}
