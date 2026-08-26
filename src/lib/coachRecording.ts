import type { Keyword } from '../types';

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

export type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionEventLike = {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
};

type SpeechRecognitionResultLike = {
  isFinal: boolean;
  0: {
    transcript: string;
  };
};

export type RecordingResources = {
  owner: number;
  stream: MediaStream;
  audioContext: AudioContext;
  source: MediaStreamAudioSourceNode;
  processor: ScriptProcessorNode;
  silentGain: GainNode;
  disposed: boolean;
};

export function disposeRecordingResources(resources: RecordingResources): void {
  if (resources.disposed) return;
  resources.disposed = true;
  resources.processor.onaudioprocess = null;
  resources.processor.disconnect();
  resources.source.disconnect();
  resources.silentGain.disconnect();
  resources.stream.getTracks().forEach((track) => track.stop());
  void resources.audioContext.close().catch(() => undefined);
}

export function createRecordingResources(
  stream: MediaStream,
  owner: number,
  AudioContextConstructor: typeof AudioContext
): RecordingResources {
  let audioContext: AudioContext | null = null;
  try {
    audioContext = new AudioContextConstructor();
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;
    return {
      owner,
      stream,
      audioContext,
      source,
      processor,
      silentGain,
      disposed: false,
    };
  } catch (error) {
    stream.getTracks().forEach((track) => track.stop());
    if (audioContext) void audioContext.close().catch(() => undefined);
    throw error;
  }
}

export function speechRecognitionConstructor(): SpeechRecognitionConstructor | undefined {
  const speechWindow = window as Window &
    typeof globalThis & {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;
}

export type CoachRecorderTarget = {
  clipId: string;
  sentence: string;
  keywords: Keyword[];
};

export function makeAudioConstraints(deviceId: string): MediaTrackConstraints {
  return {
    ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  };
}

export function makeFeedbackFormData({
  blob,
  target,
  recordingSeconds,
  recordedBytes,
  speechTranscript,
}: {
  blob: Blob;
  target: CoachRecorderTarget;
  recordingSeconds: number;
  recordedBytes: number;
  speechTranscript: string;
}): FormData {
  const formData = new FormData();
  formData.append('audio', blob, 'shadowing.wav');
  formData.append('clipId', target.clipId);
  formData.append('targetSentence', target.sentence);
  formData.append('transcript', target.sentence);
  formData.append('keywords', target.keywords.map((keyword) => keyword.term).join(', '));
  formData.append('durationSeconds', String(recordingSeconds));
  formData.append('recordedBytes', String(recordedBytes));
  formData.append('spokenText', speechTranscript);
  return formData;
}
