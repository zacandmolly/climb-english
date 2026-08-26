import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { COURSE_SUPERSEDED_BY_VIDEO } from '../components/MaterialBar';
import { buildCourses } from '../courses';
import { videoSummaries } from '../data/videos';
import {
  collectSessionVocab,
  completedPrefixCount,
  getInitialSessionIndex,
  getUnlockedSessionIndex,
  mergeVocabEntries,
  toggleVocabTermById,
} from '../progress/session';
import {
  computeStreak,
  emptyLearningProgress,
  loadLearningProgress,
  localDateKey,
  migrateLegacyProgress,
  saveLearningProgress,
} from '../progress/storage';
import {
  loadVideoSession,
  saveVideoSession,
  withActiveVideo,
  withVideoPosition,
  type VideoResumePosition,
  type VideoSessionLoadResult,
  type VideoSessionState,
} from '../progress/videoSession';
import type {
  DailySession,
  Keyword,
  LearningProgress,
  MainView,
  PracticeMode,
  VocabMastery,
} from '../types';
import type { AppShellProps } from './AppShell';
import { createProgressBackupActions } from './progressBackup';
import {
  clearLessonRetryView,
  inferInitialCourseId,
  loadLessonRetryIntent,
  saveLessonRetryView,
  type LessonLoadState,
} from './lessonLoading';

const VALID_VIDEO_IDS = videoSummaries.map((video) => video.id);

