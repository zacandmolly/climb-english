import {
  BookOpen,
  CalendarCheck,
  Captions,
  ChevronRight,
  CheckCircle2,
  CircleStop,
  Clock3,
  Gauge,
  Headphones,
  ListMusic,
  LockKeyhole,
  Mic,
  Play,
  RotateCcw,
  Send,
  Sparkles,
  Target,
  Trophy,
  Volume2,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { lessons } from './data/lessons';
import type { Feedback, Keyword, Lesson, PracticeSentence } from './types';

type PracticeMode = 'sentence' | 'segment';
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
  const [activeLessonIndex, setActiveLessonIndex] = useState(initialSession.lessonIndex);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(0);
  const [activeSessionIndex, setActiveSessionIndex] = useState(
    initialLearningStateRef.current.sessionIndex,
  );
  const [mode, setMode] = useState<PracticeMode>('sentence');
  const [playRequestId, setPlayRequestId] = useState(0);
  const lesson = lessons[activeLessonIndex] ?? lessons[0];
  const activeSentence = lesson.sentences[activeSentenceIndex] ?? lesson.sentences[0];
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
        <div className="session-chip">
          <Trophy size={16} aria-hidden="true" />
          Bern 2025 Women's Boulder
        </div>
      </header>

      <section className="method-banner" aria-label="Learning method">
        <div className="method-lead">
          <p className="eyebrow">方法论</p>
          <strong>目标不是翻译，而是建立英文声音和英文文字的直接联系。</strong>
        </div>
        <div className="method-steps">
          <span>1. 无字幕反复听；不懂再看英文逐字稿</span>
          <span>2. 吸收逐字稿，并大声朗读内化</span>
          <span>3. 回到原音，重新把声音和文字连起来</span>
        </div>
        <p className="method-note">
          中文只辅助理解；不要跳过英文稿直接看中文。
        </p>
      </section>

      <main className="studio-grid">
        <SentenceRail
          lessons={lessons}
          sessions={dailySessions}
          lesson={lesson}
          activeSentenceIndex={activeSentenceIndex}
          activeSessionIndex={activeSessionIndex}
          completedSessionIds={completedSessionIds}
          completedSessionCount={completedSessionCount}
          unlockedSessionIndex={unlockedSessionIndex}
          mode={mode}
          onCompleteActiveSession={completeActiveSession}
          onResetProgress={resetProgress}
          onStartDailySession={startDailySession}
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
        />
        <SpeakingCoach lesson={lesson} sentence={activeSentence} mode={mode} />
      </main>
    </div>
  );
}

function SentenceRail({
  lessons,
  sessions,
  lesson,
  activeSentenceIndex,
  activeSessionIndex,
  completedSessionIds,
  completedSessionCount,
  unlockedSessionIndex,
  mode,
  onCompleteActiveSession,
  onResetProgress,
  onStartDailySession,
  onSelectSentence,
  onSelectSegment,
}: {
  lessons: Lesson[];
  sessions: DailySession[];
  lesson: Lesson;
  activeSentenceIndex: number;
  activeSessionIndex: number;
  completedSessionIds: Set<string>;
  completedSessionCount: number;
  unlockedSessionIndex: number;
  mode: PracticeMode;
  onCompleteActiveSession: () => void;
  onResetProgress: () => void;
  onStartDailySession: (session: DailySession, index: number) => void;
  onSelectSentence: (index: number) => void;
  onSelectSegment: () => void;
}) {
  return (
    <aside className="clip-rail" aria-label="Sentence list">
      <DailyPracticePlan
        lessons={lessons}
        sessions={sessions}
        activeSessionIndex={activeSessionIndex}
        completedSessionIds={completedSessionIds}
        completedSessionCount={completedSessionCount}
        unlockedSessionIndex={unlockedSessionIndex}
        onCompleteActiveSession={onCompleteActiveSession}
        onResetProgress={onResetProgress}
        onStartDailySession={onStartDailySession}
      />

      <div className="panel-heading">
        <Headphones size={18} aria-hidden="true" />
        <span>Day {activeSessionIndex + 1} 练习块</span>
      </div>
      <div className="clip-list">
        {lesson.sentences.map((sentence, index) => (
          <button
            className={`clip-card ${
              mode === 'sentence' && index === activeSentenceIndex ? 'active' : ''
            }`}
            key={sentence.id}
            onClick={() => onSelectSentence(index)}
            type="button"
          >
            <span className="clip-index">{String(index + 1).padStart(2, '0')}</span>
            <span className="clip-title">{sentence.label}</span>
            <span className="clip-meta">
              {formatTime(sentence.startTime)} - {formatTime(sentence.endTime)}
            </span>
          </button>
        ))}
        <button
          className={`clip-card segment-card ${mode === 'segment' ? 'active' : ''}`}
          onClick={onSelectSegment}
          type="button"
        >
          <span className="clip-index">ALL</span>
          <span className="clip-title">整段精听</span>
          <span className="clip-meta">
            {formatTime(lesson.startTime)} - {formatTime(lesson.endTime)}
          </span>
        </button>
      </div>

      <section className="source-panel" aria-label="Material source">
        <p className="source-title">Source</p>
        <a href={lesson.sourceUrl} target="_blank" rel="noreferrer">
          {lesson.sourceLabel}
        </a>
        <p>练习句按每日 5 分钟连续组织，完成当天后再进入下一天。</p>
      </section>
    </aside>
  );
}

