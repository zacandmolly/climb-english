// 应用级常量：每日练习时长、听力素材目标、录音输入阈值、热力图天数。
export const DAILY_SESSION_MINUTES = 5;
export const LISTENING_GOAL_MINUTES = 30;
export const LOW_INPUT_LEVEL = 0.01;
export const HEATMAP_DAYS = 14;

// A fully re-cut karaoke video replaces the matching course in the material
// selector. The course data remains available for progress migration and
// reference; this mapping only controls the learner-facing entry point.
export const COURSE_SUPERSEDED_BY_VIDEO: Record<string, string> = {
  'ifsc-world-cup-bern-2025': 'bern-2025-wb-rescut',
  'ifsc-world-cup-innsbruck-2026': 'innsbruck-2026-mb-full',
};
