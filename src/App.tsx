import {
  BookOpen,
  CalendarCheck,
  Captions,
  ChevronRight,
  CheckCircle2,
  Gauge,
  Library,
  ListMusic,
  LockKeyhole,
  Play,
  RotateCcw,
  Trophy,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BilingualStudio } from './components/BilingualStudio';
import { SpeakingCoach, type CoachTarget } from './components/SpeakingCoach';
import { lessons } from './data/lessons';
import { videoSummaries } from './data/videos';
import type { Keyword, Lesson, PracticeSentence } from './types';

type PracticeMode = 'sentence' | 'segment';
type StudioView = 'daily' | 'bilingual';
const PRE_ROLL_SECONDS = 1;
const END_PAD_SECONDS = 0.2;
const DAILY_SESSION_MINUTES = 5;
const LISTENING_GOAL_MINUTES = 30;
const PROGRESS_STORAGE_KEY = 'climb-english-learning-progress-v1';

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

type LearningProgress = {
  completedSessionIds: string[];
  activeSessionId: string | null;
  updatedAt: string | null;
};

export function App() {
  const dailySessions = useMemo(() => buildDailySessions(lessons), []);
  const initialLearningStateRef = useRef<{
    progress: LearningProgress;
    sessionIndex: number;
  } | null>(null);

  if (!initialLearningStateRef.current) {
    const progress = loadLearningProgress();
    initialLearningStateRef.current = {
      progress,
      sessionIndex: getInitialSessionIndex(dailySessions, progress),
    };
  }

  const initialSession =
    dailySessions[initialLearningStateRef.current.sessionIndex] ?? dailySessions[0];
  const [progress, setProgress] = useState<LearningProgress>(
    initialLearningStateRef.current.progress,
  );
  const [view, setView] = useState<StudioView>('daily');
  const [activeLessonIndex, setActiveLessonIndex] = useState(initialSession.lessonIndex);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(0);
  const [activeSessionIndex, setActiveSessionIndex] = useState(
    initialLearningStateRef.current.sessionIndex,
  );
  const [mode, setMode] = useState<PracticeMode>('sentence');
  const [playRequestId, setPlayRequestId] = useState(0);
  const lesson = lessons[activeLessonIndex] ?? lessons[0];
  const activeSentence = lesson.sentences[activeSentenceIndex] ?? lesson.sentences[0];
  const coachTarget: CoachTarget = useMemo(() => {
    const isSegment = mode === 'segment';
    return {
      clipId: `${lesson.id}:${mode}:${activeSentence.id}`,
      sentence: isSegment ? fullTranscript(lesson) : activeSentence.transcript,
      keywords: isSegment ? uniqueKeywords(lesson.sentences) : activeSentence.keywords,
      patterns: isSegment ? segmentPatterns(lesson) : activeSentence.sentencePatterns,
      prompt: isSegment
        ? 'Listen to the whole passage, then retell the action in your own words.'
        : activeSentence.speakingPrompt,
      label: isSegment ? 'Retell the passage' : 'Shadowing sentence',
    };
  }, [lesson, activeSentence, mode]);
  const completedSessionIds = useMemo(
    () => new Set(progress.completedSessionIds),
    [progress.completedSessionIds],
  );
  const completedSessionCount = completedPrefixCount(dailySessions, completedSessionIds);
  const unlockedSessionIndex = getUnlockedSessionIndex(dailySessions, completedSessionIds);

  useEffect(() => {
    saveLearningProgress(progress);
  }, [progress]);

  useEffect(() => {
    if (activeSentenceIndex >= lesson.sentences.length) {
      setActiveSentenceIndex(0);
    }
  }, [activeSentenceIndex, lesson.sentences.length]);

  const selectSentence = (index: number) => {
    setActiveSentenceIndex(index);
    setMode('sentence');
    setPlayRequestId((id) => id + 1);
  };

  const goNextSentence = () => {
    setActiveSentenceIndex((index) => Math.min(index + 1, lesson.sentences.length - 1));
    setMode('sentence');
    setPlayRequestId((id) => id + 1);
  };

  const selectSegment = () => {
    setMode('segment');
    setPlayRequestId((id) => id + 1);
  };

  const activateDailySession = (session: DailySession, index: number, shouldPlay: boolean) => {
    setActiveSessionIndex(index);
    setActiveLessonIndex(session.lessonIndex);
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

  const completeActiveSession = () => {
    const currentSession = dailySessions[activeSessionIndex] ?? dailySessions[0];
    const nextCompletedIds = Array.from(
      new Set([...progress.completedSessionIds, currentSession.id]),
    );
    const nextCompletedSet = new Set(nextCompletedIds);
    const nextSessionIndex = getUnlockedSessionIndex(dailySessions, nextCompletedSet);
    const nextSession = dailySessions[nextSessionIndex] ?? currentSession;

    setProgress({
      completedSessionIds: nextCompletedIds,
      activeSessionId: nextSession.id,
      updatedAt: new Date().toISOString(),
    });
    activateDailySession(nextSession, nextSessionIndex, false);
  };

  const resetProgress = () => {
    const firstSession = dailySessions[0];
    const nextProgress = emptyLearningProgress(firstSession?.id ?? null);
    setProgress(nextProgress);
    if (firstSession) activateDailySession(firstSession, 0, false);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <span className="brand-mark">CE</span>
          <div>
            <p className="eyebrow">Banana Climbing / Local Prototype</p>
            <h1>Climb English Studio</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="view-switch" role="tablist" aria-label="Studio view">
            <button
              className={view === 'daily' ? 'active' : ''}
              type="button"
              onClick={() => setView('daily')}
            >
              <CalendarCheck size={15} aria-hidden="true" />
              每日计划
            </button>
            <button
              className={view === 'bilingual' ? 'active' : ''}
              type="button"
              onClick={() => setView('bilingual')}
            >
              <Library size={15} aria-hidden="true" />
              字幕视频库
            </button>
          </div>
          <div className="session-chip">
            <Trophy size={16} aria-hidden="true" />
            Bern 2025 Women's Boulder
          </div>
        </div>
      </header>

      {view === 'bilingual' ? (
        <BilingualStudio summaries={videoSummaries} />
      ) : (
        <main className="stage-flow">
          <DailyStrip
            sessions={dailySessions}
            activeSessionIndex={activeSessionIndex}
            completedSessionIds={completedSessionIds}
            completedSessionCount={completedSessionCount}
            unlockedSessionIndex={unlockedSessionIndex}
            onCompleteActiveSession={completeActiveSession}
            onResetProgress={resetProgress}
            onStartDailySession={startDailySession}
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
          />
          <SpeakingCoach target={coachTarget} />
        </main>
      )}
    </div>
  );
}

// 每日任务横条 — XHS 风格的顶部任务带:进度、D1-D6 卡片、今日目标与操作。
function DailyStrip({
  sessions,
  activeSessionIndex,
  completedSessionIds,
  completedSessionCount,
  unlockedSessionIndex,
  onCompleteActiveSession,
  onResetProgress,
  onStartDailySession,
}: {
  sessions: DailySession[];
  activeSessionIndex: number;
  completedSessionIds: Set<string>;
  completedSessionCount: number;
  unlockedSessionIndex: number;
  onCompleteActiveSession: () => void;
  onResetProgress: () => void;
  onStartDailySession: (session: DailySession, index: number) => void;
}) {
  const selectedSession = sessions[activeSessionIndex] ?? sessions[0];
  const sessionCount = sessions.length;
  const selectedSessionCompleted = completedSessionIds.has(selectedSession.id);
  const allSessionsCompleted = completedSessionCount >= sessionCount;
  const planProgress = (completedSessionCount / sessionCount) * 100;

  return (
    <section className="daily-strip" aria-label="Daily 5 minute sessions">
      <div className="daily-strip-head">
        <span className="daily-strip-title">
          <CalendarCheck size={16} aria-hidden="true" />
          每日 5 分钟
        </span>
        <span className="daily-strip-progress-label">
          已完成 {completedSessionCount} / {sessionCount} 天
        </span>
        <div className="progress-track slim" aria-hidden="true">
          <span style={{ width: `${planProgress}%` }} />
        </div>
      </div>

      <div className="daily-strip-row">
        {sessions.map((session, index) => {
          const isCompleted = completedSessionIds.has(session.id);
          const isLocked = index > unlockedSessionIndex;
          const isActive = index === activeSessionIndex;

          return (
            <button
              className={`day-card ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${
                isLocked ? 'locked' : ''
              }`}
              disabled={isLocked}
              key={session.id}
              type="button"
              onClick={() => onStartDailySession(session, index)}
            >
              <span className="day-card-badge">
                {isCompleted ? (
                  <CheckCircle2 size={14} aria-hidden="true" />
                ) : isLocked ? (
                  <LockKeyhole size={13} aria-hidden="true" />
                ) : (
                  `D${session.day}`
                )}
              </span>
              <span className="day-card-title">{session.title}</span>
              <span className="day-card-meta">
                {isCompleted ? '已完成' : isLocked ? '未解锁' : `${DAILY_SESSION_MINUTES} 分钟`}
              </span>
            </button>
          );
        })}
      </div>

      <div className="daily-strip-today">
        <p className="daily-strip-goal">
          <strong>
            Day {selectedSession.day}: {selectedSession.title}
          </strong>
          {selectedSession.goal}
        </p>
        <div className="daily-strip-actions">
          <button
            className="complete-session-button"
            type="button"
            disabled={selectedSessionCompleted}
            onClick={onCompleteActiveSession}
          >
            <CheckCircle2 size={15} aria-hidden="true" />
            {allSessionsCompleted ? '30 分钟已完成' : `完成 Day ${selectedSession.day}`}
          </button>
          {completedSessionCount > 0 ? (
            <button className="reset-progress-button" type="button" onClick={onResetProgress}>
              <RotateCcw size={14} aria-hidden="true" />
              重置
            </button>
          ) : null}
        </div>
      </div>
      <p className="daily-strip-method">方法论：盲听 → 英文逐字稿 → 大声跟读 → 回到原音。中文只是脚手架，别跳过英文稿。</p>
    </section>
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
}) {
  const [showTranslation, setShowTranslation] = useState(true);
  const activeKeywords = mode === 'segment' ? uniqueKeywords(lesson.sentences) : sentence.keywords;
  const activeText = mode === 'segment' ? fullTranscript(lesson) : sentence.transcript;
  const activeTranslation =
    mode === 'segment' ? fullTranslation(lesson) : sentence.zhTranslation;
  const activeTip = mode === 'segment' ? lesson.segmentGoal : sentence.zhExplanation;
  const rangeStart = mode === 'segment' ? lesson.startTime : sentence.startTime;
  const rangeEnd = mode === 'segment' ? lesson.endTime : sentence.endTime;
  const rangeKey = `${lesson.id}-${mode}-${sentence.id}`;
  const terms = useMemo(() => activeKeywords.map((keyword) => keyword.term), [activeKeywords]);
  const hasNextSentence = sentenceIndex < lesson.sentences.length - 1;

  return (
    <section className="listen-pane stage-card" aria-label="Listening workspace">
      <div className="clip-head">
        <div>
          <p className="eyebrow">{lesson.competition}</p>
          <h2>{mode === 'segment' ? '整段精听' : sentence.label}</h2>
          <p className="clip-subtitle">
            {lesson.discipline} / {lesson.athlete}
          </p>
        </div>
        <div className="mode-switch" aria-label="Practice mode">
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

      <div className="sentence-chips" aria-label="Practice sentences">
        {lesson.sentences.map((item, index) => (
          <button
            className={`sentence-chip ${mode === 'sentence' && index === sentenceIndex ? 'active' : ''}`}
            key={item.id}
            type="button"
            title={item.label}
            onClick={() => onSelectSentence(index)}
          >
            {String(index + 1).padStart(2, '0')}
          </button>
        ))}
        <button
          className={`sentence-chip all ${mode === 'segment' ? 'active' : ''}`}
          type="button"
          onClick={onSelectSegment}
        >
          ALL
        </button>
      </div>

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
      />

      <section className="transcript-panel">
        <div className="panel-heading spread">
          <span>
            <Captions size={18} aria-hidden="true" />
            {mode === 'segment' ? '整段练习稿' : `第 ${sentenceIndex + 1} 句练习稿`}
          </span>
          <button
            className="icon-text-button"
            type="button"
            onClick={() => setShowTranslation((value) => !value)}
            title="Toggle Chinese explanation"
          >
            <BookOpen size={16} aria-hidden="true" />
            {showTranslation ? '隐藏中文' : '显示中文'}
          </button>
        </div>

        {mode === 'segment' ? (
          <div className="segment-transcript hero">
            {lesson.sentences.map((item, index) => (
              <button
                className={index === sentenceIndex ? 'active' : ''}
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
          <p className={`transcript-text hero ${activeText.length > 180 ? 'compact' : ''}`}>
            <HighlightedText text={activeText} terms={terms} />
          </p>
        )}

        {showTranslation ? (
          <div className="translation-stack">
            <section className="translation-box">
              <h3>完整翻译</h3>
              <p>{activeTranslation}</p>
            </section>
            <section className="translation-box tip">
              <h3>重点提示</h3>
              <p>{activeTip}</p>
            </section>
          </div>
        ) : null}

        <div className="keyword-row" aria-label="Climbing keywords">
          {activeKeywords.map((keyword) => (
            <span className="keyword-chip" key={keyword.term} title={keyword.example}>
              <strong>{keyword.term}</strong>
              {keyword.zh}
            </span>
          ))}
        </div>
      </section>
    </section>
  );
}

function LocalVideoPlayer({
  mediaUrl,
  mediaStartTime,
  rangeStart,
  rangeEnd,
  rangeKey,
  mode,
  playRequestId,
  hasNextSentence,
  onNextSentence,
}: {
  mediaUrl: string;
  mediaStartTime: number;
  rangeStart: number;
  rangeEnd: number;
  rangeKey: string;
  mode: PracticeMode;
  playRequestId: number;
  hasNextSentence: boolean;
  onNextSentence: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const resolvedMediaUrl = resolveStaticAssetUrl(mediaUrl);
  const cueStart = Math.max(0, rangeStart - mediaStartTime);
  const cueEnd = Math.max(cueStart + 0.1, rangeEnd - mediaStartTime);
  const playStart = Math.max(0, cueStart - PRE_ROLL_SECONDS);
  const playEnd = cueEnd + END_PAD_SECONDS;

  const seekToPreroll = () => {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    video.currentTime = playStart;
    setIsPlaying(false);
  };

  const playRange = () => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = playStart;
    video.playbackRate = playbackRate;
    void video.play();
    setIsPlaying(true);
  };

  useEffect(() => {
    seekToPreroll();
  }, [playStart, rangeKey]);

  useEffect(() => {
    if (playRequestId === 0) return;
    playRange();
  }, [playRequestId]);

  const togglePlaybackRate = () => {
    const nextRate = playbackRate === 1 ? 0.75 : 1;
    setPlaybackRate(nextRate);
    if (videoRef.current) videoRef.current.playbackRate = nextRate;
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    const boundedPlayEnd = Number.isFinite(video.duration)
      ? Math.min(playEnd, video.duration)
      : playEnd;

    if (video.currentTime >= boundedPlayEnd) {
      video.pause();
      video.currentTime = playStart;
      setIsPlaying(false);
    }
  };

  return (
    <section className="video-panel" aria-label="Competition video">
      <div className="video-frame">
        <video
          ref={videoRef}
          className="local-video"
          src={resolvedMediaUrl}
          controls
          preload="metadata"
          playsInline
          onTimeUpdate={handleTimeUpdate}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
        />
      </div>
      <div className="video-controls">
        <button
          className="control-button primary"
          type="button"
          onClick={playRange}
          title="Play selected range"
        >
          <Play size={17} aria-hidden="true" />
          {isPlaying ? '重播本句' : '播放'}
        </button>
        <button
          className="control-button"
          type="button"
          onClick={playRange}
          title="Replay selected range"
        >
          <RotateCcw size={17} aria-hidden="true" />
          重放
        </button>
        <button
          className={`control-button ${playbackRate === 0.75 ? 'active' : ''}`}
          type="button"
          onClick={togglePlaybackRate}
          title="Slow playback"
        >
          <Gauge size={17} aria-hidden="true" />
          {playbackRate === 0.75 ? '0.75x' : '慢速'}
        </button>
        {mode === 'sentence' ? (
          <button
            className="control-button"
            type="button"
            disabled={!hasNextSentence}
            onClick={onNextSentence}
            title="Practice next sentence"
          >
            <ChevronRight size={17} aria-hidden="true" />
            下一句
          </button>
        ) : null}
        <span className="time-chip">
          {formatTime(rangeStart)} - {formatTime(rangeEnd)}
          <span>预备 {PRE_ROLL_SECONDS}s</span>
        </span>
      </div>
    </section>
  );
}

function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  const regex = useMemo(() => {
    const stopwords = new Set(['the', 'and', 'with', 'then', 'that', 'this', 'into']);
    const escaped = terms
      .flatMap((term) => term.split(/\s+/))
      .filter((term) => term.length > 2 && !stopwords.has(term.toLowerCase()))
      .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    return escaped.length > 0 ? new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi') : null;
  }, [terms]);

  if (!regex) return <span>{text}</span>;

  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        terms.some((term) => term.toLowerCase().includes(part.toLowerCase())) &&
        part.length > 2 ? (
          <mark key={`${part}-${index}`}>{part}</mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}

function emptyLearningProgress(activeSessionId: string | null = null): LearningProgress {
  return {
    completedSessionIds: [],
    activeSessionId,
    updatedAt: null,
  };
}

function loadLearningProgress(): LearningProgress {
  if (typeof window === 'undefined') return emptyLearningProgress();

  try {
    const raw = window.localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) return emptyLearningProgress();

    const parsed = JSON.parse(raw) as Partial<LearningProgress>;
    return {
      completedSessionIds: Array.isArray(parsed.completedSessionIds)
        ? parsed.completedSessionIds.filter((id): id is string => typeof id === 'string')
        : [],
      activeSessionId:
        typeof parsed.activeSessionId === 'string' ? parsed.activeSessionId : null,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
    };
  } catch {
    return emptyLearningProgress();
  }
}

function saveLearningProgress(progress: LearningProgress) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
  } catch {
    // localStorage can be unavailable in locked-down browsers. The app still works for the session.
  }
}

function completedPrefixCount(sessions: DailySession[], completedSessionIds: Set<string>) {
  let completedCount = 0;

  for (const session of sessions) {
    if (!completedSessionIds.has(session.id)) break;
    completedCount += 1;
  }

  return completedCount;
}

function getUnlockedSessionIndex(sessions: DailySession[], completedSessionIds: Set<string>) {
  if (sessions.length === 0) return 0;
  return Math.min(completedPrefixCount(sessions, completedSessionIds), sessions.length - 1);
}

function getInitialSessionIndex(sessions: DailySession[], progress: LearningProgress) {
  if (sessions.length === 0) return 0;

  const completedSessionIds = new Set(progress.completedSessionIds);
  const unlockedSessionIndex = getUnlockedSessionIndex(sessions, completedSessionIds);
  const storedSessionIndex = sessions.findIndex((session) => session.id === progress.activeSessionId);

  if (
    storedSessionIndex >= 0 &&
    storedSessionIndex <= unlockedSessionIndex &&
    !completedSessionIds.has(sessions[storedSessionIndex].id)
  ) {
    return storedSessionIndex;
  }

  return unlockedSessionIndex;
}

function buildDailySessions(allLessons: Lesson[]): DailySession[] {
  const titles = ['slab 初听', '脚点和低成功率', '选手背景和尝试', '身体位置和动作序列', '压力下的最后动作', '整段复述'];
  const goals = [
    '先把原声和练习稿对齐，听出 slab、heel、match、appeal。',
    '重点听脚点、低成功率动作和解说里的判断词。',
    '听懂选手背景、尝试次数和解说员如何预测结果。',
    '抓身体位置、脚点调整和动作序列。',
    '听懂最后动作、时间压力和成败判断。',
    '完整听一段 5 分钟官方解说，然后用自己的话复述。',
  ];
  const steps = [
    ['盲听 1 遍，只听出关键词', '看英文字幕跟播 2 遍', '录 1 句最短 shadowing'],
    ['慢速听 2 个练习块', '读中文重点提示', '用关键词说 1 个自己的句子'],
    ['逐块听 2 遍', '隐藏中文再听 1 遍', '录音回答右侧问题'],
    ['看视频动作，不看中文', '跟读原句 2 遍', '用自己的话描述动作'],
    ['先听关键块 2 遍', '拆 because / if she 句型', '口头解释为什么成功或失败'],
    ['整段精听 1 遍', '隐藏中文再听 1 遍', '录一段 20 秒英文复述'],
  ];

  return allLessons.map((lesson, index) => ({
    id: `daily-session-${index + 1}`,
    day: index + 1,
    title: titles[index] ?? lesson.title,
    lessonIndex: index,
    mode: index === allLessons.length - 1 ? 'segment' : 'sentence',
    sentenceIndexes: lesson.sentences.map((_, sentenceIndex) => sentenceIndex),
    goal: goals[index] ?? lesson.segmentGoal,
    steps: steps[index] ?? ['听 1 遍', '跟读 1 遍', '用自己的话复述'],
  }));
}

function fullTranscript(lesson: Lesson) {
  return lesson.sentences.map((sentence) => sentence.transcript).join(' ');
}

function fullTranslation(lesson: Lesson) {
  return lesson.sentences.map((sentence) => sentence.zhTranslation).join('');
}

function uniqueKeywords(sentences: PracticeSentence[]) {
  const map = new Map<string, Keyword>();
  for (const sentence of sentences) {
    for (const keyword of sentence.keywords) {
      if (!map.has(keyword.term)) map.set(keyword.term, keyword);
    }
  }
  return Array.from(map.values()).slice(0, 8);
}

function segmentPatterns(lesson: Lesson) {
  return Array.from(new Set(lesson.sentences.flatMap((sentence) => sentence.sentencePatterns))).slice(0, 6);
}

function resolveStaticAssetUrl(assetUrl: string) {
  if (/^(https?:|data:|blob:)/.test(assetUrl)) return assetUrl;

  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/?$/, '/')}${assetUrl.replace(/^\//, '')}`;
}

function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
