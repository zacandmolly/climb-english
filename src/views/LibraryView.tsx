import { CheckCircle2, Clock3, ListMusic, LockKeyhole, Play } from 'lucide-react';
import { useState } from 'react';
import { DAILY_SESSION_MINUTES, LISTENING_GOAL_MINUTES } from '../constants';
import { formatTime } from '../lib/ui';
import type { DailySession, Lesson } from '../types';

export function LibraryView({
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
