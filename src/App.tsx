import { BookOpen, CalendarCheck, Download, Flame, Headphones, Target, User } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BilingualStudio } from './components/BilingualStudio';
import { COURSE_SUPERSEDED_BY_VIDEO, MaterialBar } from './components/MaterialBar';
import { videoSummaries } from './data/videos';
import type {
  DailySession,
  Keyword,
  Lesson,
  LearningProgress,
  MainView,
  PracticeMode,
  VocabMastery,
} from './types';
import { buildCourses } from './courses';
import {
  collectSessionVocab,
  completedPrefixCount,
  getInitialSessionIndex,
  getUnlockedSessionIndex,
  mergeVocabEntries,
  toggleVocabTermById,
} from './progress/session';
import {
  computeStreak,
  emptyLearningProgress,
  loadLearningProgress,
  localDateKey,
  migrateLegacyProgress,
  normalizeProgress,
  saveLearningProgress,
} from './progress/storage';
import {
  loadVideoSession,
  saveVideoSession,
  withActiveVideo,
  withVideoPosition,
  type VideoResumePosition,
  type VideoSessionLoadResult,
  type VideoSessionState,
} from './progress/videoSession';
import { CoachPanel } from './views/CoachPanel';
import { LibraryView } from './views/LibraryView';
import { MeView } from './views/MeView';
import { Sidebar } from './views/Sidebar';
import { ListeningWorkspace, SentenceStrip, TodayFocusCard } from './views/TodayView';
import { VocabView } from './views/VocabView';

const VALID_VIDEO_IDS = videoSummaries.map((video) => video.id);
const DEFAULT_COURSE_ID = Object.keys(COURSE_SUPERSEDED_BY_VIDEO)[0] ?? '';
const LESSON_RETRY_VIEW_KEY = 'climb-english-lesson-retry-view';

type LessonLoadState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; lessons: Lesson[] }
  | { status: 'failed' };

type LessonRetryIntent = { requested: boolean; view: MainView };

