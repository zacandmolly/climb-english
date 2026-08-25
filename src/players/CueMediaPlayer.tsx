import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { resolveStaticAssetUrl } from '../lib/ui';
import type { YouTubePlayerRef } from './YouTubePlayer';
import { CueMediaStatus } from './CueMediaStatus';
import {
  initialMediaSource,
  inPreviewWindow,
  routeMediaAction,
  type CueMediaSource,
} from './cueMedia';
import { YOUTUBE_FAILURE_TIMEOUT_MS, YOUTUBE_SLOW_TIMEOUT_MS } from './playback';
import type { PlayerTestHooks } from './playback';
import { clearYoutubeMount, ensureYoutubeMount, loadYoutubeIframeApi } from './youtubeIframe';

export type CueMediaHandle = {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  setPlaybackRate: (rate: number) => void;
};

type DesiredPlayback = { time: number; rate: number; playing: boolean };

const PREVIEW_SEEK_EPSILON_SECONDS = 0.1;

type CueMediaProps = {
  mediaUrl: string;
  youtubeId: string;
  mediaStartTime: number;
  previewMediaUrl?: string;
  previewStartTime?: number;
  previewDurationSeconds?: number;
  preferPreview?: boolean;
  sourceUrl: string;
  onTimeUpdate: (videoTime: number) => void;
  onPlayingChange: (playing: boolean) => void;
};

// Deterministic test hook for the slow-ready timeout (Issue #24). Prod code
// uses YOUTUBE_SLOW_TIMEOUT_MS; e2e shortens it via an init script.
declare global {
  interface Window {
    __CLIMB_ENGLISH_PLAYER_HOOKS__?: PlayerTestHooks;
  }
}

