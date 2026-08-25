import type { Keyword, Lesson, PracticeSentence } from '../types';
import { cueAtTime } from './cue';

export function fullTranscript(lesson: Lesson) {
  return lesson.sentences.map((sentence) => sentence.transcript).join(' ');
}

// Map a playback timestamp (already on the sentence/caption timeline — the
// unified `cue.startTime` absolute-time semantics) onto the sentence being
// spoken. Keeps the previous sentence highlighted in the gap between two
// sentences, and clamps to the segment bounds so the pre-roll never highlights
// a sentence before the segment. Delegates to the shared `cueAtTime` so the
// course line and the video line share one timeline judgement (R12 Step 2).
export function sentenceIndexAtMediaTime(lesson: Lesson, mediaTime: number) {
  return cueAtTime(lesson.sentences, mediaTime);
}

export function fullTranslation(lesson: Lesson) {
  return lesson.sentences.map((sentence) => sentence.zhTranslation).join('');
}

export function uniqueKeywords(sentences: PracticeSentence[]) {
  const map = new Map<string, Keyword>();
  for (const sentence of sentences) {
    for (const keyword of sentence.keywords) {
      if (!map.has(keyword.term)) map.set(keyword.term, keyword);
    }
  }
  return Array.from(map.values());
}

export function segmentPatterns(lesson: Lesson) {
  return Array.from(new Set(lesson.sentences.flatMap((sentence) => sentence.sentencePatterns))).slice(0, 6);
}

export function parseMediaSource(mediaUrl: string): { kind: 'youtube' | 'local'; videoId?: string } {
  if (mediaUrl.startsWith('youtube:')) {
    return { kind: 'youtube', videoId: mediaUrl.slice('youtube:'.length) };
  }
  return { kind: 'local' };
}
