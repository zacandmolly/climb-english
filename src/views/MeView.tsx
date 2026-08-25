import { BookOpen, Download, Flame, Trash2, Trophy, Upload } from 'lucide-react';
import { useRef } from 'react';
import { HEATMAP_DAYS, LISTENING_GOAL_MINUTES } from '../constants';
import { lessons } from '../data/lessons';
import { formatDuration } from '../lib/ui';
import type { DailySession } from '../types';
import { Heatmap } from './Sidebar';

export function MeView({
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