// One relative clock spans local media, the 20-second preview and YouTube.
// Keep a React-owned wrapper because the IFrame API replaces its mount node.
// Switching is bidirectional, cleanup removes residue, and every load/error
// path preserves a visible frame plus an explicit recovery action (#22/#24).
export const CueMediaPlayer = forwardRef<CueMediaHandle, CueMediaProps>(function CueMediaPlayer(
  {
    mediaUrl,
    youtubeId,
    mediaStartTime,
    previewMediaUrl = '',
    previewStartTime = mediaStartTime,
    previewDurationSeconds = 20,
    preferPreview = false,
    sourceUrl,
    onTimeUpdate,
    onPlayingChange,
  },
  forwardedRef
) {
  const [source, setSource] = useState<CueMediaSource>(() =>
    initialMediaSource({ mediaUrl, youtubeId, previewMediaUrl, preferPreview })
  );
  const [youtubeReady, setYoutubeReady] = useState(false);
  const [youtubeSlow, setYoutubeSlow] = useState(false);
  const [youtubeFailed, setYoutubeFailed] = useState(false);
  const [youtubeRetryNonce, setYoutubeRetryNonce] = useState(0);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const youtubeWrapperRef = useRef<HTMLDivElement | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayerRef | null>(null);
  const fallbackInProgressRef = useRef(false);
  const desiredRef = useRef<DesiredPlayback>({
    time: preferPreview && previewMediaUrl ? Math.max(0, previewStartTime - mediaStartTime) : 0,
    rate: 1,
    playing: false,
  });
  const sourceRef = useRef(source);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onPlayingChangeRef = useRef(onPlayingChange);
  sourceRef.current = source;
  onTimeUpdateRef.current = onTimeUpdate;
  onPlayingChangeRef.current = onPlayingChange;

  const previewRelativeStart = Math.max(0, previewStartTime - mediaStartTime);
  const previewRelativeEnd = previewRelativeStart + previewDurationSeconds;
  const youtubeEnabled = Boolean(youtubeId && (source === 'preview' || source === 'youtube'));
  const inPreviewWindowFor = (time: number) =>
    inPreviewWindow(time, previewRelativeStart, previewRelativeEnd);

  const retryYoutube = () => {
    setYoutubeReady(false);
    setYoutubeFailed(false);
    setYoutubeSlow(false);
    setYoutubeRetryNonce((nonce) => nonce + 1);
  };

  const switchToPreviewForRecovery = () => {
    if (!previewMediaUrl) return;
    try {
      youtubePlayerRef.current?.pauseVideo();
    } catch {
      // Player may already be gone; the recovery state below still applies.
    }
    desiredRef.current.time = previewRelativeStart;
    desiredRef.current.playing = true;
    onTimeUpdateRef.current(previewRelativeStart);
    onPlayingChangeRef.current(false);
    setSource('preview');
  };

  useImperativeHandle(
    forwardedRef,
    () => ({
      seekTo(seconds) {
        const time = Math.max(0, seconds);
        desiredRef.current.time = time;
        try {
          const route = routeMediaAction({
            source: sourceRef.current,
            time,
            mediaStartTime,
            previewStart: previewRelativeStart,
            previewEnd: previewRelativeEnd,
            hasPreviewMedia: Boolean(previewMediaUrl),
            youtubeReady,
          });
          if (route.kind === 'local') {
            if (localVideoRef.current) localVideoRef.current.currentTime = time;
          } else if (route.kind === 'preview') {
            if (sourceRef.current === 'youtube') {
              youtubePlayerRef.current?.pauseVideo();
              desiredRef.current.playing = false;
              onPlayingChangeRef.current(false);
              setSource('preview');
            }
            const preview = previewVideoRef.current;
            if (preview && inPreviewWindowFor(time)) {
              preview.currentTime = route.previewTime;
            }
          } else if (route.kind === 'youtube') {
            if (sourceRef.current === 'preview' && route.switchSource) setSource('youtube');
            youtubePlayerRef.current?.seekTo(route.absoluteTime, true);
          }
        } catch {
          // desiredRef is applied once metadata/the iframe is ready.
        }
      },
      play() {
        const route = routeMediaAction({
          source: sourceRef.current,
          time: desiredRef.current.time,
          mediaStartTime,
          previewStart: previewRelativeStart,
          previewEnd: previewRelativeEnd,
          hasPreviewMedia: Boolean(previewMediaUrl),
          youtubeReady,
        });
        if (route.kind === 'preview' && sourceRef.current === 'youtube') {
          // Pause first so the PAUSED state event cannot overwrite the
          // desired playing flag we set below.
          youtubePlayerRef.current?.pauseVideo();
        }
        desiredRef.current.playing = true;
        try {
          if (route.kind === 'local') {
            if (localVideoRef.current) void localVideoRef.current.play().catch(() => undefined);
          } else if (route.kind === 'preview') {
            if (sourceRef.current === 'youtube') setSource('preview');
            const preview = previewVideoRef.current;
            if (preview) {
              preview.playbackRate = desiredRef.current.rate;
              void preview.play().catch(() => undefined);
            }
          } else if (route.kind === 'youtube') {
            if (sourceRef.current === 'preview' && route.switchSource) setSource('youtube');
            const player = youtubePlayerRef.current;
            if (player) {
              player.seekTo(route.absoluteTime, true);
              player.setPlaybackRate(desiredRef.current.rate);
              player.playVideo();
            }
          }
        } catch {
          // onReady completes the queued play.
        }
      },
      pause() {
        desiredRef.current.playing = false;
        try {
          if (source === 'local') localVideoRef.current?.pause();
          if (source === 'preview') previewVideoRef.current?.pause();
          if (source === 'youtube') youtubePlayerRef.current?.pauseVideo();
        } catch {
          // Desired state remains authoritative.
        }
        onPlayingChangeRef.current(false);
      },
      setPlaybackRate(rate) {
        desiredRef.current.rate = rate;
        try {
          if (source === 'local' && localVideoRef.current)
            localVideoRef.current.playbackRate = rate;
          if (source === 'preview' && previewVideoRef.current)
            previewVideoRef.current.playbackRate = rate;
          if (source === 'youtube' && youtubePlayerRef.current)
            youtubePlayerRef.current.setPlaybackRate(rate);
        } catch {
          // onReady/onLoadedMetadata reads the desired rate.
        }
      },
    }),
    [mediaStartTime, previewRelativeStart, previewRelativeEnd, source, youtubeReady]
  );

  useEffect(() => {
    if (!youtubeEnabled) return;
    let cancelled = false;

    const setup = () => {
      if (cancelled || !window.YT?.Player) return;
      const mount = ensureYoutubeMount(youtubeWrapperRef.current);
      if (!mount) return;
      mount.querySelectorAll('iframe').forEach((node) => node.remove());

      let player: YouTubePlayerRef;
      try {
        player = new window.YT.Player(mount, {
          videoId: youtubeId,
          playerVars: {
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            enablejsapi: 1,
            controls: 0,
            disablekb: 1,
            origin: typeof window !== 'undefined' ? window.location.origin : undefined,
          },
          events: {
            onReady: () => {
              if (cancelled) return;
              const desired = desiredRef.current;
              player.setPlaybackRate(desired.rate);
              setYoutubeReady(true);
              setYoutubeFailed(false);
              setYoutubeSlow(false);
              if (sourceRef.current === 'preview' && inPreviewWindowFor(desired.time)) {
                // Prewarming: stay hidden on the preview, cue the YouTube
                // player at the exact handoff point.
                player.seekTo(previewRelativeEnd + mediaStartTime, true);
                player.pauseVideo();
                return;
              }
              player.seekTo(desired.time + mediaStartTime, true);
              if (sourceRef.current === 'preview') setSource('youtube');
              if (desired.playing) player.playVideo();
              else player.pauseVideo();
            },
            onStateChange: (event: { data: number }) => {
              if (sourceRef.current !== 'youtube') return;
              const playing = event.data === window.YT?.PlayerState.PLAYING;
              if (playing) desiredRef.current.playing = true;
              if (
                event.data === window.YT?.PlayerState.PAUSED ||
                event.data === window.YT?.PlayerState.ENDED
              ) {
                desiredRef.current.playing = false;
              }
              onPlayingChangeRef.current(playing);
            },
            onError: () => {
              if (cancelled) return;
              try {
                player.pauseVideo();
              } catch {
                // The player may already be unusable; recovery UI still shows.
              }
              setYoutubeReady(false);
              setYoutubeFailed(true);
              setYoutubeSlow(false);
              desiredRef.current.playing = false;
              onPlayingChangeRef.current(false);
            },
          },
        });
      } catch {
        if (!cancelled) {
          setYoutubeReady(false);
          setYoutubeFailed(true);
          setYoutubeSlow(false);
        }
        return;
      }
      youtubePlayerRef.current = player;
    };

    void loadYoutubeIframeApi({ retry: youtubeRetryNonce > 0 }).then(setup, () => {
      if (cancelled) return;
      setYoutubeReady(false);
      setYoutubeFailed(true);
      setYoutubeSlow(false);
    });

    return () => {
      cancelled = true;
      try {
        youtubePlayerRef.current?.destroy();
      } catch {
        // The API can throw if React already detached the wrapper.
      }
      youtubePlayerRef.current = null;
      clearYoutubeMount(youtubeWrapperRef.current);
      setYoutubeReady(false);
    };
  }, [
    mediaStartTime,
    previewRelativeEnd,
    previewRelativeStart,
    youtubeEnabled,
    youtubeId,
    youtubeRetryNonce,
  ]);

  useEffect(() => {
    if (source !== 'youtube' || !youtubeReady || !youtubePlayerRef.current) return;
    const player = youtubePlayerRef.current;
    const desired = desiredRef.current;
    try {
      player.seekTo(desired.time + mediaStartTime, true);
      player.setPlaybackRate(desired.rate);
      if (desired.playing) player.playVideo();
      else player.pauseVideo();
    } catch {
      // The next control action or polling tick will retry.
    }
  }, [mediaStartTime, source, youtubeReady]);

  useEffect(() => {
    if (source !== 'youtube' || !youtubeReady) return;
    const id = window.setInterval(() => {
      const player = youtubePlayerRef.current;
      if (!player || !desiredRef.current.playing) return;
      try {
        const time = Math.max(0, player.getCurrentTime() - mediaStartTime);
        desiredRef.current.time = time;
        onTimeUpdateRef.current(time);
      } catch {
        // The iframe may be navigating or tearing down between polls.
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [mediaStartTime, source, youtubeReady]);

  useEffect(() => {
    if (!youtubeEnabled || youtubeReady || youtubeFailed) return;
    setYoutubeSlow(false);
    const slowTimeoutMs =
      window.__CLIMB_ENGLISH_PLAYER_HOOKS__?.youtubeSlowTimeoutMs ?? YOUTUBE_SLOW_TIMEOUT_MS;
    const failureTimeoutMs =
      window.__CLIMB_ENGLISH_PLAYER_HOOKS__?.youtubeFailureTimeoutMs ?? YOUTUBE_FAILURE_TIMEOUT_MS;
    const slowId = window.setTimeout(() => setYoutubeSlow(true), slowTimeoutMs);
    const failureId = window.setTimeout(() => {
      setYoutubeSlow(false);
      setYoutubeFailed(true);
      if (sourceRef.current === 'youtube') {
        desiredRef.current.playing = false;
        onPlayingChangeRef.current(false);
      }
    }, failureTimeoutMs);
    return () => {
      window.clearTimeout(slowId);
      window.clearTimeout(failureId);
    };
  }, [youtubeEnabled, youtubeFailed, youtubeId, youtubeReady, youtubeRetryNonce]);

  const fallbackFromLocal = () => {
    fallbackInProgressRef.current = true;
    const video = localVideoRef.current;
    if (
      video &&
      Number.isFinite(video.currentTime) &&
      (video.currentTime > 0 || desiredRef.current.time === 0)
    ) {
      desiredRef.current.time = Math.max(0, video.currentTime);
      desiredRef.current.rate = video.playbackRate;
    }
    const shouldResume = desiredRef.current.playing;
    localVideoRef.current?.pause();
    if (previewMediaUrl && desiredRef.current.time === 0 && previewRelativeStart > 0) {
      desiredRef.current.time = previewRelativeStart;
    }
    desiredRef.current.playing = shouldResume;
    onPlayingChangeRef.current(false);
    setSource(previewMediaUrl ? 'preview' : youtubeId ? 'youtube' : 'unavailable');
  };

  // Readiness events report media state; they must not become a second clock.
  // In particular, never run this from `canplay`: assigning currentTime emits
  // seeking/seeked/canplay again in Chromium/WebKit and creates a feedback loop.
  const initializePreviewFromDesired = (video: HTMLVideoElement) => {
    const desired = desiredRef.current;
    video.playbackRate = desired.rate;
    if (inPreviewWindowFor(desired.time)) {
      const targetTime = Math.max(0, desired.time - previewRelativeStart);
      if (
        !video.seeking &&
        Math.abs(video.currentTime - targetTime) > PREVIEW_SEEK_EPSILON_SECONDS
      ) {
        video.currentTime = targetTime;
      }
      if (desired.playing && video.paused) void video.play().catch(() => undefined);
    } else if (youtubeReady) {
      setSource('youtube');
    }
  };

  const finishPreview = () => {
    desiredRef.current.time = previewRelativeEnd;
    onTimeUpdateRef.current(previewRelativeEnd);
    onPlayingChangeRef.current(false);
    if (youtubeReady) setSource('youtube');
  };

  return (
    <div
      className="cue-media-surface"
      data-media-source={source}
      data-youtube-state={
        youtubeFailed ? 'failed' : youtubeSlow ? 'slow' : youtubeReady ? 'ready' : 'loading'
      }
    >
      {source === 'local' ? (
        <video
          ref={localVideoRef}
          className="local-video"
          src={resolveStaticAssetUrl(mediaUrl)}
          preload="metadata"
          playsInline
          onTimeUpdate={(event) => {
            desiredRef.current.time = event.currentTarget.currentTime;
            onTimeUpdateRef.current(event.currentTarget.currentTime);
          }}
          onRateChange={(event) => {
            desiredRef.current.rate = event.currentTarget.playbackRate;
          }}
          onPause={() => {
            if (!fallbackInProgressRef.current) desiredRef.current.playing = false;
            onPlayingChangeRef.current(false);
          }}
          onPlay={() => {
            desiredRef.current.playing = true;
            onPlayingChangeRef.current(true);
          }}
          onError={fallbackFromLocal}
        />
      ) : null}

      {source === 'preview' ? (
        <video
          ref={previewVideoRef}
          className="local-video preview-video"
          src={resolveStaticAssetUrl(previewMediaUrl)}
          preload="auto"
          playsInline
          onLoadedMetadata={(event) => initializePreviewFromDesired(event.currentTarget)}
          onTimeUpdate={(event) => {
            const time = previewRelativeStart + event.currentTarget.currentTime;
            desiredRef.current.time = time;
            onTimeUpdateRef.current(time);
          }}
          onRateChange={(event) => {
            desiredRef.current.rate = event.currentTarget.playbackRate;
          }}
          onPause={() => onPlayingChangeRef.current(false)}
          onPlay={() => {
            desiredRef.current.playing = true;
            onPlayingChangeRef.current(true);
          }}
          onEnded={finishPreview}
          onError={() => setSource(youtubeId ? 'youtube' : 'unavailable')}
        />
      ) : null}

      {youtubeEnabled ? (
        <div
          className={`youtube-player-host ${source === 'preview' ? 'prewarming' : ''}`}
          ref={youtubeWrapperRef}
          aria-hidden={source === 'preview'}
        />
      ) : null}

      <CueMediaStatus
        source={source}
        youtubeReady={youtubeReady}
        youtubeSlow={youtubeSlow}
        youtubeFailed={youtubeFailed}
        youtubeRetrying={youtubeRetryNonce > 0}
        hasPreviewMedia={Boolean(previewMediaUrl)}
        previewDurationSeconds={previewDurationSeconds}
        sourceUrl={sourceUrl}
        onRetryYoutube={retryYoutube}
        onReplayPreview={switchToPreviewForRecovery}
      />
    </div>
  );
});
