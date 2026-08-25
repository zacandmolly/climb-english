import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { resolveStaticAssetUrl } from '../lib/ui';
import type { YouTubePlayerRef } from './YouTubePlayer';

type CueMediaSource = 'local' | 'preview' | 'youtube' | 'unavailable';

export type CueMediaHandle = {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  setPlaybackRate: (rate: number) => void;
};

type DesiredPlayback = { time: number; rate: number; playing: boolean };

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

function initialMediaSource({
  mediaUrl,
  youtubeId,
  previewMediaUrl,
  preferPreview,
}: Pick<CueMediaProps, 'mediaUrl' | 'youtubeId' | 'previewMediaUrl' | 'preferPreview'>) {
  if (preferPreview && previewMediaUrl) return 'preview';
  if (mediaUrl) return 'local';
  if (previewMediaUrl) return 'preview';
  if (youtubeId) return 'youtube';
  return 'unavailable';
}

// One clock for three delivery layers:
//   local currentTime === previewStartOffset + preview currentTime
//                     === YouTube currentTime - mediaStartTime
//
// Large files start on a tiny Git-tracked preview while the YouTube iframe is
// cued in the background. Smaller deployed clips keep using their full local
// mp4; if it is absent they fall back to the same preview-first path.
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
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const youtubeHostRef = useRef<HTMLDivElement | null>(null);
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
  const inPreviewWindow = (time: number) =>
    time >= previewRelativeStart - 0.05 && time < previewRelativeEnd - 0.05;

  const switchToYoutube = () => {
    if (!youtubeReady || !youtubePlayerRef.current) return false;
    previewVideoRef.current?.pause();
    setSource('youtube');
    return true;
  };

  useImperativeHandle(
    forwardedRef,
    () => ({
      seekTo(seconds) {
        const time = Math.max(0, seconds);
        desiredRef.current.time = time;
        try {
          if (source === 'local' && localVideoRef.current) {
            localVideoRef.current.currentTime = time;
          } else if (source === 'preview' && previewVideoRef.current && inPreviewWindow(time)) {
            previewVideoRef.current.currentTime = Math.max(0, time - previewRelativeStart);
          } else if (source === 'preview' && switchToYoutube()) {
            youtubePlayerRef.current?.seekTo(time + mediaStartTime, true);
          } else if (source === 'youtube' && youtubePlayerRef.current) {
            youtubePlayerRef.current.seekTo(time + mediaStartTime, true);
          }
        } catch {
          // desiredRef is applied once metadata/the iframe is ready.
        }
      },
      play() {
        desiredRef.current.playing = true;
        if (source === 'local' && localVideoRef.current) {
          void localVideoRef.current.play().catch(() => undefined);
        } else if (
          source === 'preview' &&
          previewVideoRef.current &&
          inPreviewWindow(desiredRef.current.time)
        ) {
          previewVideoRef.current.playbackRate = desiredRef.current.rate;
          void previewVideoRef.current.play().catch(() => undefined);
        } else if (source === 'preview' && switchToYoutube()) {
          const player = youtubePlayerRef.current;
          player?.seekTo(desiredRef.current.time + mediaStartTime, true);
          player?.setPlaybackRate(desiredRef.current.rate);
          player?.playVideo();
        } else if (source === 'youtube' && youtubePlayerRef.current) {
          try {
            youtubePlayerRef.current.setPlaybackRate(desiredRef.current.rate);
            youtubePlayerRef.current.playVideo();
          } catch {
            // onReady completes the queued play.
          }
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
          // onReady/onCanPlay reads the desired rate.
        }
      },
    }),
    [mediaStartTime, previewRelativeStart, previewRelativeEnd, source, youtubeReady]
  );

  useEffect(() => {
    if (!youtubeEnabled) return;
    let cancelled = false;

    const setup = () => {
      if (cancelled || !youtubeHostRef.current || !window.YT?.Player) return;
      const player = new window.YT.Player(youtubeHostRef.current, {
        videoId: youtubeId,
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          enablejsapi: 1,
          origin: typeof window !== 'undefined' ? window.location.origin : undefined,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            const desired = desiredRef.current;
            player.setPlaybackRate(desired.rate);
            setYoutubeReady(true);
            setYoutubeFailed(false);
            if (sourceRef.current === 'preview' && inPreviewWindow(desired.time)) {
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
            setYoutubeFailed(true);
            setYoutubeReady(false);
            if (sourceRef.current === 'youtube') {
              desiredRef.current.playing = false;
              onPlayingChangeRef.current(false);
              setSource('unavailable');
            }
          },
        },
      });
      youtubePlayerRef.current = player;
    };

    if (window.YT?.Player) {
      setup();
    } else {
      const previousReady = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        previousReady?.();
        setup();
      };
      if (!document.querySelector('script[data-youtube-iframe-api]')) {
        const script = document.createElement('script');
        script.src = 'https://www.youtube.com/iframe_api';
        script.dataset.youtubeIframeApi = 'true';
        document.head.appendChild(script);
      }
    }

    return () => {
      cancelled = true;
      try {
        youtubePlayerRef.current?.destroy();
      } catch {
        // The API can throw if React already detached the host element.
      }
      youtubePlayerRef.current = null;
      setYoutubeReady(false);
    };
  }, [mediaStartTime, previewRelativeEnd, youtubeEnabled, youtubeId]);

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
    const id = window.setTimeout(() => setYoutubeSlow(true), 20_000);
    return () => window.clearTimeout(id);
  }, [youtubeEnabled, youtubeFailed, youtubeId, youtubeReady]);

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

  const syncPreviewToDesired = (video: HTMLVideoElement) => {
    const desired = desiredRef.current;
    video.playbackRate = desired.rate;
    if (inPreviewWindow(desired.time)) {
      video.currentTime = Math.max(0, desired.time - previewRelativeStart);
      if (desired.playing) void video.play().catch(() => undefined);
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
    <div className="cue-media-surface" data-media-source={source}>
      {source === 'local' ? (
        <video
          ref={localVideoRef}
          className="local-video"
          src={resolveStaticAssetUrl(mediaUrl)}
          controls
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
          controls
          preload="auto"
          playsInline
          onLoadedMetadata={(event) => syncPreviewToDesired(event.currentTarget)}
          onCanPlay={(event) => syncPreviewToDesired(event.currentTarget)}
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
          ref={youtubeHostRef}
        />
      ) : null}

      {source === 'preview' ? (
        <>
          <p className="media-source-note preview-note" role="status">
            20 秒快速预览 · 完整视频正在后台载入
          </p>
          {youtubeSlow || youtubeFailed ? (
            <div className="yt-loading compact" aria-live="polite">
              <p>
                {youtubeFailed
                  ? '快速预览可继续播放，但 YouTube 完整视频暂不可用。'
                  : 'YouTube 仍在缓冲；快速预览会继续显示，避免黑屏。'}
              </p>
            </div>
          ) : null}
        </>
      ) : null}

      {source === 'youtube' ? (
        <>
          {!youtubeReady ? (
            <div className="yt-loading" aria-live="polite">
              <p>
                {youtubeSlow
                  ? 'YouTube 视频加载缓慢或失败，请检查网络（VPN/代理）后刷新重试…'
                  : '正在载入 YouTube 完整视频；就绪后会按同一时间轴继续播放。'}
              </p>
            </div>
          ) : null}
          <p className="media-source-note" role="status">
            当前使用 YouTube 原视频；句子剪切与卡拉 OK 仍按导入 cue 时间轴运行。
          </p>
        </>
      ) : null}

      {source === 'unavailable' ? (
        <div className="no-media">
          <p>本地媒体与 YouTube 备用源均不可用。</p>
          <a href={sourceUrl} target="_blank" rel="noreferrer">
            在 YouTube 打开原视频
          </a>
        </div>
      ) : null}
    </div>
  );
});
