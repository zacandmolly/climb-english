import {
  BookOpen,
  CalendarCheck,
  Captions,
  CheckCircle2,
  ChevronRight,
  CircleStop,
  Clock3,
  Download,
  Flame,
  Gauge,
  Headphones,
  ListMusic,
  LockKeyhole,
  Mic,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Star,
  Target,
  Trash2,
  Trophy,
  Upload,
  User,
  Volume2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BilingualStudio } from './components/BilingualStudio';
import { COURSE_SUPERSEDED_BY_VIDEO, MaterialBar } from './components/MaterialBar';
import { lessons } from './data/lessons';
import { videoSummaries } from './data/videos';
import type { Feedback, Keyword, Lesson, PracticeSentence, VideoSummary } from './types';
import { DAILY_SESSION_MINUTES, HEATMAP_DAYS, LISTENING_GOAL_MINUTES, LOW_INPUT_LEVEL } from './constants';
import { encodeWav, formatBytes, getRecordingErrorMessage, mergeFloat32Arrays } from './lib/audio';
import { FEEDBACK_API_BASE, isStaticFeedbackHost, makeClientDemoFeedback } from './lib/feedback';
import { fullTranscript, fullTranslation, parseMediaSource, segmentPatterns, sentenceIndexAtMediaTime, uniqueKeywords } from './lib/lesson';
import { formatDuration, formatTime, HighlightedText, resolveStaticAssetUrl } from './lib/ui';
import { END_PAD_SECONDS, PRE_ROLL_SECONDS } from './players/playback';
import { LocalVideoPlayer } from './players/LocalVideoPlayer';
import { YouTubePlayer } from './players/YouTubePlayer';
import { buildCourses } from './courses';
import { collectSessionVocab, completedPrefixCount, getInitialSessionIndex, getUnlockedSessionIndex, mergeVocabEntries, toggleVocabTermById } from './progress/session';
import { computeStreak, emptyLearningProgress, loadLearningProgress, localDateKey, migrateLegacyProgress, normalizeProgress, saveLearningProgress } from './progress/storage';

type PracticeMode = 'sentence' | 'segment';
type MainView = 'today' | 'library' | 'vocab' | 'me';
type VocabMastery = 0 | 1 | 2;

type DailySession = {
  id: string;
  day: number;
  title: string;
  lessonIndex: number;
  mode: PracticeMode;
  sentenceIndexes: number[];
  goal: string;
  steps: string[];
};

type VocabEntry = {
  term: string;
  zh: string;
  example: string;
  lessonId: string;
  day: number;
  courseId?: string;
  addedAt: string;
  mastery: VocabMastery;
};

type LearningProgress = {
  completedSessionIds: string[];
  activeSessionId: string | null;
  activeCourseId?: string | null;
  updatedAt: string | null;
  vocab: VocabEntry[];
  practiceDates: string[];
};

export type Course = {
  id: string;
  name: string;
  competition: string;
  discipline: string;
  lessons: Lesson[];
  sessions: DailySession[];
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: {
    transcript: string;
  };
};

