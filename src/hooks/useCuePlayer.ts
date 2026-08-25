import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { cueAtTime } from '../lib/cue';
import type { CueMediaHandle } from '../players/CueMediaPlayer';
import type { Cue } from '../types';

const PRE_ROLL_SECONDS = 0.3;
const END_PAD_SECONDS = 0.25;

export type CuePlaybackMode = 'idle' | 'cue' | 'continuous';

// Drives one local-or-YouTube media surface against a cue list:
//  - playCue(index): plays exactly that cue (with a small pre-roll so the
//    first word's attack is never clipped), pauses at cue end or loops.
//  - playContinuous(): plays the video freely; the active cue highlight
//    follows playback like a karaoke subtitle track.
//
// Consumes the unified `Cue` base type (R12 Step 3 decoupling): the player only
// ever reads `startTime`/`endTime`, so it works on any Cue-derived timeline
// (SubtitleCue from VideoEntry, or PracticeSentence from Lesson) without
// knowing which model it is driving.
// resetKey is the stable clip identity. Resetting on the cues array reference
// reintroduced the "播放本句没反应" race when parent renders recreated that array.
export function useCuePlayer(cues: Cue[], mediaStartTime: number, resetKey: string) {
  const mediaRef = useRef<CueMediaHandle | null>(null);
  const [mode, setMode] = useState<CuePlaybackMode>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [loopOne, setLoopOne] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [activeCueIndex, setActiveCueIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const activeRangeRef = useRef<{ index: number; start: number; end: number } | null>(null);
  const loopOneRef = useRef(loopOne);
  loopOneRef.current = loopOne;

  const toVideoTime = useCallback(
    (cueTime: number) => Math.max(0, cueTime - mediaStartTime),
    [mediaStartTime]
  );

  const cueAtVideoTime = useCallback(
    (videoTime: number) => cueAtTime(cues, videoTime + mediaStartTime),
    [cues, mediaStartTime]
  );

  const playCue = useCallback(
    (index: number) => {
      const media = mediaRef.current;
      const cue = cues[index];
      if (!media || !cue) return;

      const start = Math.max(0, toVideoTime(cue.startTime) - PRE_ROLL_SECONDS);
      const end = Math.max(start + 0.1, toVideoTime(cue.endTime) + END_PAD_SECONDS);
      activeRangeRef.current = { index, start, end };
      setActiveCueIndex(index);
      setMode('cue');
      media.seekTo(start);
      media.setPlaybackRate(playbackRate);
      media.play();
    },
    [cues, playbackRate, toVideoTime]
  );

  const playContinuous = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    activeRangeRef.current = null;
    setMode('continuous');
    media.setPlaybackRate(playbackRate);
    media.play();
  }, [playbackRate]);

  const pause = useCallback(() => {
    mediaRef.current?.pause();
    setMode('idle');
    activeRangeRef.current = null;
  }, []);

  const seekToCue = useCallback(
    (index: number) => {
      const media = mediaRef.current;
      const cue = cues[index];
      if (!media || !cue) return;
      media.seekTo(Math.max(0, toVideoTime(cue.startTime) - PRE_ROLL_SECONDS));
      setActiveCueIndex(index);
    },
    [cues, toVideoTime]
  );

  const handleTimeUpdate = useCallback(
    (videoTime: number) => {
      setCurrentTime(videoTime);
      const range = activeRangeRef.current;
      if (range && videoTime >= range.end) {
        if (loopOneRef.current) {
          mediaRef.current?.seekTo(range.start);
          return;
        }
        mediaRef.current?.pause();
        mediaRef.current?.seekTo(range.start);
        activeRangeRef.current = null;
        setMode('idle');
        return;
      }

      if (!range) {
        setActiveCueIndex(cueAtVideoTime(videoTime));
      }
    },
    [cueAtVideoTime]
  );

  const toggleRate = useCallback(() => {
    setPlaybackRate((rate) => {
      const next = rate === 1 ? 0.75 : rate === 0.75 ? 0.5 : 1;
      mediaRef.current?.setPlaybackRate(next);
      return next;
    });
  }, []);

  const player = useMemo(
    () => ({
      mediaRef,
      mode,
      isPlaying,
      loopOne,
      playbackRate,
      activeCueIndex,
      currentTime,
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
      currentTime,
      playCue,
      playContinuous,
      pause,
      seekToCue,
      toggleRate,
      handleTimeUpdate,
    ]
  );

  useEffect(() => {
    activeRangeRef.current = null;
    setMode('idle');
    setActiveCueIndex(0);
    setCurrentTime(0);
  }, [resetKey]);

  return player;
}