function DailyPracticePlan({
  lessons,
  sessions,
  activeSessionIndex,
  completedSessionIds,
  completedSessionCount,
  unlockedSessionIndex,
  onCompleteActiveSession,
  onResetProgress,
  onStartDailySession,
}: {
  lessons: Lesson[];
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
  const plannedSeconds = LISTENING_GOAL_MINUTES * 60;
  const sourceSeconds = lessons.reduce(
    (total, lesson) => total + Math.max(0, lesson.endTime - lesson.startTime),
    0,
  );
  const missingSourceSeconds = Math.max(0, plannedSeconds - sourceSeconds);
  const planProgress = (completedSessionCount / sessionCount) * 100;
  const sourceProgress = Math.min(100, (sourceSeconds / plannedSeconds) * 100);

  return (
    <section className="daily-plan" aria-label="Daily 5 minute sessions">
      <div className="panel-heading">
        <CalendarCheck size={18} aria-hidden="true" />
        <span>每日 5 分钟</span>
      </div>

      <div className="goal-meter">
        <div>
          <p>训练目标</p>
          <strong>
            已完成 {completedSessionCount} / {sessionCount} 天
          </strong>
        </div>
        <Target size={18} aria-hidden="true" />
      </div>
      <div className="progress-track" aria-hidden="true">
        <span style={{ width: `${planProgress}%` }} />
      </div>

      <div className="source-meter">
        <div>
          <span>真实素材库</span>
          <strong>
            {formatDuration(sourceSeconds)} / {formatDuration(plannedSeconds)}
          </strong>
        </div>
        <div className="progress-track slim" aria-hidden="true">
          <span style={{ width: `${sourceProgress}%` }} />
        </div>
        <p>
          {missingSourceSeconds > 0
            ? `还需要补 ${formatDuration(missingSourceSeconds)} 官方解说片段。`
            : '已补齐 30:00 官方解说片段。'}
        </p>
      </div>

      <div className="today-session">
        <div className="today-session-head">
          <span>今天</span>
          <strong>
            Day {selectedSession.day}: {selectedSession.title}
          </strong>
        </div>
        <p>{selectedSession.goal}</p>
        <ol>
          {selectedSession.steps.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
        <div className="completion-actions">
          <button
            className="complete-session-button"
            type="button"
            disabled={selectedSessionCompleted}
            onClick={onCompleteActiveSession}
          >
            <CheckCircle2 size={16} aria-hidden="true" />
            {allSessionsCompleted
              ? '30 分钟已完成'
              : `完成 Day ${selectedSession.day}`}
          </button>
          {completedSessionCount > 0 ? (
            <button className="reset-progress-button" type="button" onClick={onResetProgress}>
              <RotateCcw size={15} aria-hidden="true" />
              重置
            </button>
          ) : null}
        </div>
      </div>

      <div className="session-list">
        {sessions.map((session, index) => {
          const isCompleted = completedSessionIds.has(session.id);
          const isLocked = index > unlockedSessionIndex;
          const isActive = index === activeSessionIndex;

          return (
            <button
              className={`session-button ${isActive ? 'active' : ''} ${
                isCompleted ? 'completed' : ''
              } ${isLocked ? 'locked' : ''}`}
              disabled={isLocked}
              key={session.id}
              type="button"
              onClick={() => onStartDailySession(session, index)}
            >
              <span className="session-day">
                {isCompleted ? (
                  <CheckCircle2 size={15} aria-hidden="true" />
                ) : isLocked ? (
                  <LockKeyhole size={14} aria-hidden="true" />
                ) : (
                  `D${session.day}`
                )}
              </span>
              <span>
                <strong>{session.title}</strong>
                <small>
                  <Clock3 size={13} aria-hidden="true" />
                  {isCompleted
                    ? '已完成，可复习'
                    : isLocked
                      ? '完成前一天后解锁'
                      : `${DAILY_SESSION_MINUTES} 分钟`}
                </small>
              </span>
            </button>
          );
        })}
      </div>
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
    <section className="listen-pane" aria-label="Listening workspace">
      <div className="clip-head">
        <div>
          <p className="eyebrow">{lesson.competition}</p>
          <h2>{mode === 'segment' ? '整段精听' : sentence.label}</h2>
          <p className="clip-subtitle">
            {lesson.discipline} / {lesson.athlete}
          </p>
        </div>
        <span className="review-badge">{lesson.captionStatus}</span>
      </div>

      <div className="mode-switch" aria-label="Practice mode">
        <button
          className={mode === 'sentence' ? 'active' : ''}
          type="button"
          onClick={() => onModeChange('sentence')}
        >
          <Captions size={16} aria-hidden="true" />
          逐句练
        </button>
        <button
          className={mode === 'segment' ? 'active' : ''}
          type="button"
          onClick={onSelectSegment}
        >
          <ListMusic size={16} aria-hidden="true" />
          整段精听
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
          <div className="segment-transcript">
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
          <p className={`transcript-text ${activeText.length > 180 ? 'compact' : ''}`}>
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
      </section>

      <section className="keyword-grid" aria-label="Climbing keywords">
        {activeKeywords.map((keyword) => (
          <article className="keyword-card" key={keyword.term}>
            <h3>{keyword.term}</h3>
            <p className="keyword-zh">{keyword.zh}</p>
            <p>{keyword.example}</p>
          </article>
        ))}
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

function SpeakingCoach({
  lesson,
  sentence,
  mode,
}: {
  lesson: Lesson;
  sentence: PracticeSentence;
  mode: PracticeMode;
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedBytes, setRecordedBytes] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isSending, setIsSending] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const activeKeywords = mode === 'segment' ? uniqueKeywords(lesson.sentences) : sentence.keywords;
  const targetSentence = mode === 'segment' ? fullTranscript(lesson) : sentence.transcript;
  const prompt = mode === 'segment' ? 'Listen to the whole passage, then retell the action in your own words.' : sentence.speakingPrompt;
  const patterns = mode === 'segment' ? segmentPatterns(lesson) : sentence.sentencePatterns;

  const cleanupRecordingResources = () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    if (meterFrameRef.current) {
      window.cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    mediaRecorderRef.current = null;

    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setMicLevel(0);
  };

  const startMicMeter = (stream: MediaStream) => {
    const AudioContextConstructor =
      window.AudioContext ??
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextConstructor) return;

    const audioContext = new AudioContextConstructor();
    const analyser = audioContext.createAnalyser();
    const source = audioContext.createMediaStreamSource(stream);
    analyser.fftSize = 512;
    const samples = new Uint8Array(analyser.fftSize);
    source.connect(analyser);
    audioContextRef.current = audioContext;

    const updateLevel = () => {
      analyser.getByteTimeDomainData(samples);
      let sum = 0;
      for (const sample of samples) {
        const centered = (sample - 128) / 128;
        sum += centered * centered;
      }
      const rms = Math.sqrt(sum / samples.length);
      setMicLevel(Math.min(1, rms * 8));
      meterFrameRef.current = window.requestAnimationFrame(updateLevel);
    };

    updateLevel();
  };

  useEffect(() => {
    setRecordedBlob(null);
    setFeedback(null);
    setError(null);
    setRecordedBytes(0);
    setRecordingSeconds(0);
    setMicLevel(0);
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
      setAudioUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return null;
      });

      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        setError('当前浏览器不支持网页录音。请用最新版 Chrome 或 Edge 打开这个页面。');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      chunksRef.current = [];
      const mimeType = getSupportedRecordingMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

      recorder.ondataavailable = (event) => {
        if (event.data.size <= 0) return;
        chunksRef.current.push(event.data);
        setRecordedBytes((bytes) => bytes + event.data.size);
      };
      recorder.onerror = () => {
        setError('录音中断了。请确认浏览器允许 microphone 权限，然后再试一次。');
        cleanupRecordingResources();
        setIsRecording(false);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        cleanupRecordingResources();
        setIsRecording(false);

        if (blob.size === 0) {
          setRecordedBlob(null);
          setRecordedBytes(0);
          setError('这次没有录到声音。请确认麦克风权限已允许，并靠近麦克风再录一遍。');
          return;
        }

        setRecordedBlob(blob);
        setRecordedBytes(blob.size);
        setError(null);
        setAudioUrl((currentUrl) => {
          if (currentUrl) URL.revokeObjectURL(currentUrl);
          return URL.createObjectURL(blob);
        });
      };

      mediaRecorderRef.current = recorder;
      startMicMeter(stream);
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((seconds) => seconds + 1);
      }, 1000);
      recorder.start(250);
      setIsRecording(true);
    } catch (recordingError) {
      cleanupRecordingResources();
      setIsRecording(false);
      setError(getRecordingErrorMessage(recordingError));
    }
  };

  const stopRecording = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      cleanupRecordingResources();
      setIsRecording(false);
      return;
    }

    recorder.stop();
  };

  const sendFeedback = async () => {
    if (!recordedBlob) {
      setError('先录一遍，再让 AI 教练反馈。');
      return;
    }

    setIsSending(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('audio', recordedBlob, 'shadowing.webm');
      formData.append('clipId', `${lesson.id}:${mode}:${sentence.id}`);
      formData.append('targetSentence', targetSentence);
      formData.append('transcript', targetSentence);
      formData.append('keywords', activeKeywords.map((keyword) => keyword.term).join(', '));

      const response = await fetch('/api/speaking-feedback', {
        method: 'POST',
        body: formData,
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Feedback request failed.');
      }
      setFeedback(payload);
    } catch (requestError) {
      setFeedback(makeClientDemoFeedback({ targetSentence, keywords: activeKeywords }));
      setError(
        requestError instanceof Error
          ? `AI 反馈暂时不可用，先显示离线练习建议。${requestError.message}`
          : 'AI 反馈暂时不可用，先显示离线练习建议。',
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside className="coach-pane" aria-label="Speaking coach">
      <div className="panel-heading">
        <Sparkles size={18} aria-hidden="true" />
        <span>AI 教练</span>
      </div>

      <section className="target-panel">
        <p className="target-label">{mode === 'segment' ? 'Retell the passage' : 'Shadowing sentence'}</p>
        <p className={mode === 'segment' ? 'target-sentence compact' : 'target-sentence'}>
          {targetSentence}
        </p>
        <p className="speaking-prompt">{prompt}</p>
      </section>

      <section className="pattern-panel">
        <p className="target-label">句型</p>
        <div className="pattern-list">
          {patterns.map((pattern) => (
            <span key={pattern}>{pattern}</span>
          ))}
        </div>
      </section>

      <div className="recording-controls">
        {!isRecording ? (
          <button className="record-button" type="button" onClick={startRecording}>
            <Mic size={18} aria-hidden="true" />
            开始录音
          </button>
        ) : (
          <button className="record-button danger" type="button" onClick={stopRecording}>
            <CircleStop size={18} aria-hidden="true" />
            停止录音
          </button>
        )}
        <button
          className="icon-text-button send"
          type="button"
          onClick={sendFeedback}
          disabled={!recordedBlob || isSending}
          title="Send recording for feedback"
        >
          <Send size={16} aria-hidden="true" />
          {isSending ? '分析中' : '反馈'}
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
            <span style={{ width: `${Math.max(8, Math.round(micLevel * 100))}%` }} />
          </div>
        </div>
      ) : null}

      {audioUrl ? (
        <div className="playback-panel">
          <Volume2 size={18} aria-hidden="true" />
          <audio controls src={audioUrl}>
            <track kind="captions" />
          </audio>
        </div>
      ) : null}

      {error ? <p className="error-box">{error}</p> : null}

      {feedback ? (
        <section className="feedback-panel">
          <div className="feedback-mode">{feedback.mode === 'demo' ? 'Demo feedback' : 'AI feedback'}</div>
          <p className="feedback-transcript">{feedback.transcript}</p>
          <p>{feedback.closeness}</p>
          <div className="hit-list">
            {feedback.keywordHits.map((hit) => (
              <span key={hit}>{hit}</span>
            ))}
          </div>
          <ul>
            {feedback.suggestions.map((suggestion) => (
              <li key={suggestion}>{suggestion}</li>
            ))}
          </ul>
          <p className="natural-line">{feedback.naturalVersion}</p>
        </section>
      ) : null}
    </aside>
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

function getSupportedRecordingMimeType() {
  if (typeof MediaRecorder === 'undefined') return '';

  return (
    [
      'audio/webm;codecs=opus',
      'audio/webm',
      'audio/mp4',
      'audio/ogg;codecs=opus',
    ].find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
  );
}

function getRecordingErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return '浏览器没有麦克风权限。请点地址栏旁边的权限图标，允许 microphone，然后刷新页面再录。';
    }

    if (error.name === 'NotFoundError') {
      return '没有找到可用麦克风。请检查系统输入设备后再试。';
    }
  }

  return '麦克风不可用。请确认浏览器允许 microphone 权限，并使用最新版 Chrome 或 Edge。';
}

function makeClientDemoFeedback({
  targetSentence,
  keywords,
}: {
  targetSentence: string;
  keywords: Keyword[];
}): Feedback {
  return {
    mode: 'demo',
    transcript: '离线模式：录音已完成，但当前发布环境没有连接 AI 转写服务。',
    keywordHits: keywords.map((keyword) => keyword.term).slice(0, 4),
    closeness: '先把关键词说清楚，再追求速度。可以马上再录一遍。',
    suggestions: ['把句子拆成两段说。', '保留 boulder、foot、top、zone 这类攀岩词。'],
    naturalVersion: targetSentence,
  };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
