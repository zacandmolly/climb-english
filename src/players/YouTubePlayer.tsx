import { ChevronRight, Gauge, Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatTime } from '../lib/ui';
import type { PracticeMode } from '../types';
import { END_PAD_SECONDS, PRE_ROLL_SECONDS } from './playback';
import { clearYoutubeMount, ensureYoutubeMount, loadYoutubeIframeApi } from './youtubeIframe';

export type YouTubePlayerRef = {
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  setPlaybackRate: (rate: number) => void;
  getCurrentTime: () => number;
  destroy: () => void;
};

type YouTubeGlobal = {
  Player: new (el: HTMLElement, config: Record<string, unknown>) => YouTubePlayerRef;
  PlayerState: { PLAYING: number; PAUSED: number; ENDED: number };
};

declare global {
  interface Window {
    YT?: YouTubeGlobal;
    onYouTubeIframeAPIReady?: () => void;
  }
}

export function YouTubePlayer({
  videoId,
  rangeStart,
  rangeEnd,
  rangeKey,
  mode,
  playRequestId,
  hasNextSentence,
  onNextSentence,
  onTimeReport,
}: {
  videoId: string;
  rangeStart: number;
  rangeEnd: number;
  rangeKey: string;
  mode: PracticeMode;
  playRequestId: number;
  hasNextSentence: boolean;
  onNextSentence: () => void;
  onTimeReport: (mediaTime: number) => void;
}) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YouTubePlayerRef | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  // 播放按钮的点击排队计数：YouTube 嵌入经代理网络加载常需 10 秒以上，
  // 就绪前点击播放不能是静默死点击——排队，就绪后自动播（与 App 层
  // playRequestId 同一个模式）。
  const [playTick, setPlayTick] = useState(0);
  const [isSlowLoad, setIsSlowLoad] = useState(false);
  const playStart = Math.max(0, rangeStart - PRE_ROLL_SECONDS);
  const playEnd = rangeEnd + END_PAD_SECONDS;
  // YouTube sentence times already live on the video timeline, so the
  // reported time needs no mediaStartTime offset. Keep the callback in a ref
  // so the polling interval effect does not restart on every parent render.
  const onTimeReportRef = useRef(onTimeReport);
  onTimeReportRef.current = onTimeReport;

  useEffect(() => {
    if (!videoId) return;
    let cancelled = false;

    const setup = () => {
      if (cancelled || !window.YT) return;
      const mount = ensureYoutubeMount(wrapperRef.current);
      if (!mount) return;
      const player = new window.YT.Player(mount, {
        videoId,
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
            player.seekTo(playStart, true);
            player.pauseVideo();
            setIsReady(true);
          },
          onStateChange: (event: { data: number }) => {
            if (event.data === window.YT?.PlayerState.PLAYING) setIsPlaying(true);
            if (
              event.data === window.YT?.PlayerState.PAUSED ||
              event.data === window.YT?.PlayerState.ENDED
            ) {
              setIsPlaying(false);
            }
          },
        },
      });
      playerRef.current = player;
    };

    void loadYoutubeIframeApi().then(setup, () => {
      if (!cancelled) setIsSlowLoad(true);
    });

    return () => {
      cancelled = true;
      try {
        playerRef.current?.destroy();
      } catch {
        // YouTube player can throw if the host element was already detached.
      }
      playerRef.current = null;
      clearYoutubeMount(wrapperRef.current);
    };
  }, [videoId]);

  useEffect(() => {
    if (!isReady) return;
    const player = playerRef.current;
    if (!player) return;
    try {
      player.pauseVideo();
      player.seekTo(playStart, true);
    } catch {
      // Player might still be initializing; ignore.
    }
    setIsPlaying(false);
  }, [rangeKey, isReady, playStart]);

  useEffect(() => {
    if (!isReady) return;
    const id = window.setInterval(() => {
      const player = playerRef.current;
      if (!player) return;
      try {
        const currentTime = player.getCurrentTime();
        // Live-follow reporting (only while playing, so the loop-rewind does
        // not reset the transcript highlight back to the first sentence).
        if (isPlaying && currentTime < playEnd) {
          onTimeReportRef.current(currentTime);
        }
        if (currentTime >= playEnd) {
          player.pauseVideo();
          player.seekTo(playStart, true);
          setIsPlaying(false);
        }
      } catch {
        // ignore
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [isReady, isPlaying, playEnd, playStart]);

  const playRange = () => {
    const player = playerRef.current;
    if (!player) return;
    try {
      player.seekTo(playStart, true);
      player.setPlaybackRate(playbackRate);
      player.playVideo();
    } catch {
      // ignore
    }
  };

  // 加载缓慢提示：YouTube 嵌入长时间未就绪时告知用户，而不是无限空白。
  useEffect(() => {
    if (isReady) return;
    setIsSlowLoad(false);
    const id = window.setTimeout(() => setIsSlowLoad(true), 20000);
    return () => window.clearTimeout(id);
  }, [isReady, videoId]);

  useEffect(() => {
    if (playRequestId === 0) return;
    if (!isReady) return;
    playRange();
  }, [playRequestId, isReady]);

  // 排队播放：就绪前点的播放，在就绪后自动执行。
  useEffect(() => {
    if (playTick === 0) return;
    if (!isReady) return;
    playRange();
  }, [playTick, isReady]);

  const togglePlaybackRate = () => {
    const next = playbackRate === 1 ? 0.75 : 1;
    setPlaybackRate(next);
    try {
      playerRef.current?.setPlaybackRate(next);
    } catch {
      // ignore
    }
  };

  return (
    <section className="video-panel" aria-label="比赛视频">
      <div className="video-frame">
        <div className="youtube-player-host" ref={wrapperRef} />
        {!isReady ? (
          <div className="yt-loading" aria-live="polite">
            <p>
              {isSlowLoad
                ? 'YouTube 视频加载缓慢或失败，请检查网络（VPN/代理）后刷新重试…'
                : 'YouTube 视频加载中…（经代理网络首次加载可能需要十几秒，就绪前点的播放会自动排队）'}
            </p>
          </div>
        ) : null}
      </div>
      <div className="video-controls">
        <button
          className="control-button primary"
          type="button"
          onClick={() => setPlayTick((tick) => tick + 1)}
          title={isReady ? '播放当前练习块' : '视频加载中，点击后将自动播放'}
        >
          <Play size={16} aria-hidden="true" />
          {!isReady ? '播放（排队中）' : isPlaying ? '重播本句' : '播放'}
        </button>
        <button
          className="control-button"
          type="button"
          onClick={() => setPlayTick((tick) => tick + 1)}
          title="重放"
        >
          <RotateCcw size={16} aria-hidden="true" />
          重放
        </button>
        <button
          className={`control-button ${playbackRate === 0.75 ? 'active' : ''}`}
          type="button"
          onClick={togglePlaybackRate}
          title="慢速播放"
        >
          <Gauge size={16} aria-hidden="true" />
          {playbackRate === 0.75 ? '0.75x' : '慢速'}
        </button>
        {mode === 'sentence' ? (
          <button
            className="control-button"
            type="button"
            disabled={!hasNextSentence}
            onClick={onNextSentence}
            title="下一句"
          >
            <ChevronRight size={16} aria-hidden="true" />
            下一句
          </button>
        ) : null}
        <span className="time-chip">
          {formatTime(rangeStart)} - {formatTime(rangeEnd)}
          <span>预备 {PRE_ROLL_SECONDS}s</span>
        </span>
      </div>
    </section>
  );
}
