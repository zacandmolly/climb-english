import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getPreviewWindow } from '../scripts/lib/video-preview.mjs';

test('preview begins just before the first learnable cue, not at source time zero', () => {
  assert.deepEqual(getPreviewWindow({ mediaStartTime: 0, cues: [{ startTime: 67.53 }] }), {
    previewStartTime: 67.23,
    previewSourceOffset: 67.23,
    previewDurationSeconds: 20,
  });
});

test('preview never seeks before a clipped local media file begins', () => {
  assert.deepEqual(getPreviewWindow({ mediaStartTime: 631, cues: [{ startTime: 630.97 }] }), {
    previewStartTime: 631,
    previewSourceOffset: 0,
    previewDurationSeconds: 20,
  });
});
