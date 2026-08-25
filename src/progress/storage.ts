import type { Course, LearningProgress, VocabEntry } from '../types';

const PROGRESS_STORAGE_KEY = 'climb-english-learning-progress-v2';
const LEGACY_STORAGE_KEY = 'climb-english-learning-progress-v1';

export function emptyLearningProgress(activeSessionId: string | null = null): LearningProgress {
  return {
    completedSessionIds: [],
    activeSessionId,
    updatedAt: null,
    vocab: [],
    practiceDates: [],
  };
}

export function normalizeProgress(candidate: Partial<LearningProgress>): LearningProgress {
  return {
    completedSessionIds: Array.isArray(candidate.completedSessionIds)
      ? candidate.completedSessionIds.filter((id): id is string => typeof id === 'string')
      : [],
    activeSessionId:
      typeof candidate.activeSessionId === 'string' ? candidate.activeSessionId : null,
    activeCourseId:
      typeof candidate.activeCourseId === 'string' ? candidate.activeCourseId : null,
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : null,
    vocab: Array.isArray(candidate.vocab)
      ? candidate.vocab
          .filter(
            (entry): entry is VocabEntry =>
              Boolean(entry) &&
              typeof entry.term === 'string' &&
              typeof entry.zh === 'string',
          )
          .map((entry) => ({
            ...entry,
            example: typeof entry.example === 'string' ? entry.example : '',
            lessonId: typeof entry.lessonId === 'string' ? entry.lessonId : '',
            day: typeof entry.day === 'number' ? entry.day : 1,
            courseId: typeof entry.courseId === 'string' ? entry.courseId : undefined,
            addedAt: typeof entry.addedAt === 'string' ? entry.addedAt : new Date().toISOString(),
            mastery: entry.mastery === 1 || entry.mastery === 2 ? entry.mastery : 0,
          }))
      : [],
    practiceDates: Array.isArray(candidate.practiceDates)
      ? candidate.practiceDates.filter((date): date is string => typeof date === 'string')
      : [],
  };
}

export function migrateLegacyProgress(
  progress: LearningProgress,
  courses: Course[],
): LearningProgress {
  const firstCourse = courses[0];
  if (!firstCourse) return progress;

  const remapSessionId = (id: string) => {
    const match = id.match(/^daily-session-(\d+)$/);
    if (!match) return id;
    const day = Number(match[1]);
    return day >= 1 && day <= firstCourse.sessions.length
      ? `${firstCourse.id}-day-${day}`
      : id;
  };

  const completedSessionIds = Array.from(
    new Set(progress.completedSessionIds.map(remapSessionId)),
  );
  const activeSessionId = progress.activeSessionId
    ? remapSessionId(progress.activeSessionId)
    : progress.activeSessionId;
  const activeCourseId =
    progress.activeCourseId ??
    (activeSessionId
      ? courses.find((course) => course.sessions.some((session) => session.id === activeSessionId))
          ?.id ?? null
      : null);

  return { ...progress, completedSessionIds, activeSessionId, activeCourseId };
}

export function loadLearningProgress(): LearningProgress {
  if (typeof window === 'undefined') return emptyLearningProgress();

  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LearningProgress>;
      return normalizeProgress(parsed);
    }

    const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacyRaw) {
      const parsed = JSON.parse(legacyRaw) as Partial<LearningProgress>;
      return normalizeProgress(parsed);
    }

    return emptyLearningProgress();
  } catch {
    return emptyLearningProgress();
  }
}

export function saveLearningProgress(progress: LearningProgress) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // localStorage can be unavailable in locked-down browsers. The app still works for the session.
  }
}

export function localDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function computeStreak(dates: string[]) {
  if (!dates.length) return 0;

  const dateSet = new Set(dates);
  const today = new Date();
  const todayKey = localDateKey(today);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  let cursor: Date;
  if (dateSet.has(todayKey)) {
    cursor = new Date(today);
  } else if (dateSet.has(localDateKey(yesterday))) {
    cursor = new Date(yesterday);
  } else {
    return 0;
  }

  let streak = 0;
  while (dateSet.has(localDateKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
