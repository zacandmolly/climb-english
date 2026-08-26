import type { Dispatch, SetStateAction } from 'react';
import { getInitialSessionIndex } from '../progress/session';
import { localDateKey, migrateLegacyProgress, normalizeProgress } from '../progress/storage';
import type { Course, DailySession, LearningProgress } from '../types';

type ProgressBackupContext = {
  progress: LearningProgress;
  courses: Course[];
  validSessionIds: Set<string>;
  setProgress: Dispatch<SetStateAction<LearningProgress>>;
  setActiveCourseId: Dispatch<SetStateAction<string>>;
  setActiveSessionIndex: Dispatch<SetStateAction<number>>;
  activateDailySession: (session: DailySession, index: number, shouldPlay: boolean) => void;
};

export function createProgressBackupActions(context: ProgressBackupContext) {
  return {
    exportBackup: () => downloadProgress(context.progress),
    importBackup: (file: File) => readBackup(file, (value) => restoreBackup(context, value)),
  };
}

function downloadProgress(progress: LearningProgress): void {
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
}

function readBackup(file: File, onLoad: (value: string) => void): void {
  const reader = new FileReader();
  reader.onload = () => onLoad(String(reader.result));
  reader.readAsText(file);
}

function restoreBackup(context: ProgressBackupContext, value: string): void {
  try {
    const candidate = parseBackup(value);
    if (!isValidBackup(candidate, context)) {
      window.alert('备份文件格式不对：缺少有效的练习进度。');
      return;
    }
    if (!window.confirm('导入会覆盖当前进度、生词本和打卡记录，确定吗？')) return;
    applyBackup(context, candidate);
    window.alert('导入成功。');
  } catch {
    window.alert('备份文件解析失败，请确认选择的是导出的 JSON 文件。');
  }
}

function parseBackup(value: string): Partial<LearningProgress> {
  const parsed = JSON.parse(value) as Partial<{ progress: LearningProgress }> &
    Partial<LearningProgress>;
  return parsed.progress ?? parsed;
}

function isValidBackup(
  candidate: Partial<LearningProgress>,
  context: ProgressBackupContext
): boolean {
  if (!Array.isArray(candidate.completedSessionIds)) return false;
  return candidate.completedSessionIds.every((id) => isValidSessionId(id, context));
}

function isValidSessionId(id: string, context: ProgressBackupContext): boolean {
  if (context.validSessionIds.has(id) || /^daily-session-\d+$/.test(id)) return true;
  return context.courses.some((course) => id.startsWith(`${course.id}-day-`));
}

function applyBackup(context: ProgressBackupContext, candidate: Partial<LearningProgress>): void {
  const restored = migrateLegacyProgress(normalizeProgress(candidate), context.courses);
  const restoredCourse = findRestoredCourse(context.courses, restored);
  const restoredSessions = restoredCourse?.sessions ?? [];
  const restoredIndex = getInitialSessionIndex(restoredSessions, restored);
  const restoredSession = restoredSessions[restoredIndex] ?? restoredSessions[0];
  context.setProgress({ ...restored, activeCourseId: restoredCourse?.id ?? null });
  context.setActiveCourseId(restoredCourse?.id ?? '');
  context.setActiveSessionIndex(restoredIndex);
  if (restoredSession) context.activateDailySession(restoredSession, restoredIndex, false);
}

function findRestoredCourse(courses: Course[], progress: LearningProgress): Course | undefined {
  return (
    courses.find((course) => course.id === progress.activeCourseId) ??
    courses.find((course) =>
      course.sessions.some((session) => session.id === progress.activeSessionId)
    ) ??
    courses[0]
  );
}
