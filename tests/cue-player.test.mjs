// Regression tests for the CueMediaPlayer source-routing contract (Issues
// #22/#24).
//
// The real YouTube IFrame API replaces the host element with an <iframe>.
// Routing must therefore be decided by the media timeline and the availability
// of each surface, never by "is the preview <video> currently mounted":
//   - a preview-window seek/play must stay on (or switch back to) preview,
//     even while the preview element is unmounted;
//   - a beyond-window seek must switch to YouTube only when it is ready,
//     otherwise it waits and applies onReady (no silent no-op);
//   - YouTube errors must NOT drop the source to unavailable while a preview
//     fallback exists.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { initialMediaSource, inPreviewWindow, routeMediaAction } from '../src/players/cueMedia.ts';

const PREVIEW_START = 67.23;
const PREVIEW_END = 87.23;

test('initial source honors preferPreview, then local, preview, youtube, unavailable', () => {
  assert.equal(
    initialMediaSource({
      mediaUrl: '/media/full.mp4',
      youtubeId: 'abcdefghijk',
      previewMediaUrl: '/media/preview.mp4',
      preferPreview: true,
    }),
    'preview'
  );
  assert.equal(
    initialMediaSource({
      mediaUrl: '/media/full.mp4',
      youtubeId: 'abcdefghijk',
      previewMediaUrl: '',
      preferPreview: false,
    }),
    'local'
  );
  assert.equal(
    initialMediaSource({
      mediaUrl: '',
      youtubeId: '',
      previewMediaUrl: '/media/preview.mp4',
      preferPreview: false,
    }),
    'preview'
  );
  assert.equal(
    initialMediaSource({
      mediaUrl: '',
      youtubeId: 'abcdefghijk',
      previewMediaUrl: '',
      preferPreview: false,
    }),
    'youtube'
  );
  assert.equal(
    initialMediaSource({
      mediaUrl: '',
      youtubeId: '',
      previewMediaUrl: '',
      preferPreview: false,
    }),
    'unavailable'
  );
});

test('preview window bounds keep the historical epsilon on both edges', () => {
  assert.equal(inPreviewWindow(PREVIEW_START, PREVIEW_START, PREVIEW_END), true);
  assert.equal(inPreviewWindow(PREVIEW_END - 0.06, PREVIEW_START, PREVIEW_END), true);
  assert.equal(inPreviewWindow(PREVIEW_END - 0.01, PREVIEW_START, PREVIEW_END), false);
  assert.equal(inPreviewWindow(PREVIEW_END, PREVIEW_START, PREVIEW_END), false);
  assert.equal(inPreviewWindow(PREVIEW_START - 0.01, PREVIEW_START, PREVIEW_END), true);
});

test('preview source seeks inside the window even when the preview is not mounted yet', () => {
  const route = routeMediaAction({
    source: 'preview',
    time: 67.53,
    mediaStartTime: 0,
    previewStart: PREVIEW_START,
    previewEnd: PREVIEW_END,
    hasPreviewMedia: true,
    youtubeReady: true,
  });
  assert.equal(route.kind, 'preview');
  assert.ok(Math.abs(route.previewTime - 0.3) < 1e-6);
});

test('preview source beyond the window switches to YouTube only when ready', () => {
  const ready = routeMediaAction({
    source: 'preview',
    time: 88.97,
    mediaStartTime: 0,
    previewStart: PREVIEW_START,
    previewEnd: PREVIEW_END,
    hasPreviewMedia: true,
    youtubeReady: true,
  });
  assert.equal(ready.kind, 'youtube');
  assert.equal(ready.absoluteTime, 88.97);
  assert.equal(ready.switchSource, true);

  const waiting = routeMediaAction({
    source: 'preview',
    time: 88.97,
    mediaStartTime: 0,
    previewStart: PREVIEW_START,
    previewEnd: PREVIEW_END,
    hasPreviewMedia: true,
    youtubeReady: false,
  });
  assert.equal(waiting.kind, 'wait');
  assert.equal(waiting.time, 88.97);
});

test('youtube source can switch back to a preview-window cue (bidirectional)', () => {
  const back = routeMediaAction({
    source: 'youtube',
    time: 67.53,
    mediaStartTime: 0,
    previewStart: PREVIEW_START,
    previewEnd: PREVIEW_END,
    hasPreviewMedia: true,
    youtubeReady: true,
  });
  assert.equal(back.kind, 'preview');
  assert.ok(Math.abs(back.previewTime - 0.3) < 1e-6);

  const stay = routeMediaAction({
    source: 'youtube',
    time: 88.97,
    mediaStartTime: 0,
    previewStart: PREVIEW_START,
    previewEnd: PREVIEW_END,
    hasPreviewMedia: true,
    youtubeReady: true,
  });
  assert.equal(stay.kind, 'youtube');
  assert.equal(stay.switchSource, false);
});

test('youtube source without a preview media keeps youtube for in-window seeks', () => {
  const route = routeMediaAction({
    source: 'youtube',
    time: 67.53,
    mediaStartTime: 0,
    previewStart: PREVIEW_START,
    previewEnd: PREVIEW_END,
    hasPreviewMedia: false,
    youtubeReady: false,
  });
  assert.equal(route.kind, 'youtube');
});

test('local and unavailable sources route to themselves / wait', () => {
  const local = routeMediaAction({
    source: 'local',
    time: 12,
    mediaStartTime: 0,
    previewStart: PREVIEW_START,
    previewEnd: PREVIEW_END,
    hasPreviewMedia: false,
    youtubeReady: false,
  });
  assert.equal(local.kind, 'local');
  assert.equal(local.time, 12);

  const unavailable = routeMediaAction({
    source: 'unavailable',
    time: 12,
    mediaStartTime: 0,
    previewStart: PREVIEW_START,
    previewEnd: PREVIEW_END,
    hasPreviewMedia: false,
    youtubeReady: false,
  });
  assert.equal(unavailable.kind, 'wait');
});
