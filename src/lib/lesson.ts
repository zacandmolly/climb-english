import type { Keyword, Lesson, PracticeSentence } from '../types';

export function fullTranscript(lesson: Lesson) {
  return lesson.sentences.map((sentence) => sentence.transcript).join(' ');
}

// Map a playback timestamp (already on the sentence/caption timeline) onto
// the sentence currently being spoken. Keeps the previous sentence
// highlighted in the gap between two sentences, and clamps to the segment
// bounds so the pre-roll never highlights a sentence before the segment.
export function sentenceIndexAtMediaTime(lesson: Lesson, mediaTime: number) {
  const sentences = lesson.sentences;
  if (sentences.length === 0) return 0;

  if (mediaTime < sentences[0].startTime) return 0;

  let index = 0;
  for (let i = 0; i < sentences.length; i += 1) {
    if (mediaTime >= sentences[i].startTime) {
      index = i;
    } else {
      break;
    }
  }
  return index;
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
