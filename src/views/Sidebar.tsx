import {
  BookOpen,
  CalendarCheck,
  CheckCircle2,
  Flame,
  LockKeyhole,
  Target,
} from 'lucide-react';
import { useMemo } from 'react';
import { HEATMAP_DAYS } from '../constants';
import { localDateKey } from '../progress/storage';
import type { DailySession } from '../types';

export function Sidebar({
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

export function Heatmap({ practiceDates, days }: { practiceDates: string[]; days: number }) {
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
