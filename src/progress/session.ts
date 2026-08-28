import { uniqueKeywords } from '../lib/lesson';
import type { DailySession, Keyword, LearningProgress, Lesson, VocabEntry } from '../types';

export function toggleVocabTermById(
  term: string,
  setProgress: React.Dispatch<React.SetStateAction<LearningProgress>>
) {
  setProgress((currentProgress) => ({
    ...currentProgress,
    vocab: currentProgress.vocab.filter((entry) => entry.term !== term),
    updatedAt: new Date().toISOString(),
  }));
}

export function collectSessionVocab(
  lesson: Lesson,
  session: DailySession,
  currentVocab: VocabEntry[],
  courseId?: string
): VocabEntry[] {
  const keywords = uniqueKeywords(lesson.sentences);
  return mergeVocabEntries({
    currentVocab,
    keywords,
    lessonId: lesson.id,
    day: session.day,
    courseId,
  });
}

type MergeVocabEntriesOptions = {
  currentVocab: VocabEntry[];
  keywords: Keyword[];
  lessonId: string;
  day: number;
  courseId?: string;
};

export function mergeVocabEntries({
  currentVocab,
  keywords,
  lessonId,
  day,
  courseId,
}: MergeVocabEntriesOptions): VocabEntry[] {
  const existing = new Map(currentVocab.map((entry) => [entry.term, entry]));
  const addedAt = new Date().toISOString();

  for (const keyword of keywords) {
    if (existing.has(keyword.term)) continue;
    existing.set(keyword.term, {
      term: keyword.term,
      zh: keyword.zh,
      example: keyword.example,
      lessonId,
      day,
      courseId,
      addedAt,
      mastery: 0,
    });
  }

  return Array.from(existing.values());
}

export function completedPrefixCount(sessions: DailySession[], completedSessionIds: Set<string>) {
  let completedCount = 0;

  for (const session of sessions) {
    if (!completedSessionIds.has(session.id)) break;
    completedCount += 1;
  }

  return completedCount;
}

export function getUnlockedSessionIndex(
  sessions: DailySession[],
  completedSessionIds: Set<string>
) {
  if (sessions.length === 0) return 0;
  return Math.min(completedPrefixCount(sessions, completedSessionIds), sessions.length - 1);
}

export function getInitialSessionIndex(sessions: DailySession[], progress: LearningProgress) {
  if (sessions.length === 0) return 0;

  const completedSessionIds = new Set(progress.completedSessionIds);
  const unlockedSessionIndex = getUnlockedSessionIndex(sessions, completedSessionIds);
  const storedSessionIndex = sessions.findIndex(
    (session) => session.id === progress.activeSessionId
  );

  if (
    storedSessionIndex >= 0 &&
    storedSessionIndex <= unlockedSessionIndex &&
    !completedSessionIds.has(sessions[storedSessionIndex].id)
  ) {
    return storedSessionIndex;
  }

  return unlockedSessionIndex;
}
