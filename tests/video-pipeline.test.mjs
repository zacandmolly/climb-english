import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyMedia, validateVideoRecord } from '../scripts/check-video-pipeline.mjs';

function validVideo() {
  return {
    id: 'fixture-video',
    youtubeId: 'abcdefghijk',
    mediaUrl: '/media/fixture-video.mp4',
    mediaStartTime: 100,
    durationSeconds: 20,
    cueCount: 2,
    studyCueCount: 1,
    needsTranslationCount: 0,
    cues: [
      {
        id: 'c001',
        startTime: 100.2,
        endTime: 104,
        en: 'First sentence.',
        zh: '第一句。',
        study: true,
      },
      {
        id: 'c002',
        startTime: 105,
        endTime: 119.8,
        en: 'Second sentence.',
        zh: '第二句。',
        study: false,
      },
    ],
  };
}

test('a translated, ordered cue deck inside the media window passes', () => {
  assert.deepEqual(validateVideoRecord(validVideo(), 'fixture'), []);
});

test('translation holes fail instead of shipping placeholder karaoke cards', () => {
  const video = validVideo();
  video.cues[1].zh = '';
  video.cues[1].needsTranslation = true;
  video.needsTranslationCount = 1;
  assert.match(validateVideoRecord(video, 'fixture').join('\n'), /still need translation/);
});

test('out-of-order cue timestamps fail the material gate', () => {
  const video = validVideo();
  video.cues[1].startTime = 99;
  assert.match(validateVideoRecord(video, 'fixture').join('\n'), /starts before the preceding cue/);
});

test('a cue outside the declared clip window fails the material gate', () => {
  const video = validVideo();
  video.cues[1].endTime = 125;
  assert.match(
    validateVideoRecord(video, 'fixture').join('\n'),
    /ends after the declared media window/
  );
});

test('invalid media-window metadata fails instead of disabling timeline bounds', () => {
  const video = validVideo();
  video.mediaStartTime = Number.NaN;
  video.durationSeconds = 0;
  assert.match(
    validateVideoRecord(video, 'fixture').join('\n'),
    /mediaStartTime must be a finite non-negative number/
  );
  assert.match(
    validateVideoRecord(video, 'fixture').join('\n'),
    /durationSeconds must be a finite positive number/
  );
});

test('a generated video without a YouTube fallback id fails the material gate', () => {
  const video = validVideo();
  video.youtubeId = '';
  assert.match(validateVideoRecord(video, 'fixture').join('\n'), /11-character YouTube id/);
});

test('a local media path cannot escape the public media directory', () => {
  const video = validVideo();
  video.mediaUrl = '/media/../../.env.mp4';
  assert.match(classifyMedia(video).errors.join('\n'), /unsafe or unsupported local media path/);
});
