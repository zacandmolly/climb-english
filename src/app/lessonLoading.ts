import { COURSE_SUPERSEDED_BY_VIDEO } from '../constants';
import type { LearningProgress, Lesson, MainView } from '../types';

const DEFAULT_COURSE_ID = Object.keys(COURSE_SUPERSEDED_BY_VIDEO)[0] ?? '';
const LESSON_RETRY_VIEW_KEY = 'climb-english-lesson-retry-view';

export type LessonLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; lessons: Lesson[] }
  | { status: 'failed' };

export type LessonRetryIntent = { requested: boolean; view: MainView };

export function inferInitialCourseId(progress: LearningProgress): string {
  if (progress.activeCourseId) return progress.activeCourseId;
  const matchingCourseId = Object.keys(COURSE_SUPERSEDED_BY_VIDEO).find((courseId) =>
    progress.activeSessionId?.startsWith(`${courseId}-day-`)
  );
  return matchingCourseId ?? DEFAULT_COURSE_ID;
}

export function loadLessonRetryIntent(): LessonRetryIntent {
  if (typeof window === 'undefined') return { requested: false, view: 'today' };
  try {
    const value = window.sessionStorage.getItem(LESSON_RETRY_VIEW_KEY);
    return { requested: value !== null, view: toMainView(value) };
  } catch {
    return { requested: false, view: 'today' };
  }
}

export function saveLessonRetryView(view: MainView): void {
  try {
    window.sessionStorage.setItem(LESSON_RETRY_VIEW_KEY, view);
  } catch {
    // A reload still returns to the video if session storage is unavailable.
  }
}

export function clearLessonRetryView(): void {
  try {
    window.sessionStorage.removeItem(LESSON_RETRY_VIEW_KEY);
  } catch {
    // Storage restrictions do not block course loading.
  }
}

function toMainView(value: string | null): MainView {
  if (value === 'library' || value === 'vocab' || value === 'me') return value;
  return 'today';
}