export function useAppRuntime(): AppShellProps {
  const initialLearningProgress = useInitialValue(loadLearningProgress);
  const initialCourseId = inferInitialCourseId(initialLearningProgress);
  const initialVideoSession = useInitialValue(() => loadVideoSession(VALID_VIDEO_IDS));
  const initialVideoId = resolveInitialVideoId(initialVideoSession, initialCourseId);
  const videoSessionStateRef = useRef<VideoSessionState>(initialVideoSession.state);

  const [lessonLoadState, setLessonLoadState] = useState<LessonLoadState>({ status: 'idle' });
  const lessonLoadStartedRef = useRef(false);
  const requestLessons = useCallback(() => {
    if (lessonLoadStartedRef.current) return;
    lessonLoadStartedRef.current = true;
    setLessonLoadState({ status: 'loading' });
    void import('../data/lessons').then(
      ({ lessons }) => setLessonLoadState({ status: 'loaded', lessons }),
      () => setLessonLoadState({ status: 'failed' })
    );
  }, []);

  const lessons = lessonLoadState.status === 'loaded' ? lessonLoadState.lessons : null;
  const courses = useMemo(() => (lessons ? buildCourses(lessons) : []), [lessons]);
  const sourceSeconds = useMemo(
    () =>
      (lessons ?? []).reduce(
        (total, lesson) => total + Math.max(0, lesson.endTime - lesson.startTime),
        0
      ),
    [lessons]
  );
  const [learningReady, setLearningReady] = useState(false);
  const learningInitializedRef = useRef(false);
  const [progress, setProgress] = useState<LearningProgress>(initialLearningProgress);
  const [activeCourseId, setActiveCourseId] = useState(initialCourseId);
  const activeCourse = courses.find((item) => item.id === activeCourseId) ?? courses[0];
  const dailySessions = activeCourse?.sessions ?? [];
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(0);
  const [activeSessionIndex, setActiveSessionIndex] = useState(0);
  const [mode, setMode] = useState<PracticeMode>('sentence');
  const [playRequestId, setPlayRequestId] = useState(0);
  const initialRetryIntent = useInitialValue(loadLessonRetryIntent);
  const [activeView, setActiveView] = useState<MainView>(initialRetryIntent.view);
  const [activeVideoId, setActiveVideoId] = useState<string | null>(initialVideoId);
  const activeVideo = useMemo(
    () =>
      activeVideoId ? (videoSummaries.find((video) => video.id === activeVideoId) ?? null) : null,
    [activeVideoId]
  );
  const activeSession = dailySessions[activeSessionIndex] ?? dailySessions[0];
  const lesson = activeCourse?.lessons[activeSession?.lessonIndex ?? 0] ?? activeCourse?.lessons[0];
  const activeSentence = lesson?.sentences[activeSentenceIndex] ?? lesson?.sentences[0];
  const completedSessionIds = useMemo(
    () => new Set(progress.completedSessionIds),
    [progress.completedSessionIds]
  );
  const completedSessionCount = completedPrefixCount(dailySessions, completedSessionIds);
  const unlockedSessionIndex = getUnlockedSessionIndex(dailySessions, completedSessionIds);
  const streakDays = useMemo(() => computeStreak(progress.practiceDates), [progress.practiceDates]);
  const allValidSessionIds = useMemo(
    () => new Set(courses.flatMap((course) => course.sessions.map((session) => session.id))),
    [courses]
  );
  const totalSessionCount = courses.reduce((total, course) => total + course.sessions.length, 0);
  const totalCompletedCount = progress.completedSessionIds.filter((id) =>
    allValidSessionIds.has(id)
  ).length;
  const courseNameById = useMemo(
    () => Object.fromEntries(courses.map((course) => [course.id, course.name])),
    [courses]
  );
  const courseRuntimeReady = lessonLoadState.status === 'loaded' && learningReady;

  const retryLessons = useCallback(() => {
    saveLessonRetryView(activeView);
    window.location.reload();
  }, [activeView]);

  useEffect(() => {
    if (learningInitializedRef.current || courses.length === 0) return;
    const migrated = migrateLegacyProgress(initialLearningProgress, courses);
    const course = courses.find((item) => item.id === migrated.activeCourseId) ?? courses[0];
    const normalizedProgress = { ...migrated, activeCourseId: course?.id ?? null };
    learningInitializedRef.current = true;
    setProgress(normalizedProgress);
    setActiveCourseId(course?.id ?? '');
    setActiveSessionIndex(getInitialSessionIndex(course?.sessions ?? [], normalizedProgress));
    setLearningReady(true);
  }, [courses, initialLearningProgress]);

  useEffect(() => {
    if (initialRetryIntent.requested) clearLessonRetryView();
    if (initialRetryIntent.requested || !activeVideoId) requestLessons();
  }, [activeVideoId, initialRetryIntent, requestLessons]);

  useEffect(() => {
    if (learningReady) saveLearningProgress(progress);
  }, [learningReady, progress]);

  useEffect(() => {
    const nextState = withActiveVideo(videoSessionStateRef.current, activeVideoId);
    videoSessionStateRef.current = nextState;
    saveVideoSession(nextState);
  }, [activeVideoId]);

  useEffect(() => {
    if (lesson && activeSentenceIndex >= lesson.sentences.length) setActiveSentenceIndex(0);
  }, [activeSentenceIndex, lesson]);

  const activateDailySession = (session: DailySession, index: number, shouldPlay: boolean) => {
    setActiveSessionIndex(index);
    if (session.mode === 'segment') {
      setMode('segment');
      setActiveSentenceIndex(0);
    } else {
      setMode('sentence');
      setActiveSentenceIndex(session.sentenceIndexes[0] ?? 0);
    }
    if (shouldPlay) setPlayRequestId((id) => id + 1);
  };

  const switchCourse = (courseId: string) => {
    const course = courses.find((item) => item.id === courseId);
    if (!course || (course.id === activeCourse?.id && !activeVideoId)) return;
    setActiveVideoId(null);
    const restoredIndex = getUnlockedSessionIndex(course.sessions, completedSessionIds);
    const restoredSession = course.sessions[restoredIndex] ?? course.sessions[0];
    setActiveCourseId(course.id);
    setProgress((currentProgress) => ({
      ...currentProgress,
      activeCourseId: course.id,
      activeSessionId: restoredSession?.id ?? null,
      updatedAt: new Date().toISOString(),
    }));
    setActiveSessionIndex(restoredIndex);
    setMode(restoredSession?.mode ?? 'sentence');
    setActiveSentenceIndex(restoredSession?.sentenceIndexes[0] ?? 0);
    setPlayRequestId(0);
    setActiveView('today');
    window.scrollTo({ top: 0 });
  };

  const switchView = (view: MainView) => {
    if (view !== 'today' || !activeVideoId) requestLessons();
    setActiveView(view);
    window.scrollTo({ top: 0 });
  };

  const switchVideo = (videoId: string) => {
    if (videoId !== activeVideoId) setActiveVideoId(videoId);
    setActiveView('today');
    window.scrollTo({ top: 0 });
  };

  const rememberVideoPosition = useCallback((videoId: string, position: VideoResumePosition) => {
    const nextState = withVideoPosition(videoSessionStateRef.current, videoId, position);
    videoSessionStateRef.current = nextState;
    saveVideoSession(nextState);
  }, []);

  const selectSentence = (index: number) => {
    setActiveSentenceIndex(index);
    setMode('sentence');
    setPlayRequestId((id) => id + 1);
  };

  const goNextSentence = () => {
    if (!lesson) return;
    setActiveSentenceIndex((index) => Math.min(index + 1, lesson.sentences.length - 1));
    setMode('sentence');
    setPlayRequestId((id) => id + 1);
  };

  const selectSegment = () => {
    setMode('segment');
    setPlayRequestId((id) => id + 1);
  };

  const followSentence = useCallback((index: number) => setActiveSentenceIndex(index), []);

  const startDailySession = (session: DailySession, index: number) => {
    if (index > unlockedSessionIndex) return;
    activateDailySession(session, index, true);
    setProgress((currentProgress) => ({
      ...currentProgress,
      activeSessionId: session.id,
      updatedAt: new Date().toISOString(),
    }));
    setActiveView('today');
  };

  const startTodaysSession = () => {
    const session = dailySessions[activeSessionIndex] ?? dailySessions[0];
    if (session) startDailySession(session, activeSessionIndex);
  };

  const completeActiveSession = () => {
    const currentSession = dailySessions[activeSessionIndex] ?? dailySessions[0];
    if (!currentSession || !activeCourse) return;
    const nextCompletedIds = Array.from(
      new Set([...progress.completedSessionIds, currentSession.id])
    );
    const nextCompletedSet = new Set(nextCompletedIds);
    const nextSessionIndex = getUnlockedSessionIndex(dailySessions, nextCompletedSet);
    const nextSession = dailySessions[nextSessionIndex] ?? currentSession;
    const nextVocab = collectSessionVocab(
      activeCourse.lessons[currentSession.lessonIndex],
      currentSession,
      progress.vocab,
      activeCourse.id
    );
    setProgress({
      ...progress,
      completedSessionIds: nextCompletedIds,
      activeSessionId: nextSession.id,
      updatedAt: new Date().toISOString(),
      vocab: nextVocab,
      practiceDates: Array.from(new Set([...progress.practiceDates, localDateKey(new Date())])),
    });
    activateDailySession(nextSession, nextSessionIndex, false);
  };

  const resetProgress = () => {
    if (!window.confirm('重置会清空练习进度、生词本和打卡记录，确定吗？')) return;
    const firstSession = dailySessions[0];
    setProgress(emptyLearningProgress(firstSession?.id ?? null));
    if (firstSession) activateDailySession(firstSession, 0, false);
    setActiveView('today');
  };

  const toggleVocabTerm = (keyword: Keyword) => {
    setProgress((currentProgress) => {
      const exists = currentProgress.vocab.some((entry) => entry.term === keyword.term);
      if (exists) {
        return {
          ...currentProgress,
          vocab: currentProgress.vocab.filter((entry) => entry.term !== keyword.term),
        };
      }
      return {
        ...currentProgress,
        vocab: mergeVocabEntries({
          currentVocab: currentProgress.vocab,
          keywords: [keyword],
          lessonId: lesson?.id ?? '',
          day: activeSessionIndex + 1,
          courseId: activeCourse?.id,
        }),
      };
    });
  };

  const setVocabMastery = (term: string, mastery: VocabMastery) => {
    setProgress((currentProgress) => ({
      ...currentProgress,
      vocab: currentProgress.vocab.map((entry) =>
        entry.term === term ? { ...entry, mastery } : entry
      ),
      updatedAt: new Date().toISOString(),
    }));
  };

  const returnVideoToLibrary = () => {
    requestLessons();
    setActiveVideoId(null);
    setActiveView('library');
    window.scrollTo({ top: 0 });
  };

  const selectLibrarySentence = (sessionIndex: number, sentenceIndex: number) => {
    if (sessionIndex > unlockedSessionIndex) return;
    const targetSession = dailySessions[sessionIndex];
    setActiveSessionIndex(sessionIndex);
    setActiveSentenceIndex(sentenceIndex);
    setMode('sentence');
    setPlayRequestId((id) => id + 1);
    setProgress((currentProgress) => ({
      ...currentProgress,
      activeSessionId: targetSession?.id ?? currentProgress.activeSessionId,
      updatedAt: new Date().toISOString(),
    }));
    setActiveView('today');
    window.scrollTo({ top: 0 });
  };

  const vocabTerms = useMemo(
    () => new Set(progress.vocab.map((entry) => entry.term)),
    [progress.vocab]
  );
  const resumePosition = activeVideo
    ? videoSessionStateRef.current.positions[activeVideo.id]
    : undefined;
  const { exportBackup, importBackup } = createProgressBackupActions({
    progress,
    courses,
    validSessionIds: allValidSessionIds,
    setProgress,
    setActiveCourseId,
    setActiveSessionIndex,
    activateDailySession,
  });

  return {
    navigation: { activeView, onSwitchView: switchView },
    course: {
      status: lessonLoadState.status,
      ready: courseRuntimeReady,
      courses,
      activeCourse,
      activeCourseId: activeCourse?.id ?? '',
      sessions: dailySessions,
      activeSessionIndex,
      completedSessionIds,
      completedSessionCount,
      unlockedSessionIndex,
    },
    video: { summaries: videoSummaries, activeVideo, activeVideoId, resumePosition },
    practice: {
      lesson,
      sentence: activeSentence,
      sentenceIndex: activeSentenceIndex,
      mode,
      playRequestId,
      vocabTerms,
    },
    progress,
    metrics: {
      streakDays,
      sourceSeconds,
      totalSessionCount,
      totalCompletedCount,
      courseNameById,
    },
    actions: {
      onRequestLessons: requestLessons,
      onRetryLessons: retryLessons,
      onSwitchCourse: switchCourse,
      onSwitchVideo: switchVideo,
      onRememberVideoPosition: rememberVideoPosition,
      onReturnVideoToLibrary: returnVideoToLibrary,
      onStartDailySession: startDailySession,
      onStartTodaysSession: startTodaysSession,
      onCompleteActiveSession: completeActiveSession,
      onSelectSentence: selectSentence,
      onSelectSegment: selectSegment,
      onNextSentence: goNextSentence,
      onFollowSentence: followSentence,
      onModeChange: setMode,
      onSelectLibrarySentence: selectLibrarySentence,
      onToggleVocabTerm: toggleVocabTerm,
      onSetVocabMastery: setVocabMastery,
      onRemoveVocabTerm: (term) => toggleVocabTermById(term, setProgress),
      onExport: exportBackup,
      onImport: importBackup,
      onReset: resetProgress,
    },
  };
}

function useInitialValue<T>(load: () => T): T {
  const valueRef = useRef<{ value: T } | null>(null);
  if (!valueRef.current) valueRef.current = { value: load() };
  return valueRef.current.value;
}

function resolveInitialVideoId(session: VideoSessionLoadResult, courseId: string): string | null {
  if (session.status === 'missing') return COURSE_SUPERSEDED_BY_VIDEO[courseId] ?? null;
  return session.state.activeVideoId;
}
