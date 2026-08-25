import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cueAtTime } from '../lib/cue';
import type { SubtitleCue } from '../types';

const PRE_ROLL_SECONDS = 0.3;
const END_PAD_SECONDS = 0.25;

export type CuePlaybackMode = 'idle' | 'cue' | 'continuous';

// Drives one <video> element against a cue list:
//  - playCue(index): plays exactly that cue (with a small pre-roll so the
//    first word's attack is never clipped), pauses at cue end or loops.
//  - playContinuous(): plays the video freely; the active cue highlight
//    follows playback like a karaoke subtitle track.
export function useCuePlayer(cues: SubtitleCue[], mediaStartTime: number) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [mode, setMode] = useState<CuePlaybackMode>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopOne, setLoopOne] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [activeCueIndex, setActiveCueIndex] = useState(0);
  const activeRangeRef = useRef<{ index: number; start: number; end: number } | null>(null);
  const loopOneRef = useRef(loopOne);
  loopOneRef.current = loopOne;

  const toVideoTime = useCallback(
    (cueTime: number) => Math.max(0, cueTime - mediaStartTime),
    [mediaStartTime],
  );

  const cueAtVideoTime = useCallback(
    (videoTime: number) => cueAtTime(cues, videoTime + mediaStartTime),
    [cues, mediaStartTime],
  );

  const playCue = useCallback(
    (index: number) => {
      const video = videoRef.current;
      const cue = cues[index];
      if (!video || !cue) return;

      const start = Math.max(0, toVideoTime(cue.startTime) - PRE_ROLL_SECONDS);
      const end = Math.max(start + 0.1, toVideoTime(cue.endTime) + END_PAD_SECONDS);
      activeRangeRef.current = { index, start, end };
      setActiveCueIndex(index);
      setMode('cue');
      video.currentTime = start;
      video.playbackRate = playbackRate;
      void video.play();
    },
    [cues, playbackRate, toVideoTime],
  );

  const playContinuous = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;
    activeRangeRef.current = null;
    setMode('continuous');
    video.playbackRate = playbackRate;
    void video.play();
  }, [playbackRate]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
    setMode('idle');
    activeRangeRef.current = null;
  }, []);

  const seekToCue = useCallback(
    (index: number) => {
      const video = videoRef.current;
      const cue = cues[index];
      if (!video || !cue) return;
      video.currentTime = Math.max(0, toVideoTime(cue.startTime) - PRE_ROLL_SECONDS);
      setActiveCueIndex(index);
    },
    [cues, toVideoTime],
  );

  const handleTimeUpdate = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    const range = activeRangeRef.current;
    if (range && video.currentTime >= range.end) {
      if (loopOneRef.current) {
        video.currentTime = range.start;
        return;
      }
      video.pause();
      video.currentTime = range.start;
      activeRangeRef.current = null;
      setMode('idle');
      return;
    }

    if (!range) {
      setActiveCueIndex(cueAtVideoTime(video.currentTime));
    }
  }, [cueAtVideoTime]);

  const toggleRate = useCallback(() => {
    setPlaybackRate((rate) => {
      const next = rate === 1 ? 0.75 : rate === 0.75 ? 0.5 : 1;
      if (videoRef.current) videoRef.current.playbackRate = next;
      return next;
    });
  }, []);

  const player = useMemo(
    () => ({
      videoRef,
      mode,
      isPlaying,
      loopOne,
      playbackRate,
      activeCueIndex,
      playCue,
      playContinuous,
      pause,
      seekToCue,
      toggleRate,
      setLoopOne,
      handleTimeUpdate,
      setIsPlaying,
    }),
    [
      mode,
      isPlaying,
      loopOne,
      playbackRate,
      activeCueIndex,
      playCue,
      playContinuous,
      pause,
      seekToCue,
      toggleRate,
      handleTimeUpdate,
    ],
  );

  useEffect(() => {
    activeRangeRef.current = null;
    setMode('idle');
    setActiveCueIndex(0);
  }, [cues]);

  return player;
}