export function App() {
  const courses = useMemo(() => buildCourses(lessons), []);
  const initialLearningStateRef = useRef<{
    progress: LearningProgress;
    courseId: string;
    sessionIndex: number;
  } | null>(null);

  if (!initialLearningStateRef.current) {
    const migrated = migrateLegacyProgress(loadLearningProgress(), courses);
    const course =
      courses.find((item) => item.id === migrated.activeCourseId) ?? courses[0];
    initialLearningStateRef.current = {
      progress: { ...migrated, activeCourseId: course?.id ?? null },
      courseId: course?.id ?? '',
      sessionIndex: getInitialSessionIndex(course?.sessions ?? [], migrated),
    };
  }

  const [progress, setProgress] = useState<LearningProgress>(
    initialLearningStateRef.current.progress,
  );
  const [activeCourseId, setActiveCourseId] = useState(
    initialLearningStateRef.current.courseId,
  );
  const activeCourse =
    courses.find((item) => item.id === activeCourseId) ?? courses[0];
  const dailySessions = activeCourse?.sessions ?? [];
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(0);
  const [activeSessionIndex, setActiveSessionIndex] = useState(
    initialLearningStateRef.current.sessionIndex,
  );
  const [mode, setMode] = useState<PracticeMode>('sentence');
  const [playRequestId, setPlayRequestId] = useState(0);
  const [activeView, setActiveView] = useState<MainView>('today');
  // 视频素材（卡拉OK工作台）：null = 课程素材模式。持久化的课程若已被
  // 卡拉OK重切版取代，启动时直接进入取代它的视频素材。
  const initialVideoId =
    COURSE_SUPERSEDED_BY_VIDEO[initialLearningStateRef.current.courseId] ?? null;
  const [activeVideoId, setActiveVideoId] = useState<string | null>(initialVideoId);
  const activeVideo = useMemo(
    () => (activeVideoId ? videoSummaries.find((video) => video.id === activeVideoId) ?? null : null),
    [activeVideoId],
  );
  const activeSession = dailySessions[activeSessionIndex] ?? dailySessions[0];
  const lesson =
    activeCourse?.lessons[activeSession?.lessonIndex ?? 0] ?? activeCourse?.lessons[0];
  const activeSentence = lesson?.sentences[activeSentenceIndex] ?? lesson?.sentences[0];
  const completedSessionIds = useMemo(
    () => new Set(progress.completedSessionIds),
    [progress.completedSessionIds],
  );
  const completedSessionCount = completedPrefixCount(dailySessions, completedSessionIds);
  const unlockedSessionIndex = getUnlockedSessionIndex(dailySessions, completedSessionIds);
  const streakDays = useMemo(
    () => computeStreak(progress.practiceDates),
    [progress.practiceDates],
  );
  const allValidSessionIds = useMemo(
    () => new Set(courses.flatMap((course) => course.sessions.map((session) => session.id))),
    [courses],
  );
  const totalSessionCount = courses.reduce((total, course) => total + course.sessions.length, 0);
  const totalCompletedCount = progress.completedSessionIds.filter((id) =>
    allValidSessionIds.has(id),
  ).length;
  const courseNameById = useMemo(
    () => Object.fromEntries(courses.map((course) => [course.id, course.name])),
    [courses],
  );

  useEffect(() => {
    saveLearningProgress(progress);
  }, [progress]);

  useEffect(() => {
    if (lesson && activeSentenceIndex >= lesson.sentences.length) {
      setActiveSentenceIndex(0);
    }
  }, [activeSentenceIndex, lesson]);

  const switchCourse = (courseId: string) => {
    const course = courses.find((item) => item.id === courseId);
    if (!course || course.id === activeCourse?.id) return;

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
      new Set([...progress.completedSessionIds, currentSession.id]),
    );
    const nextCompletedSet = new Set(nextCompletedIds);
    const nextSessionIndex = getUnlockedSessionIndex(dailySessions, nextCompletedSet);
    const nextSession = dailySessions[nextSessionIndex] ?? currentSession;
    const nextVocab = collectSessionVocab(
      activeCourse.lessons[currentSession.lessonIndex],
      currentSession,
      progress.vocab,
      activeCourse.id,
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
          activeCourse?.id,
        ),
      };
    });
  };

  const setVocabMastery = (term: string, mastery: VocabMastery) => {
    setProgress((currentProgress) => ({
      ...currentProgress,
      vocab: currentProgress.vocab.map((entry) =>
        entry.term === term ? { ...entry, mastery } : entry,
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
        }> & Partial<LearningProgress>;
        const candidate = parsed.progress ?? parsed;
        if (
          !Array.isArray(candidate.completedSessionIds) ||
          candidate.completedSessionIds.some(
            (id) =>
              !allValidSessionIds.has(id) &&
              !id.match(/^daily-session-\d+$/) &&
              !courses.some((course) => id.startsWith(`${course.id}-day-`)),
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
            item.sessions.some((session) => session.id === restored.activeSessionId),
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
    [progress.vocab],
  );

  return (
    <div className="app-shell">
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
            {completedSessionCount}/{dailySessions.length} 天
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
        courses={courses}
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

        {activeView === 'today' && activeVideo ? (
          <BilingualStudio
            key={activeVideo.id}
            summaries={[activeVideo]}
            hideLibraryStrip
          />
        ) : null}

        {activeView === 'today' && !activeVideo && lesson && activeSentence ? (
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

        {activeView === 'library' && activeCourse ? (
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

        {activeView === 'vocab' ? (
          <VocabView
            vocab={progress.vocab}
            courseNameById={courseNameById}
            onSetMastery={setVocabMastery}
            onRemove={(term) => toggleVocabTermById(term, setProgress)}
          />
        ) : null}

        {activeView === 'me' ? (
          <MeView
            sessions={dailySessions}
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

function Sidebar({
  sessions,
  activeSessionIndex,
  completedSessionIds,
  completedSessionCount,
  unlockedSessionIndex,
  streakDays,
  practiceDates,
  onStartDailySession,
}: {
  sessions: DailySession[];
  activeSessionIndex: number;
  completedSessionIds: Set<string>;
  completedSessionCount: number;
  unlockedSessionIndex: number;
  streakDays: number;
  practiceDates: string[];
  onStartDailySession: (session: DailySession, index: number) => void;
}) {
  const planProgress = (completedSessionCount / sessions.length) * 100;

  return (
    <aside className="sidebar" aria-label="课程进度">
      <section className="sidebar-card">
        <div className="panel-heading">
          <Target size={16} aria-hidden="true" />
          <span>学习进度</span>
        </div>
        <div className="progress-ring-row">
          <ProgressRing percent={planProgress} label={`${completedSessionCount}/${sessions.length}`} />
          <div className="progress-ring-meta">
            <strong>已完成 {completedSessionCount} 天</strong>
            <span>
              <Flame size={13} aria-hidden="true" /> 连续 {streakDays} 天
            </span>
          </div>
        </div>
        <Heatmap practiceDates={practiceDates} days={HEATMAP_DAYS} />
      </section>

      <section className="sidebar-card">
        <div className="panel-heading">
          <CalendarCheck size={16} aria-hidden="true" />
          <span>每日 5 分钟课程链</span>
        </div>
        <div className="course-chain">
          {sessions.map((session, index) => {
            const isCompleted = completedSessionIds.has(session.id);
            const isLocked = index > unlockedSessionIndex;
            const isActive = index === activeSessionIndex;

            return (
              <button
                className={`course-node ${isActive ? 'active' : ''} ${
                  isCompleted ? 'completed' : ''
                } ${isLocked ? 'locked' : ''}`}
                disabled={isLocked}
                key={session.id}
                type="button"
                onClick={() => onStartDailySession(session, index)}
              >
                <span className="course-marker">
                  {isCompleted ? (
                    <CheckCircle2 size={15} aria-hidden="true" />
                  ) : isLocked ? (
                    <LockKeyhole size={13} aria-hidden="true" />
                  ) : (
                    `D${session.day}`
                  )}
                </span>
                <span className="course-info">
                  <strong>{session.title}</strong>
                  <small>
                    {isCompleted ? '已完成，可复习' : isLocked ? '完成前一天解锁' : '可练习'}
                  </small>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      <section className="sidebar-card method-compact">
        <div className="panel-heading">
          <BookOpen size={16} aria-hidden="true" />
          <span>方法论</span>
        </div>
        <p className="method-lead-compact">
          建立英文声音和文字的直接联系，不依赖翻译。
        </p>
        <ol className="method-steps-compact">
          <li>无字幕反复听</li>
          <li>看逐字稿，大声朗读</li>
          <li>回原音，把声音和文字连起来</li>
        </ol>
      </section>
    </aside>
  );
}

function ProgressRing({ percent, label }: { percent: number; label: string }) {
  const radius = 26;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - Math.min(1, Math.max(0, percent / 100)));

  return (
    <div className="progress-ring" role="img" aria-label={`进度 ${label}`}>
      <svg viewBox="0 0 64 64" width="64" height="64">
        <circle cx="32" cy="32" r={radius} fill="none" stroke="#d7cfbf" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={radius}
          fill="none"
          stroke="#0e7c7b"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 32 32)"
        />
        <text x="32" y="33" textAnchor="middle" dominantBaseline="central" className="ring-text">
          {label}
        </text>
      </svg>
    </div>
  );
}

function Heatmap({ practiceDates, days }: { practiceDates: string[]; days: number }) {
  const dateSet = useMemo(() => new Set(practiceDates), [practiceDates]);
  const cells = useMemo(() => {
    const result: { key: string; practiced: boolean; label: string }[] = [];
    const today = new Date();
    for (let offset = days - 1; offset >= 0; offset -= 1) {
      const date = new Date(today);
      date.setDate(today.getDate() - offset);
      const key = localDateKey(date);
      result.push({
        key,
        practiced: dateSet.has(key),
        label: `${key}${dateSet.has(key) ? ' 已练习' : ' 未练习'}`,
      });
    }
    return result;
  }, [dateSet, days]);

  return (
    <div className="heatmap" aria-label="最近练习热力图">
      {cells.map((cell) => (
        <span key={cell.key} className={cell.practiced ? 'hit' : ''} title={cell.label} />
      ))}
      <small className="heatmap-caption">最近 {days} 天</small>
    </div>
  );
}

function TodayFocusCard({
  session,
  sessions,
  completedSessionIds,
  completedSessionCount,
  unlockedSessionIndex,
  onStart,
  onComplete,
}: {
  session: DailySession;
  sessions: DailySession[];
  completedSessionIds: Set<string>;
  completedSessionCount: number;
  unlockedSessionIndex: number;
  onStart: () => void;
  onComplete: () => void;
}) {
  const isCompleted = completedSessionIds.has(session.id);
  const allCompleted = completedSessionCount >= sessions.length;
  const isLocked = sessions.findIndex((item) => item.id === session.id) > unlockedSessionIndex;

  return (
    <section className="focus-card" aria-label="今日练习焦点">
      <div className="focus-head">
        <div>
          <p className="focus-eyebrow">
            {isLocked ? '未解锁' : isCompleted ? '已完成，可复习' : '今天要练'}
          </p>
          <h2>
            Day {session.day} · {session.title}
          </h2>
        </div>
        <span className="focus-time">
          <Clock3 size={14} aria-hidden="true" />
          {DAILY_SESSION_MINUTES} 分钟
        </span>
      </div>
      <p className="focus-goal">{session.goal}</p>
      <ol className="focus-steps">
        {session.steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className="focus-actions">
        <button className="control-button primary" type="button" onClick={onStart}>
          <Play size={16} aria-hidden="true" />
          {isCompleted ? '复习今天的句子' : '开始练习'}
        </button>
        <button
          className="control-button"
          type="button"
          disabled={isCompleted || isLocked}
          onClick={onComplete}
        >
          <CheckCircle2 size={16} aria-hidden="true" />
          {allCompleted ? '全部完成' : `完成 Day ${session.day} 打卡`}
        </button>
      </div>
    </section>
  );
}

function SentenceStrip({
  lesson,
  activeSentenceIndex,
  mode,
  onSelectSentence,
  onSelectSegment,
}: {
  lesson: Lesson;
  activeSentenceIndex: number;
  mode: PracticeMode;
  onSelectSentence: (index: number) => void;
  onSelectSegment: () => void;
}) {
  return (
    <div className="sentence-strip" aria-label="练习块切换">
      {lesson.sentences.map((sentence, index) => (
        <button
          className={`strip-chip ${mode === 'sentence' && index === activeSentenceIndex ? 'active' : ''}`}
          key={sentence.id}
          type="button"
          onClick={() => onSelectSentence(index)}
        >
          {String(index + 1).padStart(2, '0')}
        </button>
      ))}
      <button
        className={`strip-chip segment ${mode === 'segment' ? 'active' : ''}`}
        type="button"
        onClick={onSelectSegment}
      >
        整段
      </button>
    </div>
  );
}

function ListeningWorkspace({
  lesson,
  sentence,
  sentenceIndex,
  mode,
  playRequestId,
  onModeChange,
  onSelectSegment,
  onSelectSentence,
  onNextSentence,
  onFollowSentence,
}: {
  lesson: Lesson;
  sentence: PracticeSentence;
  sentenceIndex: number;
  mode: PracticeMode;
  playRequestId: number;
  onModeChange: (mode: PracticeMode) => void;
  onSelectSegment: () => void;
  onSelectSentence: (index: number) => void;
  onNextSentence: () => void;
  onFollowSentence: (index: number) => void;
}) {
  const [showTranslation, setShowTranslation] = useState(true);
  const [followMediaTime, setFollowMediaTime] = useState<number | null>(null);
  const segmentListRef = useRef<HTMLDivElement | null>(null);
  const activeKeywords = mode === 'segment' ? uniqueKeywords(lesson.sentences) : sentence.keywords;
  const activeText = mode === 'segment' ? fullTranscript(lesson) : sentence.transcript;
  const activeTranslation =
    mode === 'segment' ? fullTranslation(lesson) : sentence.zhTranslation;
  const activeTip = mode === 'segment' ? lesson.segmentGoal : sentence.zhExplanation;
  const rangeStart = mode === 'segment' ? lesson.startTime : sentence.startTime;
  const rangeEnd = mode === 'segment' ? lesson.endTime : sentence.endTime;
  // In segment mode the range covers the whole lesson, so the key must NOT
  // include the active sentence id — the follow highlight advances the active
  // sentence during playback, and a changing key would re-trigger the seek-
  // to-preroll effect and pause/rewind the video mid-playback.
  const rangeKey =
    mode === 'segment' ? `${lesson.id}-segment` : `${lesson.id}-${mode}-${sentence.id}`;
  const terms = useMemo(() => activeKeywords.map((keyword) => keyword.term), [activeKeywords]);
  const hasNextSentence = sentenceIndex < lesson.sentences.length - 1;

  const handleTimeReport = useCallback((mediaTime: number) => {
    setFollowMediaTime(mediaTime);
  }, []);

  // Karaoke follow (segment mode only): map the reported playback time onto
  // the sentence timeline and let the transcript highlight follow the audio,
  // like the bilingual studio's cue player.
  const followIndex = useMemo(() => {
    if (mode !== 'segment' || followMediaTime == null) return null;
    return sentenceIndexAtMediaTime(lesson, followMediaTime);
  }, [mode, followMediaTime, lesson]);

  useEffect(() => {
    if (followIndex == null || followIndex === sentenceIndex) return;
    onFollowSentence(followIndex);
  }, [followIndex, sentenceIndex, onFollowSentence]);

  // Keep the spoken sentence pinned near the top of the segment transcript
  // list so it scrolls upward underneath the highlight during playback.
  useEffect(() => {
    if (mode !== 'segment') return;
    const list = segmentListRef.current;
    if (!list) return;
    const row = list.querySelector<HTMLElement>(`[data-sentence-index="${sentenceIndex}"]`);
    if (!row) return;
    const rowTop =
      row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    list.scrollTo({ top: Math.max(0, rowTop - 8), behavior: 'smooth' });
  }, [sentenceIndex, mode]);

  return (
    <section className="listen-pane" aria-label="听力练习台">
      <div className="clip-head">
        <div>
          <p className="eyebrow">{lesson.competition}</p>
          <h3>{mode === 'segment' ? '整段精听' : sentence.label}</h3>
          <p className="clip-subtitle">
            {lesson.discipline} / {lesson.athlete}
          </p>
        </div>
        <div className="mode-switch" aria-label="练习模式">
          <button
            className={mode === 'sentence' ? 'active' : ''}
            type="button"
            onClick={() => onModeChange('sentence')}
          >
            <Captions size={15} aria-hidden="true" />
            逐句练
          </button>
          <button
            className={mode === 'segment' ? 'active' : ''}
            type="button"
            onClick={onSelectSegment}
          >
            <ListMusic size={15} aria-hidden="true" />
            整段精听
          </button>
        </div>
      </div>

      {parseMediaSource(lesson.mediaUrl).kind === 'youtube' ? (
        <YouTubePlayer
          videoId={parseMediaSource(lesson.mediaUrl).videoId ?? ''}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          rangeKey={rangeKey}
          mode={mode}
          playRequestId={playRequestId}
          hasNextSentence={hasNextSentence}
          onNextSentence={onNextSentence}
          onTimeReport={handleTimeReport}
        />
      ) : (
        <LocalVideoPlayer
          mediaUrl={lesson.mediaUrl}
          mediaStartTime={lesson.mediaStartTime}
          rangeStart={rangeStart}
          rangeEnd={rangeEnd}
          rangeKey={rangeKey}
          mode={mode}
          playRequestId={playRequestId}
          hasNextSentence={hasNextSentence}
          onNextSentence={onNextSentence}
          onTimeReport={handleTimeReport}
        />
      )}

      <section className="transcript-panel">
        <div className="panel-heading spread">
          <span>
            <Captions size={16} aria-hidden="true" />
            {mode === 'segment' ? '整段练习稿' : `第 ${sentenceIndex + 1} 句练习稿`}
          </span>
          <button
            className="icon-text-button"
            type="button"
            onClick={() => setShowTranslation((value) => !value)}
            title="切换中文释义"
          >
            <BookOpen size={15} aria-hidden="true" />
            {showTranslation ? '隐藏中文' : '显示中文'}
          </button>
        </div>

        {mode === 'segment' ? (
          <div className="segment-transcript" ref={segmentListRef}>
            {lesson.sentences.map((item, index) => (
              <button
                className={index === sentenceIndex ? 'active' : ''}
                data-sentence-index={index}
                key={item.id}
                type="button"
                onClick={() => onSelectSentence(index)}
              >
                <span className="segment-index">{String(index + 1).padStart(2, '0')}</span>
                <span className="segment-line">
                  <HighlightedText text={item.transcript} terms={terms} />
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className={`transcript-text ${activeText.length > 180 ? 'compact' : ''}`}>
            <HighlightedText text={activeText} terms={terms} />
          </p>
        )}

        {showTranslation ? (
          <div className="translation-stack">
            <section className="translation-box">
              <h4>完整翻译</h4>
              <p>{activeTranslation}</p>
            </section>
            <section className="translation-box tip">
              <h4>重点提示</h4>
              <p>{activeTip}</p>
            </section>
          </div>
        ) : null}
      </section>
    </section>
  );
}

function CoachPanel({
  lesson,
  sentence,
  mode,
  currentDay,
  vocabTerms,
  onToggleVocabTerm,
}: {
  lesson: Lesson;
  sentence: PracticeSentence;
  mode: PracticeMode;
  currentDay: number;
  vocabTerms: Set<string>;
  onToggleVocabTerm: (keyword: Keyword) => void;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedBytes, setRecordedBytes] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [recordedPeakLevel, setRecordedPeakLevel] = useState(0);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioInputId, setSelectedAudioInputId] = useState('');
  const [activeInputLabel, setActiveInputLabel] = useState('系统默认麦克风');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [speechTranscript, setSpeechTranscript] = useState('');
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalSpeechTranscriptRef = useRef('');
  const interimSpeechTranscriptRef = useRef('');
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const pcmSampleCountRef = useRef(0);
  const recordingSampleRateRef = useRef(44100);
  const peakMicLevelRef = useRef(0);
  const activeKeywords = mode === 'segment' ? uniqueKeywords(lesson.sentences) : sentence.keywords;
  const targetSentence = mode === 'segment' ? fullTranscript(lesson) : sentence.transcript;
  const prompt = mode === 'segment' ? 'Listen to the whole passage, then retell the action in your own words.' : sentence.speakingPrompt;
  const patterns = mode === 'segment' ? segmentPatterns(lesson) : sentence.sentencePatterns;
  const selectedAudioInput = audioInputs.find((device) => device.deviceId === selectedAudioInputId);
  const displayedMicLevel = isRecording ? micLevel : recordedPeakLevel;
  const displayedMicPercent = Math.round(displayedMicLevel * 100);
  const isStaticFeedbackMode = useMemo(
    () => isStaticFeedbackHost() && !FEEDBACK_API_BASE,
    [],
  );

  const refreshAudioInputs = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((device) => device.kind === 'audioinput');
      setAudioInputs(inputs);
      setSelectedAudioInputId((currentDeviceId) =>
        currentDeviceId && !inputs.some((device) => device.deviceId === currentDeviceId)
          ? ''
          : currentDeviceId,
      );
    } catch {
      setAudioInputs([]);
    }
  }, []);

  const cleanupRecordingResources = () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    processorRef.current?.disconnect();
    mediaSourceRef.current?.disconnect();
    silentGainRef.current?.disconnect();
    processorRef.current = null;
    mediaSourceRef.current = null;
    silentGainRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    stopSpeechRecognition();

    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setMicLevel(0);
  };

  useEffect(() => {
    void refreshAudioInputs();

    const handleDeviceChange = () => {
      void refreshAudioInputs();
    };

    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, [refreshAudioInputs]);

  const startPcmRecorder = async (stream: MediaStream) => {
    const AudioContextConstructor =
      window.AudioContext ??
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextConstructor) {
      throw new Error('AudioContext is not supported.');
    }

    const audioContext = new AudioContextConstructor();
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;

    pcmChunksRef.current = [];
    pcmSampleCountRef.current = 0;
    peakMicLevelRef.current = 0;
    recordingSampleRateRef.current = audioContext.sampleRate;

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const chunk = new Float32Array(input.length);
      chunk.set(input);
      pcmChunksRef.current.push(chunk);
      pcmSampleCountRef.current += chunk.length;

      let sum = 0;
      for (const sample of chunk) sum += sample * sample;
      const rms = Math.sqrt(sum / chunk.length);
      const level = Math.min(1, rms * 8);
      peakMicLevelRef.current = Math.max(peakMicLevelRef.current, level);
      setMicLevel(level);
      setRecordedBytes(44 + pcmSampleCountRef.current * 2);
    };

    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);
    await audioContext.resume();

    audioContextRef.current = audioContext;
    mediaSourceRef.current = source;
    processorRef.current = processor;
    silentGainRef.current = silentGain;
  };

  const startSpeechRecognition = () => {
    const SpeechRecognition =
      (window as Window & typeof globalThis & {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
      }).SpeechRecognition ??
      (window as Window & typeof globalThis & {
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
      }).webkitSpeechRecognition;

    if (!SpeechRecognition) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let interim = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const text = result[0]?.transcript || '';
          if (result.isFinal) {
            finalSpeechTranscriptRef.current = `${finalSpeechTranscriptRef.current} ${text}`.trim();
          } else {
            interim += ` ${text}`;
          }
        }
        interimSpeechTranscriptRef.current = interim.trim();
        setSpeechTranscript(
          `${finalSpeechTranscriptRef.current} ${interimSpeechTranscriptRef.current}`.trim(),
        );
      };
      recognition.onerror = () => {
        interimSpeechTranscriptRef.current = '';
      };
      recognition.onend = () => {
        speechRecognitionRef.current = null;
      };
      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch {
      speechRecognitionRef.current = null;
    }
  };

  const stopSpeechRecognition = () => {
    const recognition = speechRecognitionRef.current;
    if (!recognition) return;
    speechRecognitionRef.current = null;
    try {
      recognition.onend = null;
      recognition.stop();
    } catch {
      // Browser speech recognition can throw if it already stopped.
    }
  };

  useEffect(() => {
    setRecordedBlob(null);
    setFeedback(null);
    setError(null);
    setRecordedBytes(0);
    setRecordingSeconds(0);
    setMicLevel(0);
    setRecordedPeakLevel(0);
    setAudioUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return null;
    });
    cleanupRecordingResources();

    return cleanupRecordingResources;
  }, [lesson.id, sentence.id, mode]);

  const startRecording = async () => {
    try {
      setError(null);
      setFeedback(null);
      setRecordedBlob(null);
      setRecordedBytes(0);
      setRecordingSeconds(0);
      setMicLevel(0);
      setRecordedPeakLevel(0);
      setSpeechTranscript('');
      finalSpeechTranscriptRef.current = '';
      interimSpeechTranscriptRef.current = '';
      setAudioUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return null;
      });

      if (!navigator.mediaDevices?.getUserMedia) {
        setError('当前浏览器不支持网页录音。请用最新版 Chrome 或 Edge 打开这个页面。');
        return;
      }

      const audioConstraints: MediaTrackConstraints = selectedAudioInputId
        ? {
            deviceId: { exact: selectedAudioInputId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        : {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      const [audioTrack] = stream.getAudioTracks();

      if (!audioTrack) {
        stream.getTracks().forEach((track) => track.stop());
        setError('浏览器没有返回可用的麦克风音轨。请换一个输入设备后再试。');
        return;
      }

      mediaStreamRef.current = stream;
      setActiveInputLabel(audioTrack.label || selectedAudioInput?.label || '系统默认麦克风');
      void refreshAudioInputs();
      await startPcmRecorder(stream);
      startSpeechRecognition();
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((seconds) => seconds + 1);
      }, 1000);
      setIsRecording(true);
    } catch (recordingError) {
      cleanupRecordingResources();
      setIsRecording(false);
      setError(getRecordingErrorMessage(recordingError));
    }
  };

  const stopRecording = () => {
    if (!isRecording) {
      cleanupRecordingResources();
      setIsRecording(false);
      return;
    }

    const blob = encodeWav(
      mergeFloat32Arrays(pcmChunksRef.current, pcmSampleCountRef.current),
      recordingSampleRateRef.current,
    );
    const peakLevel = peakMicLevelRef.current;
    cleanupRecordingResources();
    setIsRecording(false);
    setRecordedPeakLevel(peakLevel);
    setSpeechTranscript(
      `${finalSpeechTranscriptRef.current} ${interimSpeechTranscriptRef.current}`.trim(),
    );

    if (blob.size <= 44 || pcmSampleCountRef.current === 0) {
      setRecordedBlob(null);
      setRecordedBytes(0);
      setRecordedPeakLevel(0);
      setError('这次没有录到声音。请确认麦克风权限已允许，并靠近麦克风再录一遍。');
      return;
    }

    setRecordedBlob(blob);
    setRecordedBytes(blob.size);
    setAudioUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return URL.createObjectURL(blob);
    });
    setError(
      peakLevel < LOW_INPUT_LEVEL
        ? `录音文件已生成，但当前输入「${activeInputLabel}」几乎没有检测到声音。请在上方换一个麦克风，或检查系统输入设备。`
        : null,
    );
  };

  const sendFeedback = async () => {
    if (!recordedBlob) {
      setError('先录一遍，再让 AI 教练反馈。');
      return;
    }

    setError(null);
    setFeedback(makeClientDemoFeedback({ targetSentence, keywords: activeKeywords }));

    if (isStaticFeedbackMode) return;

    setIsSending(true);

    try {
      const formData = new FormData();
      formData.append('audio', recordedBlob, 'shadowing.wav');
      formData.append('clipId', `${lesson.id}:${mode}:${sentence.id}`);
      formData.append('targetSentence', targetSentence);
      formData.append('transcript', targetSentence);
      formData.append('keywords', activeKeywords.map((keyword) => keyword.term).join(', '));
      formData.append('durationSeconds', String(recordingSeconds));
      formData.append('recordedBytes', String(recordedBytes));
      formData.append('spokenText', speechTranscript);

      const response = await fetch(`${FEEDBACK_API_BASE}/api/speaking-feedback`, {
        method: 'POST',
        body: formData,
      });

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw new Error('Feedback API did not return JSON.');
      }

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Feedback request failed.');
      }
      setFeedback(payload);
    } catch {
      setFeedback(makeClientDemoFeedback({ targetSentence, keywords: activeKeywords }));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="coach-pane" aria-label="口语教练">
      <div className="panel-heading">
        <Sparkles size={16} aria-hidden="true" />
        <span>跟读这一句</span>
      </div>

      <section className="target-panel">
        <p className="target-label">
          {mode === 'segment' ? '复述整段' : 'Shadowing 目标句'}
        </p>
        <p className={mode === 'segment' ? 'target-sentence compact' : 'target-sentence'}>
          {targetSentence}
        </p>
        <p className="speaking-prompt">{prompt}</p>
      </section>

      <section className="keyword-chip-panel" aria-label="攀岩关键词">
        <p className="target-label">关键词 · 点星标收进生词本</p>
        <div className="keyword-chip-list">
          {activeKeywords.map((keyword) => {
            const collected = vocabTerms.has(keyword.term);
            return (
              <button
                className={`keyword-chip ${collected ? 'collected' : ''}`}
                key={keyword.term}
                type="button"
                onClick={() => onToggleVocabTerm(keyword)}
                title={collected ? '已收入生词本，点一下移出' : '收进生词本'}
              >
                <span className="keyword-chip-term">{keyword.term}</span>
                <span className="keyword-chip-zh">{keyword.zh}</span>
                <Star
                  size={13}
                  aria-hidden="true"
                  className={collected ? 'star filled' : 'star'}
                />
              </button>
            );
          })}
        </div>
      </section>

      <section className="pattern-panel">
        <p className="target-label">句型</p>
        <div className="pattern-list">
          {patterns.map((pattern) => (
            <span key={pattern}>{pattern}</span>
          ))}
        </div>
      </section>

      <section className="mic-device-panel" aria-label="麦克风输入">
        <label htmlFor="microphone-input">麦克风</label>
        <select
          id="microphone-input"
          value={selectedAudioInputId}
          disabled={isRecording}
          onChange={(event) => {
            setSelectedAudioInputId(event.target.value);
            const nextDevice = audioInputs.find(
              (device) => device.deviceId === event.target.value,
            );
            setActiveInputLabel(nextDevice?.label || '系统默认麦克风');
          }}
        >
          <option value="">系统默认</option>
          {audioInputs.map((device, index) => (
            <option key={device.deviceId || `audio-input-${index}`} value={device.deviceId}>
              {device.label || `麦克风 ${index + 1}`}
            </option>
          ))}
        </select>
        <p>
          当前：{activeInputLabel}
          <span>输入电平 {displayedMicPercent}%</span>
        </p>
      </section>

      <div className="recording-controls">
        {!isRecording ? (
          <button className="record-button" type="button" onClick={startRecording}>
            <Mic size={17} aria-hidden="true" />
            开始录音
          </button>
        ) : (
          <button className="record-button danger" type="button" onClick={stopRecording}>
            <CircleStop size={17} aria-hidden="true" />
            停止录音
          </button>
        )}
        <button
          className="icon-text-button send"
          type="button"
          onClick={sendFeedback}
          disabled={!recordedBlob || isSending}
          title="发送录音获取反馈"
        >
          <Send size={15} aria-hidden="true" />
          {isSending ? '分析中' : isStaticFeedbackMode ? '离线反馈' : '反馈'}
        </button>
      </div>

      {isRecording || recordedBlob ? (
        <div className="recording-status" aria-live="polite">
          <div>
            <strong>{isRecording ? '正在录音' : '已录音'}</strong>
            <span>
              {recordingSeconds}s
              {recordedBytes > 0 ? ` / ${formatBytes(recordedBytes)}` : ''}
            </span>
          </div>
          <div className="mic-meter" aria-hidden="true">
            <span
              style={{
                width:
                  displayedMicLevel > 0
                    ? `${Math.max(4, Math.round(displayedMicLevel * 100))}%`
                    : '0%',
              }}
            />
          </div>
        </div>
      ) : null}

      {speechTranscript ? (
        <p className="speech-transcript">识别到：{speechTranscript}</p>
      ) : null}

      {audioUrl ? (
        <div className="playback-panel">
          <Volume2 size={16} aria-hidden="true" />
          <audio controls src={audioUrl}>
            <track kind="captions" />
          </audio>
        </div>
      ) : null}

      {error ? <p className="error-box">{error}</p> : null}

      {feedback ? (
        <section className="feedback-panel">
          <div className="feedback-mode">{feedback.mode === 'demo' ? '离线反馈' : 'AI 反馈'}</div>
          <p className="feedback-transcript">{feedback.transcript}</p>
          <p>{feedback.closeness}</p>
          <div className="hit-list">
            {feedback.keywordHits.map((hit) => (
              <span key={hit}>{hit}</span>
            ))}
          </div>
          {feedback.audioNotes?.length ? (
            <ul className="audio-note-list">
              {feedback.audioNotes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          ) : null}
          <ul>
            {feedback.suggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
          <p className="natural-line">{feedback.naturalVersion}</p>
        </section>
      ) : null}

      <p className="coach-day-note">当前练习：Day {currentDay} · {lesson.sourceLabel}</p>
    </section>
  );
}

function LibraryView({
  lessons,
  sessions,
  activeSessionIndex,
  completedSessionIds,
  unlockedSessionIndex,
  courseName,
  onStartDailySession,
  onSelectSentence,
}: {
  lessons: Lesson[];
  sessions: DailySession[];
  activeSessionIndex: number;
  completedSessionIds: Set<string>;
  unlockedSessionIndex: number;
  courseName: string;
  onStartDailySession: (session: DailySession, index: number) => void;
  onSelectSentence: (sessionIndex: number, sentenceIndex: number) => void;
}) {
  const [expandedLessonIndex, setExpandedLessonIndex] = useState(activeSessionIndex);

  return (
    <section className="main-pane library-pane" aria-label="听力库">
      <div className="library-head">
        <div>
          <p className="eyebrow">听力库</p>
          <h2>{courseName}</h2>
        </div>
        <p className="library-note">
          完成前一天后解锁下一天；已完成的 Day 可以随时回来复习。想换素材请回到顶部「素材」栏。
        </p>
      </div>

      <div className="library-list">
        {sessions.map((session, index) => {
          const lesson = lessons[session.lessonIndex];
          const isCompleted = completedSessionIds.has(session.id);
          const isLocked = index > unlockedSessionIndex;
          const isActive = index === activeSessionIndex;
          const isExpanded = expandedLessonIndex === index;

          return (
            <article
              className={`library-day ${isActive ? 'active' : ''} ${isLocked ? 'locked' : ''}`}
              key={session.id}
            >
              <header className="library-day-head">
                <span className="course-marker">
                  {isCompleted ? (
                    <CheckCircle2 size={15} aria-hidden="true" />
                  ) : isLocked ? (
                    <LockKeyhole size={13} aria-hidden="true" />
                  ) : (
                    `D${session.day}`
                  )}
                </span>
                <div className="library-day-info">
                  <strong>Day {session.day} · {session.title}</strong>
                  <small>
                    <Clock3 size={13} aria-hidden="true" />
                    {isLocked
                      ? '完成前一天解锁'
                      : isCompleted
                        ? '已完成，可复习'
                        : `${DAILY_SESSION_MINUTES} 分钟`}
                  </small>
                </div>
                <div className="library-day-actions">
                  <button
                    className="control-button small"
                    type="button"
                    disabled={isLocked}
                    onClick={() => onStartDailySession(session, index)}
                  >
                    <Play size={14} aria-hidden="true" />
                    练整课
                  </button>
                  <button
                    className="control-button small"
                    type="button"
                    disabled={isLocked}
                    onClick={() => setExpandedLessonIndex(isExpanded ? -1 : index)}
                    aria-expanded={isExpanded}
                  >
                    <ListMusic size={14} aria-hidden="true" />
                    {isExpanded ? '收起' : '句子'}
                  </button>
                </div>
              </header>

              {isExpanded && !isLocked ? (
                <div className="library-sentence-list">
                  {lesson.sentences.map((sentence, sentenceIndex) => (
                    <button
                      className="clip-card"
                      key={sentence.id}
                      type="button"
                      onClick={() => onSelectSentence(session.lessonIndex, sentenceIndex)}
                    >
                      <span className="clip-index">{String(sentenceIndex + 1).padStart(2, '0')}</span>
                      <span className="clip-title">{sentence.label}</span>
                      <span className="clip-meta">
                        {formatTime(sentence.startTime)} - {formatTime(sentence.endTime)}
                      </span>
                    </button>
                  ))}
                  <button
                    className="clip-card segment-card"
                    type="button"
                    onClick={() => onStartDailySession(session, index)}
                  >
                    <span className="clip-index">ALL</span>
                    <span className="clip-title">整段精听</span>
                    <span className="clip-meta">
                      {formatTime(lesson.startTime)} - {formatTime(lesson.endTime)}
                    </span>
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <section className="source-panel" aria-label="素材来源">
        <p className="source-title">Source</p>
        <a href={lessons[activeSessionIndex]?.sourceUrl ?? lessons[0].sourceUrl} target="_blank" rel="noreferrer">
          {lessons[activeSessionIndex]?.sourceLabel ?? lessons[0].sourceLabel}
        </a>
        <p>
          素材来自 IFSC 官方解说。目标 {LISTENING_GOAL_MINUTES} 分钟真实素材，逐句时间轴手工校对。
        </p>
      </section>
    </section>
  );
}

const MASTERY_LABEL: Record<VocabMastery, string> = {
  0: '新词',
  1: '模糊',
  2: '已掌握',
};

function VocabView({
  vocab,
  courseNameById,
  onSetMastery,
  onRemove,
}: {
  vocab: VocabEntry[];
  courseNameById: Record<string, string>;
  onSetMastery: (term: string, mastery: VocabMastery) => void;
  onRemove: (term: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | VocabMastery>('all');
  const [reviewActive, setReviewActive] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const filtered = useMemo(() => {
    if (filter === 'all') return vocab;
    return vocab.filter((entry) => entry.mastery === filter);
  }, [vocab, filter]);

  const reviewQueue = useMemo(
    () => vocab.filter((entry) => entry.mastery < 2),
    [vocab],
  );
  const reviewWord = reviewQueue[reviewIndex % Math.max(1, reviewQueue.length)];

  const startReview = () => {
    if (!reviewQueue.length) return;
    setReviewIndex(0);
    setRevealed(false);
    setReviewActive(true);
  };

  const markReview = (mastery: VocabMastery) => {
    if (!reviewWord) return;
    onSetMastery(reviewWord.term, mastery);
    setRevealed(false);
    if (reviewIndex + 1 >= reviewQueue.length) {
      setReviewActive(false);
      return;
    }
    setReviewIndex((index) => index + 1);
  };

  if (!vocab.length) {
    return (
      <section className="main-pane vocab-pane" aria-label="生词本">
        <div className="library-head">
          <div>
            <p className="eyebrow">生词本</p>
            <h2>还没有收录单词</h2>
          </div>
        </div>
        <div className="empty-state">
          <BookOpen size={28} aria-hidden="true" />
          <p>完成每日练习会自动把这课的攀岩关键词收进生词本。</p>
          <p>练习时也可以点关键词卡片上的星标，先收想练的词。</p>
        </div>
      </section>
    );
  }

  if (reviewActive && reviewWord) {
    return (
      <section className="main-pane vocab-pane" aria-label="生词复习">
        <div className="library-head">
          <div>
            <p className="eyebrow">
              复习 {reviewIndex + 1} / {reviewQueue.length}
            </p>
            <h2>还记得这个词吗？</h2>
          </div>
          <button
            className="control-button small"
            type="button"
            onClick={() => setReviewActive(false)}
          >
            退出复习
          </button>
        </div>
        <div
          className="review-card"
          role="button"
          tabIndex={0}
          onClick={() => setRevealed(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') setRevealed(true);
          }}
        >
          <p className="review-term">{reviewWord.term}</p>
          {revealed ? (
            <div className="review-detail">
              <p className="review-zh">{reviewWord.zh}</p>
              <p className="review-example">{reviewWord.example}</p>
              <p className="review-source">
                来自 {reviewWord.courseId ? courseNameById[reviewWord.courseId] ?? '' : ''}
                {reviewWord.courseId ? ' · ' : ''}Day {reviewWord.day}
              </p>
            </div>
          ) : (
            <p className="review-hint">点卡片看释义</p>
          )}
        </div>
        {revealed ? (
          <div className="review-actions">
            <button className="control-button" type="button" onClick={() => markReview(0)}>
              忘了
            </button>
            <button className="control-button" type="button" onClick={() => markReview(1)}>
              模糊
            </button>
            <button className="control-button primary" type="button" onClick={() => markReview(2)}>
              记得
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="main-pane vocab-pane" aria-label="生词本">
      <div className="library-head">
        <div>
          <p className="eyebrow">生词本</p>
          <h2>{vocab.length} 个攀岩词</h2>
        </div>
        <button
          className="control-button small"
          type="button"
          disabled={!reviewQueue.length}
          onClick={startReview}
        >
          <Sparkles size={14} aria-hidden="true" />
          复习 {reviewQueue.length} 个待巩固
        </button>
      </div>

      <div className="vocab-filters">
        {(['all', 0, 1, 2] as const).map((value) => {
          const count =
            value === 'all' ? vocab.length : vocab.filter((entry) => entry.mastery === value).length;
          const label = value === 'all' ? '全部' : MASTERY_LABEL[value];
          return (
            <button
              className={`strip-chip ${filter === value ? 'active' : ''}`}
              key={String(value)}
              type="button"
              onClick={() => setFilter(value)}
            >
              {label} {count}
            </button>
          );
        })}
      </div>

      <div className="vocab-list">
        {filtered.map((entry) => (
          <article className="vocab-card" key={entry.term}>
            <div className="vocab-card-head">
              <div>
                <h3>{entry.term}</h3>
                <p className="keyword-zh">{entry.zh}</p>
              </div>
              <span className={`mastery-badge m${entry.mastery}`}>
                {MASTERY_LABEL[entry.mastery]}
              </span>
            </div>
            <p className="vocab-example">{entry.example}</p>
            <div className="vocab-actions">
              <button
                className={`mini-button ${entry.mastery === 0 ? 'active' : ''}`}
                type="button"
                onClick={() => onSetMastery(entry.term, 0)}
              >
                忘了
              </button>
              <button
                className={`mini-button ${entry.mastery === 1 ? 'active' : ''}`}
                type="button"
                onClick={() => onSetMastery(entry.term, 1)}
              >
                模糊
              </button>
              <button
                className={`mini-button ${entry.mastery === 2 ? 'active' : ''}`}
                type="button"
                onClick={() => onSetMastery(entry.term, 2)}
              >
                记得
              </button>
              <button
                className="mini-button danger"
                type="button"
                onClick={() => onRemove(entry.term)}
                title="移出生词本"
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function MeView({
  sessions,
  courseCount,
  totalSessionCount,
  totalCompletedCount,
  completedSessionCount,
  streakDays,
  practiceDates,
  vocabCount,
  masteredCount,
  onExport,
  onImport,
  onReset,
}: {
  sessions: DailySession[];
  courseCount: number;
  totalSessionCount: number;
  totalCompletedCount: number;
  completedSessionCount: number;
  streakDays: number;
  practiceDates: string[];
  vocabCount: number;
  masteredCount: number;
  onExport: () => void;
  onImport: (file: File) => void;
  onReset: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const plannedSeconds = LISTENING_GOAL_MINUTES * 60;
  const sourceSeconds = lessons.reduce(
    (total, lesson) => total + Math.max(0, lesson.endTime - lesson.startTime),
    0,
  );

  return (
    <section className="main-pane me-pane" aria-label="我的">
      <div className="library-head">
        <div>
          <p className="eyebrow">我的</p>
          <h2>学习档案</h2>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric-card">
          <p>当前素材进度</p>
          <strong>
            {completedSessionCount}
            <small>/{sessions.length}</small>
          </strong>
        </div>
        <div className="metric-card">
          <p>全部素材</p>
          <strong>
            {totalCompletedCount}
            <small>/{totalSessionCount} 天 · {courseCount} 套</small>
          </strong>
        </div>
        <div className="metric-card">
          <p>连续打卡</p>
          <strong>{streakDays} 天</strong>
        </div>
        <div className="metric-card">
          <p>生词本</p>
          <strong>
            {vocabCount}
            <small> 词 · 已掌握 {masteredCount}</small>
          </strong>
        </div>
      </div>

      <section className="sidebar-card heatmap-card">
        <div className="panel-heading">
          <Flame size={16} aria-hidden="true" />
          <span>练习热力图</span>
        </div>
        <Heatmap practiceDates={practiceDates} days={HEATMAP_DAYS} />
      </section>

      <section className="sidebar-card method-compact">
        <div className="panel-heading">
          <BookOpen size={16} aria-hidden="true" />
          <span>方法论</span>
        </div>
        <p className="method-lead-compact">
          建立英文声音和文字的直接联系，不依赖翻译。
        </p>
        <ol className="method-steps-compact">
          <li>无字幕反复听</li>
          <li>看逐字稿，大声朗读</li>
          <li>回原音，把声音和文字连起来</li>
        </ol>
      </section>

      <section className="sidebar-card">
        <div className="panel-heading">
          <Trophy size={16} aria-hidden="true" />
          <span>素材进度</span>
        </div>
        <p className="source-meter-line">
          真实素材 {formatDuration(sourceSeconds)} / 目标 {formatDuration(plannedSeconds)}
        </p>
        <p className="library-note">素材来自 IFSC 官方解说，逐句时间轴手工校对。</p>
      </section>

      <section className="sidebar-card data-card">
        <div className="panel-heading">
          <Download size={16} aria-hidden="true" />
          <span>数据备份</span>
        </div>
        <p className="library-note">
          进度、生词本和打卡记录都存在这台设备的浏览器里，换设备前先导出备份。
        </p>
        <div className="focus-actions">
          <button className="control-button" type="button" onClick={onExport}>
            <Download size={15} aria-hidden="true" />
            导出 JSON 备份
          </button>
          <button
            className="control-button"
            type="button"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={15} aria-hidden="true" />
            导入恢复
          </button>
          <button className="control-button danger" type="button" onClick={onReset}>
            <Trash2 size={15} aria-hidden="true" />
            重置进度
          </button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onImport(file);
            event.target.value = '';
          }}
        />
      </section>
    </section>
  );
}
