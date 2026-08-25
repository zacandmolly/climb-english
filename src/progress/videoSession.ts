import type { Cue } from '../types';

export const VIDEO_SESSION_STORAGE_KEY = 'climb-english-video-session-v1';
const VIDEO_SESSION_VERSION = 1;

export type VideoResumePosition = {
  cueId: string | null;
  cueIndex: number;
  currentTime: number;
  updatedAt: string;
};

export type VideoSessionState = {
  version: typeof VIDEO_SESSION_VERSION;
  activeVideoId: string | null;
  positions: Record<string, VideoResumePosition>;
};

export type VideoSessionLoadResult = {
  status: 'missing' | 'valid' | 'invalid';
  state: VideoSessionState;
};

export type ResolvedVideoResumePosition = {
  cueIndex: number;
  currentTime: number;
};

export function emptyVideoSessionState(): VideoSessionState {
  return {
    version: VIDEO_SESSION_VERSION,
    activeVideoId: null,
    positions: {},
  };
}

export function loadVideoSession(validVideoIds: readonly string[]): VideoSessionLoadResult {
  if (typeof window === 'undefined') {
    return { status: 'missing', state: emptyVideoSessionState() };
  }

  try {
    const raw = window.localStorage.getItem(VIDEO_SESSION_STORAGE_KEY);
    if (!raw) return { status: 'missing', state: emptyVideoSessionState() };

    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || parsed.version !== VIDEO_SESSION_VERSION) {
      return { status: 'invalid', state: emptyVideoSessionState() };
    }

    const validIds = new Set(validVideoIds);
    const rawActiveVideoId = parsed.activeVideoId;
    if (
      rawActiveVideoId !== null &&
      (typeof rawActiveVideoId !== 'string' || !validIds.has(rawActiveVideoId))
    ) {
      return { status: 'invalid', state: emptyVideoSessionState() };
    }

    const positions: Record<string, VideoResumePosition> = {};
    if (isRecord(parsed.positions)) {
      for (const [videoId, candidate] of Object.entries(parsed.positions)) {
        if (!validIds.has(videoId)) continue;
        const normalized = normalizePosition(candidate);
        if (normalized) positions[videoId] = normalized;
      }
    }

    return {
      status: 'valid',
      state: {
        version: VIDEO_SESSION_VERSION,
        activeVideoId: rawActiveVideoId,
        positions,
      },
    };
  } catch {
    return { status: 'invalid', state: emptyVideoSessionState() };
  }
}

export function saveVideoSession(state: VideoSessionState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(VIDEO_SESSION_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Private browsing or storage quotas must not make the learning flow unusable.
  }
}

export function withActiveVideo(
  state: VideoSessionState,
  activeVideoId: string | null
): VideoSessionState {
  return { ...state, activeVideoId };
}

export function withVideoPosition(
  state: VideoSessionState,
  videoId: string,
  position: VideoResumePosition
): VideoSessionState {
  return {
    ...state,
    positions: { ...state.positions, [videoId]: position },
  };
}

export function resolveVideoResumePosition(
  position: VideoResumePosition | undefined,
  cues: readonly Cue[],
  mediaStartTime: number,
  durationSeconds: number
): ResolvedVideoResumePosition {
  if (!position || cues.length === 0) return { cueIndex: 0, currentTime: 0 };

  const storedIndex = Number.isFinite(position.cueIndex) ? Math.floor(position.cueIndex) : 0;
  const matchingIndex = position.cueId ? cues.findIndex((cue) => cue.id === position.cueId) : -1;
  const cueIndex = clamp(matchingIndex >= 0 ? matchingIndex : storedIndex, 0, cues.length - 1);
  const fallbackTime = Math.max(0, cues[cueIndex].startTime - mediaStartTime);
  const cueEndTime = Math.max(fallbackTime, cues[cueIndex].endTime - mediaStartTime);
  const storedTimeMatchesCue =
    matchingIndex >= 0 &&
    Number.isFinite(position.currentTime) &&
    position.currentTime >= fallbackTime - 0.5 &&
    position.currentTime <= cueEndTime + 0.5;
  const currentTime = storedTimeMatchesCue
    ? clamp(position.currentTime, 0, Math.max(0, durationSeconds))
    : fallbackTime;

  return { cueIndex, currentTime };
}

function normalizePosition(candidate: unknown): VideoResumePosition | null {
  if (!isRecord(candidate)) return null;
  if (!Number.isFinite(candidate.cueIndex) || !Number.isFinite(candidate.currentTime)) return null;

  return {
    cueId: typeof candidate.cueId === 'string' ? candidate.cueId : null,
    cueIndex: Math.max(0, Math.floor(candidate.cueIndex as number)),
    currentTime: Math.max(0, candidate.currentTime as number),
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : '',
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
