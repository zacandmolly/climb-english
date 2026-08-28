import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const runtimeConsumers = ['../src/components/SpeakingCoach.tsx', '../src/views/CoachPanel.tsx'];
const presentationFiles = [...runtimeConsumers, '../src/components/CoachRecorderControls.tsx'];

const forbiddenRuntimeMarkers = [
  ['media device access', /navigator\.mediaDevices|getUserMedia/],
  ['Web Audio capture', /\bAudioContext\b|createScriptProcessor|encodeWav/],
  ['speech recognition', /\bSpeechRecognition\b|webkitSpeechRecognition/],
  ['feedback delivery', /feedbackRequestUrl|FEEDBACK_API_BASE|new FormData|\bfetch\s*\(/],
  ['feedback fallback policy', /makeClientDemoFeedback|useFeedbackService/],
];

test('coach presentation components delegate the complete runtime to one hook', () => {
  for (const relativePath of runtimeConsumers) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');
    assert.match(source, /useCoachRecorder\s*\(/, `${relativePath} must use the shared runtime`);
  }

  for (const relativePath of presentationFiles) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8');

    for (const [ownership, marker] of forbiddenRuntimeMarkers) {
      assert.doesNotMatch(
        source,
        marker,
        `${relativePath} must not reintroduce ${ownership}; keep it in useCoachRecorder`
      );
    }
  }

  const runtime = readFileSync(
    new URL('../src/hooks/useCoachRecorder.ts', import.meta.url),
    'utf8'
  );
  for (const requiredMarker of [
    /getUserMedia/,
    /\bAudioContext\b/,
    /SpeechRecognition/,
    /feedbackRequestUrl/,
    /makeClientDemoFeedback/,
  ]) {
    assert.match(runtime, requiredMarker, 'the shared hook must remain the runtime owner');
  }
});
