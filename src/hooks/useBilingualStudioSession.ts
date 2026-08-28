import { useEffect, useMemo, useRef, useState } from 'react';
import { loadVideo } from '../data/videos';
import { reportError } from '../lib/errorReporter';
import { describeVideoLoadFailure, type VideoLoadFailure } from '../lib/videoLoad';
import { resolveVideoResumePosition, type VideoResumePosition } from '../progress/videoSession';
import type { SubtitleCue, VideoEntry } from '../types';

export function useBilingualVideo(videoId: string): {
  video: VideoEntry | null;
  loadFailure: VideoLoadFailure | null;
} {
  const [video, setVideo] = useState<VideoEntry | null>(null);
  const [loadFailure, setLoadFailure] = useState<VideoLoadFailure | null>(null);

  useEffect(() => {
    let alive = true;
    setVideo(null);
    setLoadFailure(null);
    void loadVideo(videoId)
      .then((loaded) => {
        if (!loaded) throw new Error(`Unknown video material: ${videoId}`);
        if (alive) setVideo(loaded);
      })
      .catch((cause: unknown) => {
        const failure = describeVideoLoadFailure(videoId, cause);
        if (alive) {
          reportError(failure.error);
          setLoadFailure(failure);
        }
      });
    return () => {
      alive = false;
    };
  }, [videoId]);

  return { video, loadFailure };
}

export function useResolvedVideoResumePosition(
  video: VideoEntry | null,
  resumePosition?: VideoResumePosition
) {
  return useMemo(
    () =>
      video && resumePosition
        ? resolveVideoResumePosition(
            resumePosition,
            video.cues,
            video.mediaStartTime,
            video.durationSeconds
          )
        : undefined,
    [resumePosition, video]
  );
}

export function useCompactLandscapeScrollReset(isActive: boolean): void {
  useEffect(() => {
    if (!isActive) return;

    const compactLandscape = window.matchMedia(
      '(max-width: 920px) and (orientation: landscape) and (max-height: 520px)'
    );
    let firstFrame = 0;
    let secondFrame = 0;
    const resetOuterScroll = () => {
      // Android Chrome preserves the document scroll anchor across rotation.
      // Wait for the compact layout, then reset only the outer page scroll;
      // SubtitlePanel owns and preserves its virtualized list position.
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        });
      });
    };
    compactLandscape.addEventListener('change', resetOuterScroll);
    return () => {
      compactLandscape.removeEventListener('change', resetOuterScroll);
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [isActive]);
}

type PositionPersistenceOptions = {
  isActive: boolean;
  video: VideoEntry | null;
  activeCue?: SubtitleCue;
  activeCueIndex: number;
  currentTime: number;
  pause: () => void;
  onPositionChange?: (videoId: string, position: VideoResumePosition) => void;
};

export function useVideoPositionPersistence({
  isActive,
  video,
  activeCue,
  activeCueIndex,
  currentTime,
  pause,
  onPositionChange,
}: PositionPersistenceOptions): void {
  const lastPositionSaveRef = useRef({ at: 0, cueId: '' });
  const latestPositionRef = useRef<{
    videoId: string;
    position: VideoResumePosition;
  } | null>(null);

  useEffect(() => {
    if (isActive) return;
    pause();
    const latest = latestPositionRef.current;
    if (latest && onPositionChange) onPositionChange(latest.videoId, latest.position);
  }, [isActive, onPositionChange, pause]);

  useEffect(() => {
    if (!video || !activeCue || !onPositionChange) return;
    const now = Date.now();
    const last = lastPositionSaveRef.current;
    const cueChanged = last.cueId !== activeCue.id;
    const enoughTimePassed = now - last.at >= 500;
    const position: VideoResumePosition = {
      cueId: activeCue.id,
      cueIndex: activeCueIndex,
      currentTime,
      updatedAt: new Date(now).toISOString(),
    };
    latestPositionRef.current = { videoId: video.id, position };
    if (!cueChanged && !enoughTimePassed) return;

    lastPositionSaveRef.current = {
      at: now,
      cueId: activeCue.id,
    };
    onPositionChange(video.id, position);
  }, [activeCue, activeCueIndex, currentTime, onPositionChange, video]);

  useEffect(
    () => () => {
      const latest = latestPositionRef.current;
      if (latest && onPositionChange) onPositionChange(latest.videoId, latest.position);
    },
    [onPositionChange]
  );
}
