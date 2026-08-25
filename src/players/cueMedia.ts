// Pure source-routing contract for CueMediaPlayer (Issues #22/#24).
//
// The real YouTube IFrame API REPLACES the host element with an <iframe>, so
// the component can never rely on "is the preview <video> currently mounted"
// to decide where a seek/play goes: the preview element is unmounted during a
// YouTube session, and the replacement iframe must stay inside a React-owned
// wrapper. Routing is decided purely from the media timeline and surface
// availability:
//   - a preview-window seek/play stays on preview (or switches BACK from
//     YouTube to preview);
//   - a beyond-window action switches to YouTube only when it is ready,
//     otherwise it waits and applies onReady (no silent no-op);
//   - YouTube errors never drop a source to unavailable while preview exists.

export type CueMediaSource = 'local' | 'preview' | 'youtube' | 'unavailable';

export type CueMediaRoute =
  | { kind: 'local'; time: number }
  | { kind: 'preview'; time: number; previewTime: number }
  | { kind: 'youtube'; time: number; absoluteTime: number; switchSource: boolean }
  | { kind: 'wait'; time: number };

export function initialMediaSource({
  mediaUrl,
  youtubeId,
  previewMediaUrl,
  preferPreview,
}: {
  mediaUrl: string;
  youtubeId: string;
  previewMediaUrl: string;
  preferPreview: boolean;
}): CueMediaSource {
  if (preferPreview && previewMediaUrl) return 'preview';
  if (mediaUrl) return 'local';
  if (previewMediaUrl) return 'preview';
  if (youtubeId) return 'youtube';
  return 'unavailable';
}

/** Half-open preview window with the same epsilon the player used historically. */
export function inPreviewWindow(time: number, previewStart: number, previewEnd: number): boolean {
  return time >= previewStart - 0.05 && time < previewEnd - 0.05;
}

export function routeMediaAction({
  source,
  time,
  mediaStartTime,
  previewStart,
  previewEnd,
  hasPreviewMedia,
  youtubeReady,
}: {
  source: CueMediaSource;
  time: number;
  mediaStartTime: number;
  previewStart: number;
  previewEnd: number;
  hasPreviewMedia: boolean;
  youtubeReady: boolean;
}): CueMediaRoute {
  if (source === 'local') return { kind: 'local', time };

  if (source === 'preview') {
    if (inPreviewWindow(time, previewStart, previewEnd)) {
      return { kind: 'preview', time, previewTime: Math.max(0, time - previewStart) };
    }
    if (youtubeReady) {
      return {
        kind: 'youtube',
        time,
        absoluteTime: time + mediaStartTime,
        switchSource: true,
      };
    }
    return { kind: 'wait', time };
  }

  if (source === 'youtube') {
    if (hasPreviewMedia && inPreviewWindow(time, previewStart, previewEnd)) {
      return { kind: 'preview', time, previewTime: Math.max(0, time - previewStart) };
    }
    return {
      kind: 'youtube',
      time,
      absoluteTime: time + mediaStartTime,
      switchSource: false,
    };
  }

  return { kind: 'wait', time };
}
