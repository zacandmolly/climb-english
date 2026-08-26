// Scoring functions for the R8 segment-parameter search.
//
// Given a set of segmented sentences produced by `segmentWords` with a given
// parameter grid cell, these metrics quantify how "good" the sentence shapes
// are for a climbing-English learner. They are deliberately reading of the
// same targets the real pipeline cares about (from segment.mjs):
//
//   - too many tiny fragments (sentences under minWords) — the original bug
//     that produced "power and strength to a";
//   - sentences that run on forever (over maxWords / maxSentenceSeconds) and
//     are hard to practice;
//   - short-fragment word count (how many words are wasted in fragments);
//   - the sentence-length distribution (is it reasonable, or bimodal/broken?);
//   - coverage of the input vocabulary (did we drop words?).
//
// Every function returns a number; higher is generally better for the "good"
// metrics, and the aggregate `score` sums the normalized ones so grid cells
// are directly comparable.

// Fragmentation rate: fraction of sentences whose word count is below the
// `minWords` that the caller is testing. A high value means the parameters are
// producing too many tiny fragments.
function fragmentRate(sentences, minWords) {
  if (sentences.length === 0) return 1;
  const fragments = sentences.filter((sentence) => sentence.wordCount < minWords).length;
  return fragments / sentences.length;
}

// Over-long sentence rate: fraction of sentences exceeding maxWords OR the
// maxSentenceSeconds the caller tests. These are hard to practice in one clip.
function overlongRate(sentences, { maxWords, maxSentenceSeconds }) {
  if (sentences.length === 0) return 1;
  const overlong = sentences.filter(
    (sentence) =>
      sentence.wordCount > maxWords || sentence.endTime - sentence.startTime > maxSentenceSeconds
  ).length;
  return overlong / sentences.length;
}

// Average number of words spent inside fragments (sentences under minWords).
// A low number here is good — it means fragments, when they occur, are small.
function fragmentWordAverage(sentences, minWords) {
  const fragments = sentences.filter((sentence) => sentence.wordCount < minWords);
  if (fragments.length === 0) return 0;
  const total = fragments.reduce((sum, sentence) => sum + sentence.wordCount, 0);
  return total / fragments.length;
}

// Standard deviation of sentence word counts, normalized to the mean. A very
// high coefficient of variation means the segmentation is lopsided (some huge,
// some tiny). We prefer moderate spread.
function lengthCv(sentences) {
  if (sentences.length === 0) return 0;
  const counts = sentences.map((sentence) => sentence.wordCount);
  const mean = counts.reduce((sum, count) => sum + count, 0) / counts.length;
  if (mean === 0) return 0;
  const variance = counts.reduce((sum, count) => sum + (count - mean) ** 2, 0) / counts.length;
  return Math.sqrt(variance) / mean;
}

// Word-coverage: fraction of the input words that survive into at least one
// sentence. Words dropped by the segmenter (e.g. swallowed by a merge or a
// hard split) are lost to the learner, so coverage should be ~1. Note the
// segmenter strips the per-sentence `words` array from its public output, so we
// tokenize each sentence's `text` instead of reading `sentence.words`.
function wordCoverage(inputWords, sentences) {
  if (inputWords.length === 0) return 1;
  const merged = new Set(
    sentences.flatMap((sentence) => (sentence.text ?? '').toLowerCase().match(/[a-z']+/g) ?? [])
  );
  const input = new Set(inputWords.map((word) => word.word));
  if (input.size === 0) return 1;
  return Math.min(1, merged.size / input.size);
}

// The distribution "reachability" score: roughly how close the median sentence
// length is to a comfortable 6-20 word learning band. Perfect is 1, degrading
// as the median drifts outside [6, 20].
function lengthDistributionScore(sentences) {
  if (sentences.length === 0) return 0;
  const counts = sentences.map((sentence) => sentence.wordCount).sort((a, b) => a - b);
  const median = counts[Math.floor(counts.length / 2)];
  if (median >= 6 && median <= 20) return 1;
  if (median < 6) return Math.max(0, median / 6);
  return Math.max(0, 1 - (median - 20) / 10);
}

// Aggregate a grid cell into a single comparable score (0..1, higher better).
// Weights bias heavily against fragmentation and over-long sentences, which
// are the defects that have burned this project before, and reward coverage.
function scoreCell(metrics) {
  const fragmentScore = 1 - metrics.fragmentRate;
  const overlongScore = 1 - metrics.overlongRate;
  const coverageScore = metrics.wordCoverage;
  const distributionScore = metrics.lengthDistributionScore;

  // Fragment-word average is "lower is better", so invert into a 0..1 score
  // with a soft scale: 0 wasted words -> 1, 6+ wasted words per fragment -> 0.
  const fragmentWordScore = Math.max(0, 1 - metrics.fragmentWordAverage / 6);

  // The length CV is "moderate is good". Too low (=0, uniform) is fine — we do
  // not want to punish perfectly uniform lengths, so we only penalize CV > 1.
  const cvScore = Math.max(0, 1 - Math.max(0, metrics.lengthCv - 1));

  return (
    fragmentScore * 0.3 +
    overlongScore * 0.25 +
    coverageScore * 0.2 +
    distributionScore * 0.15 +
    fragmentWordScore * 0.05 +
    cvScore * 0.05
  );
}

// Compute all metrics + the aggregate score for one grid cell.
export function evaluateCell({ sentences, inputWords, cell }) {
  const metrics = {
    fragmentRate: fragmentRate(sentences, cell.minWords),
    overlongRate: overlongRate(sentences, {
      maxWords: cell.maxWords,
      maxSentenceSeconds: cell.maxSentenceSeconds ?? 18,
    }),
    fragmentWordAverage: fragmentWordAverage(sentences, cell.minWords),
    lengthCv: lengthCv(sentences),
    wordCoverage: wordCoverage(inputWords, sentences),
    lengthDistributionScore: lengthDistributionScore(sentences),
  };
  return { ...metrics, score: scoreCell(metrics) };
}
