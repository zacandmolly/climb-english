import type { VideoEntry } from '../../../src/types';

export const video: VideoEntry = {
  "id": "fixture",
  "title": "Word timing fixture",
  "sourceUrl": "https://www.youtube.com/watch?v=abcdefghijk",
  "sourceLabel": "Word timing fixture | test",
  "youtubeId": "abcdefghijk",
  "channel": "test",
  "category": "technique",
  "categoryLabel": "Technique / 攀岩技巧",
  "level": "intermediate",
  "mediaUrl": "/media/fixture.mp4",
  "mediaStartTime": 0,
  "durationSeconds": 30,
  "captionKind": "auto",
  "importedAt": "2026-08-26",
  "cueCount": 4,
  "studyCueCount": 2,
  "needsTranslationCount": 0,
  "cues": [
    {
      "id": "c001",
      "startTime": 10,
      "endTime": 12,
      "en": "hello world good.",
      "zh": "你好世界，好的。",
      "score": 50,
      "study": true,
      "keywords": [],
      "note": "fixture note"
    },
    {
      "id": "c002",
      "startTime": 12.5,
      "endTime": 13.6,
      "en": ">> another speaker line.",
      "zh": "另一位说话者的话。",
      "score": 40,
      "study": false,
      "keywords": []
    },
    {
      "id": "c003",
      "startTime": 13.8,
      "endTime": 14.3,
      "en": "Yeah.",
      "zh": "是的。",
      "score": 10,
      "study": false,
      "keywords": []
    },
    {
      "id": "c004",
      "startTime": 14.2,
      "endTime": 14.8,
      "en": "Yeah.",
      "zh": "是的。",
      "score": 10,
      "study": false,
      "keywords": []
    }
  ]
};
