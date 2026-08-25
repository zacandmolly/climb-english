// Word-level karaoke primitives (Issues #23/#29).
//
// The active subtitle cue splits into past/current/future word states driven
// by media time. Everything here is pure so the timeline behavior is unit
// testable without a media element.

export type WordKaraokeState = 'past' | 'current' | 'future';

/**
 * Index of the word being spoken at `elapsedSeconds` (seconds after
 * cue.startTime). Returns -1 before the first word starts; the last index
 * once past the final word. Missing timing (empty list) also returns -1 so
 * callers can fall back to sentence-level rendering.
 */
export function activeWordIndex(
  wordStartOffsetsMs: readonly number[],
  elapsedSeconds: number
): number {
  const elapsedMs = elapsedSeconds * 1000;
  let index = -1;
  for (let i = 0; i < wordStartOffsetsMs.length; i += 1) {
    if (elapsedMs >= wordStartOffsetsMs[i]) index = i;
    else break;
  }
  return index;
}

/**
 * Per-word karaoke state for the whole active cue. Pause-freeze, seek sync
 * and playback-rate consistency all follow automatically because the state is
 * a pure function of media time.
 */
export function wordKaraokeStates(
  wordStartOffsetsMs: readonly number[],
  elapsedSeconds: number
): WordKaraokeState[] {
  const current = activeWordIndex(wordStartOffsetsMs, elapsedSeconds);
  return wordStartOffsetsMs.map((_offset, index) =>
    index < current ? 'past' : index === current ? 'current' : 'future'
  );
}

/** Clean raw ">>" speaker markers out of customer-facing text. */
export function displayText(text: string): string {
  return text.replace(/>>\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizedSpokenToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/^['"“”‘’.,!?;:()[\]–—-]+|['"“”‘’.,!?;:()[\]–—-]+$/g, '');
}

/** Pronounced display tokens derived from cue.en; word text is never duplicated in data. */
export function spokenWords(text: string): string[] {
  return text.split(/\s+/).filter((token) => {
    const normalized = normalizedSpokenToken(token);
    return normalized && normalized !== '>>';
  });
}

/**
 * Map speaker-marker token positions (indices into whitespace-split cue.en)
 * to word-boundary indices (0-based index of the word BEFORE which the marker
 * sits; -1 = before the first word).
 */
export function speakerWordBoundaries(en: string): number[] {
  const tokens = en.split(/\s+/).filter(Boolean);
  const boundaries: number[] = [];
  let wordIndex = 0;
  for (const token of tokens) {
    if (token === '>>') {
      boundaries.push(wordIndex);
    } else if (normalizedSpokenToken(token)) {
      wordIndex += 1;
    }
  }
  return boundaries;
}