export function App() {
  const initialLearningProgressRef = useRef<LearningProgress | null>(null);
  if (!initialLearningProgressRef.current) {
    initialLearningProgressRef.current = loadLearningProgress();
  }
  const initialLearningProgress = initialLearningProgressRef.current;
  const initialCourseId = inferInitialCourseId(initialLearningProgress);

  const initialVideoSessionRef = useRef<VideoSessionLoadResult | null>(null);
  if (!initialVideoSessionRef.current) {
    initialVideoSessionRef.current = loadVideoSession(VALID_VIDEO_IDS);
  }
  const initialVideoSession = initialVideoSessionRef.current;
  const fallbackVideoId = COURSE_SUPERSEDED_BY_VIDEO[initialCourseId] ?? null;
  const initialVideoId =
    initialVideoSession.status === 'missing'
      ? fallbackVideoId
      : initialVideoSession.state.activeVideoId;
  const videoSessionStateRef = useRef<VideoSessionState>(initialVideoSession.state);

  const [lessonLoadState, setLessonLoadState] = useState<LessonLoadState>({ status: 'idle' });
  const lessonLoadStartedRef = useRef(false);
  const requestLessons = useCallback(() => {
    if (lessonLoadStartedRef.current) return;
    lessonLoadStartedRef.current = true;
    setLessonLoadState({ status: 'loading' });
    void import('./data/lessons').then(
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
  const initialRetryIntentRef = useRef<LessonRetryIntent | null>(null);
  if (!initialRetryIntentRef.current) {
    initialRetryIntentRef.current = loadLessonRetryIntent();
  }
  const initialRetryIntent = initialRetryIntentRef.current;
  const initialView = initialRetryIntent.view;
  const [activeView, setActiveView] = useState<MainView>(initialView);
  // 视频素材（卡拉OK工作台）：null = 课程素材模式。持久化的课程若已被
  // 卡拉OK重切版取代，启动时直接进入取代它的视频素材。这个判断只读轻量
  // 本地进度，不等待课程数据，因此视频首屏不会请求 lessons 分包。
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
    if (lesson && activeSentenceIndex >= lesson.sentences.length) {
      setActiveSentenceIndex(0);
    }
  }, [activeSentenceIndex, lesson]);

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

  // 视频素材切换：素材栏是唯一的素材入口，选视频进入卡拉OK工作台，选课程回课程流程。
  const switchVideo = (videoId: string) => {
    if (videoId === activeVideoId) {
      setActiveView('today');
      window.scrollTo({ top: 0 });
      return;
    }
    setActiveVideoId(videoId);
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

  // Karaoke follow: playback-time driven highlight only. Never switches mode
  // or fires a replay, so segment playback keeps running uninterrupted while
  // the transcript (and coach target) track the sentence being spoken.
  const followSentence = useCallback((index: number) => {
    setActiveSentenceIndex(index);
  }, []);

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

  const startDailySession = (session: DailySession, index: number) => {
    if (index > unlockedSessionIndex) return;

    activateDailySession(session, index, true);
    setProgress((currentProgress) => ({
      ...currentProgress,
      activeSessionId: session.id,
      updatedAt: new Date().toISOString(),
    }));
  };

  const startTodaysSession = () => {
    const session = dailySessions[activeSessionIndex] ?? dailySessions[0];
    startDailySession(session, activeSessionIndex);
    setActiveView('today');
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
    const confirmed = window.confirm('重置会清空练习进度、生词本和打卡记录，确定吗？');
    if (!confirmed) return;

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
        vocab: mergeVocabEntries(
          currentProgress.vocab,
          [keyword],
          lesson?.id ?? '',
          activeSessionIndex + 1,
          activeCourse?.id
        ),
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

  const exportBackup = () => {
    const payload = {
      app: 'climb-english-studio',
      version: 2,
      exportedAt: new Date().toISOString(),
      progress,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `climb-english-backup-${localDateKey(new Date()).replace(/-/g, '')}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importBackup = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<{
          progress: LearningProgress;
        }> &
          Partial<LearningProgress>;
        const candidate = parsed.progress ?? parsed;
        if (
          !Array.isArray(candidate.completedSessionIds) ||
          candidate.completedSessionIds.some(
            (id) =>
              !allValidSessionIds.has(id) &&
              !id.match(/^daily-session-\d+$/) &&
              !courses.some((course) => id.startsWith(`${course.id}-day-`))
          )
        ) {
          window.alert('备份文件格式不对：缺少有效的练习进度。');
          return;
        }

        const confirmed = window.confirm('导入会覆盖当前进度、生词本和打卡记录，确定吗？');
        if (!confirmed) return;

        const restored = migrateLegacyProgress(normalizeProgress(candidate), courses);
        const restoredCourse =
          courses.find((item) => item.id === restored.activeCourseId) ??
          courses.find((item) =>
            item.sessions.some((session) => session.id === restored.activeSessionId)
          ) ??
          courses[0];
        const restoredSessions = restoredCourse?.sessions ?? [];
        const restoredIndex = getInitialSessionIndex(restoredSessions, restored);
        const restoredSession = restoredSessions[restoredIndex] ?? restoredSessions[0];
        setProgress({ ...restored, activeCourseId: restoredCourse?.id ?? null });
        setActiveCourseId(restoredCourse?.id ?? '');
        setActiveSessionIndex(restoredIndex);
        if (restoredSession) activateDailySession(restoredSession, restoredIndex, false);
        window.alert('导入成功。');
      } catch {
        window.alert('备份文件解析失败，请确认选择的是导出的 JSON 文件。');
      }
    };
    reader.readAsText(file);
  };

  const vocabTerms = useMemo(
    () => new Set(progress.vocab.map((entry) => entry.term)),
    [progress.vocab]
  );

  return (
    <div
      className={`app-shell ${activeView === 'today' && activeVideo ? 'video-learning-mode' : ''}`}
    >
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">CE</span>
          <div>
            <p className="eyebrow">Real IFSC Commentary</p>
            <h1>Climb English Studio</h1>
          </div>
        </div>
        <div className="topbar-stats">
          <span className="stat-chip">
            <Target size={15} aria-hidden="true" />
            {courseRuntimeReady
              ? `${completedSessionCount}/${dailySessions.length} 天`
              : '视频模式'}
          </span>
          <span className="stat-chip streak">
            <Flame size={15} aria-hidden="true" />
            连续 {streakDays} 天
          </span>
          <button className="icon-text-button" type="button" onClick={exportBackup}>
            <Download size={15} aria-hidden="true" />
            <span>导出</span>
          </button>
        </div>
      </header>

      <MaterialBar
        courses={courseRuntimeReady ? courses : []}
        activeCourseId={activeCourse?.id ?? ''}
        completedSessionIds={completedSessionIds}
        onSelectCourse={switchCourse}
        videos={videoSummaries}
        activeVideoId={activeVideoId}
        onSelectVideo={switchVideo}
      />

      <nav className="view-nav" aria-label="主导航">
        <ViewTabButton
          active={activeView === 'today'}
          label="今天"
          icon={<CalendarCheck size={17} aria-hidden="true" />}
          onClick={() => switchView('today')}
        />
        <ViewTabButton
          active={activeView === 'library'}
          label="听力"
          icon={<Headphones size={17} aria-hidden="true" />}
          onClick={() => switchView('library')}
        />
        <ViewTabButton
          active={activeView === 'vocab'}
          label="生词本"
          icon={<BookOpen size={17} aria-hidden="true" />}
          badge={progress.vocab.length || undefined}
          onClick={() => switchView('vocab')}
        />
        <ViewTabButton
          active={activeView === 'me'}
          label="我的"
          icon={<User size={17} aria-hidden="true" />}
          onClick={() => switchView('me')}
        />
      </nav>

      <main className="app-body">
        {courseRuntimeReady ? (
          <Sidebar
            sessions={dailySessions}
            activeSessionIndex={activeSessionIndex}
            completedSessionIds={completedSessionIds}
            completedSessionCount={completedSessionCount}
            unlockedSessionIndex={unlockedSessionIndex}
            streakDays={streakDays}
            practiceDates={progress.practiceDates}
            onStartDailySession={(session, index) => {
              startDailySession(session, index);
              setActiveView('today');
            }}
          />
        ) : (
          <CourseSidebarPlaceholder
            status={lessonLoadState.status}
            onRequest={requestLessons}
            onRetry={retryLessons}
          />
        )}

        {activeVideo ? (
          <div
            className="video-studio-preserver"
            hidden={activeView !== 'today'}
            aria-hidden={activeView !== 'today'}
          >
            <BilingualStudio
              key={activeVideo.id}
              summaries={[activeVideo]}
              hideLibraryStrip
              isActive={activeView === 'today'}
              resumePosition={videoSessionStateRef.current.positions[activeVideo.id]}
              onPositionChange={rememberVideoPosition}
              onReturnToLibrary={() => {
                requestLessons();
                setActiveVideoId(null);
                setActiveView('library');
                window.scrollTo({ top: 0 });
              }}
            />
          </div>
        ) : null}

        {!courseRuntimeReady && (activeView !== 'today' || !activeVideo) ? (
          <LessonLoadStatus
            status={lessonLoadState.status}
            onRequest={requestLessons}
            onRetry={retryLessons}
          />
        ) : null}

        {courseRuntimeReady && activeView === 'today' && !activeVideo && lesson && activeSentence ? (
          <section className="main-pane" aria-label="今日练习">
            <TodayFocusCard
              session={dailySessions[activeSessionIndex] ?? dailySessions[0]}
              sessions={dailySessions}
              completedSessionIds={completedSessionIds}
              completedSessionCount={completedSessionCount}
              unlockedSessionIndex={unlockedSessionIndex}
              onStart={startTodaysSession}
              onComplete={completeActiveSession}
            />
            <SentenceStrip
              lesson={lesson}
              activeSentenceIndex={activeSentenceIndex}
              mode={mode}
              onSelectSentence={selectSentence}
              onSelectSegment={selectSegment}
            />
            <ListeningWorkspace
              lesson={lesson}
              sentence={activeSentence}
              sentenceIndex={activeSentenceIndex}
              mode={mode}
              playRequestId={playRequestId}
              onModeChange={setMode}
              onSelectSegment={selectSegment}
              onSelectSentence={selectSentence}
              onNextSentence={goNextSentence}
              onFollowSentence={followSentence}
            />
            <CoachPanel
              lesson={lesson}
              sentence={activeSentence}
              mode={mode}
              currentDay={activeSessionIndex + 1}
              vocabTerms={vocabTerms}
              onToggleVocabTerm={toggleVocabTerm}
            />
          </section>
        ) : null}

        {courseRuntimeReady && activeView === 'library' && activeCourse ? (
          <LibraryView
            lessons={activeCourse.lessons}
            sessions={dailySessions}
            activeSessionIndex={activeSessionIndex}
            completedSessionIds={completedSessionIds}
            unlockedSessionIndex={unlockedSessionIndex}
            courseName={activeCourse.name}
            onStartDailySession={(session, index) => {
              startDailySession(session, index);
              setActiveView('today');
            }}
            onSelectSentence={(sessionIndex, sentenceIndex) => {
              const targetSession = dailySessions[sessionIndex];
              if (sessionIndex > unlockedSessionIndex) return;
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
            }}
          />
        ) : null}

        {courseRuntimeReady && activeView === 'vocab' ? (
          <VocabView
            vocab={progress.vocab}
            courseNameById={courseNameById}
            onSetMastery={setVocabMastery}
            onRemove={(term) => toggleVocabTermById(term, setProgress)}
          />
        ) : null}

        {courseRuntimeReady && activeView === 'me' ? (
          <MeView
            sessions={dailySessions}
            sourceSeconds={sourceSeconds}
            courseCount={courses.length}
            totalSessionCount={totalSessionCount}
            totalCompletedCount={totalCompletedCount}
            completedSessionCount={completedSessionCount}
            streakDays={streakDays}
            practiceDates={progress.practiceDates}
            vocabCount={progress.vocab.length}
            masteredCount={progress.vocab.filter((entry) => entry.mastery === 2).length}
            onExport={exportBackup}
            onImport={importBackup}
            onReset={resetProgress}
          />
        ) : null}
      </main>
    </div>
  );
}

function CourseSidebarPlaceholder({
  status,
  onRequest,
  onRetry,
}: {
  status: LessonLoadState['status'];
  onRequest: () => void;
  onRetry: () => void;
}) {
  return (
    <aside className="sidebar" aria-label="课程进度">
      <section className="sidebar-card">
        <div className="panel-heading">
          <Target size={16} aria-hidden="true" />
          <span>课程练习</span>
        </div>
        <p className="library-note">
          {status === 'loading'
            ? '正在按需加载课程数据…'
            : status === 'failed'
              ? '课程数据暂时不可用，视频练习不受影响。'
              : '视频模式不会预载课程数据，需要时再加载。'}
        </p>
        {status === 'failed' ? (
          <button className="control-button" type="button" onClick={onRetry}>
            重试加载
          </button>
        ) : (
          <button
            className="control-button"
            type="button"
            disabled={status === 'loading'}
            onClick={onRequest}
          >
            {status === 'loading' ? '加载中…' : '加载课程练习'}
          </button>
        )}
      </section>
    </aside>
  );
}

function LessonLoadStatus({
  status,
  onRequest,
  onRetry,
}: {
  status: LessonLoadState['status'];
  onRequest: () => void;
  onRetry: () => void;
}) {
  return (
    <section className="main-pane empty-state" aria-label="课程数据状态">
      {status === 'failed' ? (
        <div role="alert">
          <h2>课程数据加载失败</h2>
          <p>网络或课程分包暂时不可用。已保存的学习和视频位置不会丢失。</p>
          <button
            className="control-button primary"
            type="button"
            onClick={onRetry}
          >
            重试加载
          </button>
        </div>
      ) : status === 'loading' ? (
        <p role="status">正在加载课程数据…</p>
      ) : (
        <div>
          <p>课程数据尚未加载。</p>
          <button className="control-button primary" type="button" onClick={onRequest}>
            加载课程练习
          </button>
        </div>
      )}
    </section>
  );
}

function inferInitialCourseId(progress: LearningProgress): string {
  if (progress.activeCourseId) return progress.activeCourseId;
  const matchingCourseId = Object.keys(COURSE_SUPERSEDED_BY_VIDEO).find((courseId) =>
    progress.activeSessionId?.startsWith(`${courseId}-day-`)
  );
  return matchingCourseId ?? DEFAULT_COURSE_ID;
}

function loadLessonRetryIntent(): LessonRetryIntent {
  if (typeof window === 'undefined') return { requested: false, view: 'today' };
  try {
    const value = window.sessionStorage.getItem(LESSON_RETRY_VIEW_KEY);
    const view =
      value === 'today' || value === 'library' || value === 'vocab' || value === 'me'
        ? value
        : 'today';
    return { requested: value !== null, view };
  } catch {
    return { requested: false, view: 'today' };
  }
}

function saveLessonRetryView(view: MainView): void {
  try {
    window.sessionStorage.setItem(LESSON_RETRY_VIEW_KEY, view);
  } catch {
    // A reload still returns to the video if session storage is unavailable.
  }
}

function clearLessonRetryView(): void {
  try {
    window.sessionStorage.removeItem(LESSON_RETRY_VIEW_KEY);
  } catch {
    // Storage restrictions do not block course loading.
  }
}

function ViewTabButton({
  active,
  label,
  icon,
  badge,
  onClick,
}: {
  active: boolean;
  label: string;
  icon: React.ReactNode;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button className={`view-tab ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      {icon}
      <span>{label}</span>
      {badge ? <span className="view-tab-badge">{badge}</span> : null}
    </button>
  );
}
