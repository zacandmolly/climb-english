import { ChevronRight, Gauge, Play, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatTime, resolveStaticAssetUrl } from '../lib/ui';
import type { PracticeMode } from '../types';
import { END_PAD_SECONDS, PRE_ROLL_SECONDS } from './playback';

export function LocalVideoPlayer({
  mediaUrl,
  mediaStartTime,
  rangeStart,
  rangeEnd,
  rangeKey,
  mode,
  playRequestId,
  hasNextSentence,
  onNextSentence,
  onTimeReport,
}: {
  mediaUrl: string;
  mediaStartTime: number;
  rangeStart: number;
  rangeEnd: number;
  rangeKey: string;
  mode: PracticeMode;
  playRequestId: number;
  hasNextSentence: boolean;
  onNextSentence: () => void;
  onTimeReport: (mediaTime: number) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const resolvedMediaUrl = resolveStaticAssetUrl(mediaUrl);
  const cueStart = Math.max(0, rangeStart - mediaStartTime);
  const cueEnd = Math.max(cueStart + 0.1, rangeEnd - mediaStartTime);
  const playStart = Math.max(0, cueStart - PRE_ROLL_SECONDS);
  const playEnd = cueEnd + END_PAD_SECONDS;

  const seekToPreroll = () => {
    const video = videoRef.current;
    if (!video) return;

    video.pause();
    video.currentTime = playStart;
    setIsPlaying(false);
  };

  const playRange = () => {
    const video = videoRef.current;
    if (!video) return;

    video.currentTime = playStart;
    video.playbackRate = playbackRate;
    void video.play();
    setIsPlaying(true);
  };

  useEffect(() => {
    seekToPreroll();
  }, [playStart, rangeKey]);

  useEffect(() => {
    if (playRequestId === 0) return;
    playRange();
  }, [playRequestId]);

  const togglePlaybackRate = () => {
    const nextRate = playbackRate === 1 ? 0.75 : 1;
    setPlaybackRate(nextRate);
    if (videoRef.current) videoRef.current.playbackRate = nextRate;
  };

  const handleTimeUpdate = () => {
    const video = videoRef.current;
    if (!video) return;

    // Live-follow reporting: while the video is actually playing, convert the
    // element time back onto the caption timeline (sentence startTime/endTime)
    // so the transcript can highlight the sentence being spoken. Skipped when
    // paused so the loop-rewind does not reset the highlight back to 0.
    if (!video.paused && !video.ended) {
      onTimeReport(video.currentTime + mediaStartTime);
    }

    const boundedPlayEnd = Number.isFinite(video.duration)
      ? Math.min(playEnd, video.duration)
      : playEnd;

    if (video.currentTime >= boundedPlayEnd) {
      video.pause();
      video.currentTime = playStart;
      setIsPlaying(false);
    }
  };

  return (
    <section className="video-panel" aria-label="比赛视频">
      <div className="video-frame">
        <video
          ref={videoRef}
          className="local-video"
          src={resolvedMediaUrl}
          controls
          preload="metadata"
          playsInline
          onTimeUpdate={handleTimeUpdate}
          onPause={() => setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
        />
      </div>
      <div className="video-controls">
        <button
          className="control-button primary"
          type="button"
          onClick={playRange}
          title="播放当前练习块"
        >
          <Play size={16} aria-hidden="true" />
          {isPlaying ? '重播本句' : '播放'}
        </button>
        <button className="control-button" type="button" onClick={playRange} title="重放">
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
