import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { resolveStaticAssetUrl } from '../lib/ui';
import type { YouTubePlayerRef } from './YouTubePlayer';

type CueMediaSource = 'local' | 'youtube' | 'unavailable';

export type CueMediaHandle = {
  seekTo: (seconds: number) => void;
  play: () => void;
  pause: () => void;
  setPlaybackRate: (rate: number) => void;
};

type DesiredPlayback = {
  time: number;
  rate: number;
  playing: boolean;
};

// One imperative media surface for the karaoke cue player. A generated video
// normally points at a local, web-optimised mp4. Large imports are intentionally
// not committed, though, so a GitHub Pages build may not contain that file. If
// the local asset fails, switch to the original YouTube video while preserving
// the same clip-relative clock for useCuePlayer:
//
//   local currentTime === youtube currentTime - mediaStartTime
//
// That invariant keeps cue seeking, sentence boundaries, and karaoke follow
// identical for Bern-style clipped media and for current/future YouTube fallbacks.
export const CueMediaPlayer = forwardRef<
  CueMediaHandle,
  {
    mediaUrl: string;
    youtubeId: string;
    mediaStartTime: number;
    sourceUrl: string;
    onTimeUpdate: (videoTime: number) => void;
    onPlayingChange: (playing: boolean) => void;
  }
>(function CueMediaPlayer(
  { mediaUrl, youtubeId, mediaStartTime, sourceUrl, onTimeUpdate, onPlayingChange },
  forwardedRef
) {
  const [source, setSource] = useState<CueMediaSource>(() =>
    mediaUrl ? 'local' : youtubeId ? 'youtube' : 'unavailable'
  );
  const [youtubeReady, setYoutubeReady] = useState(false);
  const [youtubeSlow, setYoutubeSlow] = useState(false);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const youtubeHostRef = useRef<HTMLDivElement | null>(null);
  const youtubePlayerRef = useRef<YouTubePlayerRef | null>(null);
  const fallbackInProgressRef = useRef(false);
  const desiredRef = useRef<DesiredPlayback>({ time: 0, rate: 1, playing: false });
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const onPlayingChangeRef = useRef(onPlayingChange);
  onTimeUpdateRef.current = onTimeUpdate;
  onPlayingChangeRef.current = onPlayingChange;

  useImperativeHandle(
    forwardedRef,
    () => ({
      seekTo(seconds) {
        const time = Math.max(0, seconds);
        desiredRef.current.time = time;
        try {
          if (source === 'local' && localVideoRef.current) {
            localVideoRef.current.currentTime = time;
          } else if (source === 'youtube' && youtubePlayerRef.current) {
            youtubePlayerRef.current.seekTo(time + mediaStartTime, true);
          }
        } catch {
          // Preserve desiredRef so a still-initialising or fallback player can
          // apply the seek once its metadata/API is ready.
        }
      },
      play() {
        desiredRef.current.playing = true;
        if (source === 'local' && localVideoRef.current) {
          void localVideoRef.current.play().catch(() => {
            // The media element's error event owns the YouTube fallback. Keep
            // the desired playing state so onReady can resume automatically.
          });
        } else if (source === 'youtube' && youtubePlayerRef.current) {
          try {
            youtubePlayerRef.current.setPlaybackRate(desiredRef.current.rate);
            youtubePlayerRef.current.playVideo();
          } catch {
            // onReady reads desiredRef and completes the queued play.
          }
        }
      },
      pause() {
        desiredRef.current.playing = false;
        try {
          if (source === 'local') localVideoRef.current?.pause();
          if (source === 'youtube') youtubePlayerRef.current?.pauseVideo();
        } catch {
          // Desired state is already authoritative for the next ready event.
        }
        onPlayingChangeRef.current(false);
      },
      setPlaybackRate(rate) {
        desiredRef.current.rate = rate;
        try {
          if (source === 'local' && localVideoRef.current) {
            localVideoRef.current.playbackRate = rate;
          } else if (source === 'youtube' && youtubePlayerRef.current) {
            youtubePlayerRef.current.setPlaybackRate(rate);
          }
        } catch {
          // onReady reads the desired rate.
        }
      },
    }),
    [mediaStartTime, source]
  );

  useEffect(() => {
    if (source !== 'youtube' || !youtubeId) return;
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
            player.seekTo(desired.time + mediaStartTime, true);
            player.setPlaybackRate(desired.rate);
            if (desired.playing) player.playVideo();
            else player.pauseVideo();
            setYoutubeReady(true);
          },
          onStateChange: (event: { data: number }) => {
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
            desiredRef.current.playing = false;
            onPlayingChangeRef.current(false);
            setSource('unavailable');
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
  }, [mediaStartTime, source, youtubeId]);

  useEffect(() => {
    if (source !== 'youtube' || !youtubeReady) return;
    const id = window.setInterval(() => {
      const player = youtubePlayerRef.current;
      if (!player || !desiredRef.current.playing) return;
      try {
        onTimeUpdateRef.current(Math.max(0, player.getCurrentTime() - mediaStartTime));
      } catch {
        // The iframe may be navigating or tearing down between polls.
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [mediaStartTime, source, youtubeReady]);

  useEffect(() => {
    if (source !== 'youtube' || youtubeReady) return;
    setYoutubeSlow(false);
    const id = window.setTimeout(() => setYoutubeSlow(true), 20_000);
    return () => window.clearTimeout(id);
  }, [source, youtubeId, youtubeReady]);

  const fallbackToYoutube = () => {
    fallbackInProgressRef.current = true;
    const video = localVideoRef.current;
    if (video && Number.isFinite(video.currentTime)) {
      desiredRef.current.time = Math.max(0, video.currentTime);
      desiredRef.current.rate = video.playbackRate;
    }
    const shouldResume = desiredRef.current.playing;
    localVideoRef.current?.pause();
    desiredRef.current.playing = shouldResume;
    onPlayingChangeRef.current(false);
    setSource(youtubeId ? 'youtube' : 'unavailable');
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
          onError={fallbackToYoutube}
        />
      ) : null}

      {source === 'youtube' ? (
        <>
          <div className="youtube-player-host" ref={youtubeHostRef} />
          {!youtubeReady ? (
            <div className="yt-loading" aria-live="polite">
              <p>
                {youtubeSlow
                  ? 'YouTube 视频加载缓慢或失败，请检查网络（VPN/代理）后刷新重试…'
                  : '本地剪切媒体未随当前部署发布，正在切换到 YouTube 原视频；就绪后会按同一时间轴继续播放。'}
              </p>
            </div>
          ) : null}
          <p className="media-source-note" role="status">
            当前使用 YouTube 原视频；句子剪切与卡拉OK仍按导入 cue 时间轴运行。
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
