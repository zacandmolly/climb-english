// 播放器共用时间常量：练习块前后各留的预备/收尾时长。
export const PRE_ROLL_SECONDS = 1;
export const END_PAD_SECONDS = 0.2;

// YouTube IFrame API 就绪超时（Issue #24）：慢/挂起不能静默 no-op，
// 超时后展示恢复动作。测试通过 window.__CLIMB_ENGLISH_PLAYER_HOOKS__ 缩短。
export const YOUTUBE_SLOW_TIMEOUT_MS = 20_000;

// Browsers do not reliably dispatch <script>.onerror when a request is
// cancelled by a proxy/content blocker. Stop treating that state as an
// endless load and surface the same explicit recovery UI as API errors.
export const YOUTUBE_FAILURE_TIMEOUT_MS = 45_000;

export type PlayerTestHooks = {
  youtubeSlowTimeoutMs?: number;
  youtubeFailureTimeoutMs?: number;
};
