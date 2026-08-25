import { BookOpen, Captions, CheckCircle2, Clock3, ListMusic, Play } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DAILY_SESSION_MINUTES } from '../constants';
import { fullTranscript, fullTranslation, parseMediaSource, sentenceIndexAtMediaTime, uniqueKeywords } from '../lib/lesson';
import { HighlightedText } from '../lib/ui';
import { LocalVideoPlayer } from '../players/LocalVideoPlayer';
import { YouTubePlayer } from '../players/YouTubePlayer';
import type { DailySession, Lesson, PracticeMode, PracticeSentence } from '../types';

export function TodayFocusCard({
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

export function SentenceStrip({
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

export function ListeningWorkspace({
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
