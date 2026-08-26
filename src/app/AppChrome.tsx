import { BookOpen, CalendarCheck, Download, Flame, Headphones, Target, User } from 'lucide-react';
import type { MainView } from '../types';

export function AppHeader({
  courseReady,
  completedSessionCount,
  sessionCount,
  streakDays,
  onExport,
}: {
  courseReady: boolean;
  completedSessionCount: number;
  sessionCount: number;
  streakDays: number;
  onExport: () => void;
}) {
  return (
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
          {courseReady ? `${completedSessionCount}/${sessionCount} 天` : '视频模式'}
        </span>
        <span className="stat-chip streak">
          <Flame size={15} aria-hidden="true" />
          连续 {streakDays} 天
        </span>
        <button className="icon-text-button" type="button" onClick={onExport}>
          <Download size={15} aria-hidden="true" />
          <span>导出</span>
        </button>
      </div>
    </header>
  );
}

export function ViewNavigation({
  activeView,
  vocabCount,
  onSwitchView,
}: {
  activeView: MainView;
  vocabCount: number;
  onSwitchView: (view: MainView) => void;
}) {
  return (
    <nav className="view-nav" aria-label="主导航">
      <ViewTabButton
        active={activeView === 'today'}
        label="今天"
        icon={<CalendarCheck size={17} aria-hidden="true" />}
        onClick={() => onSwitchView('today')}
      />
      <ViewTabButton
        active={activeView === 'library'}
        label="听力"
        icon={<Headphones size={17} aria-hidden="true" />}
        onClick={() => onSwitchView('library')}
      />
      <ViewTabButton
        active={activeView === 'vocab'}
        label="生词本"
        icon={<BookOpen size={17} aria-hidden="true" />}
        badge={vocabCount || undefined}
        onClick={() => onSwitchView('vocab')}
      />
      <ViewTabButton
        active={activeView === 'me'}
        label="我的"
        icon={<User size={17} aria-hidden="true" />}
        onClick={() => onSwitchView('me')}
      />
    </nav>
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
