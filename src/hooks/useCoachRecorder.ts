import { useCallback, useEffect, useRef, useState } from 'react';
import { LOW_INPUT_LEVEL } from '../constants';
import { encodeWav, getRecordingErrorMessage, mergeFloat32Arrays } from '../lib/audio';
import {
  createRecordingResources,
  disposeRecordingResources,
  makeAudioConstraints,
  makeFeedbackFormData,
  speechRecognitionConstructor,
  type CoachRecorderTarget,
  type RecordingResources,
  type SpeechRecognitionLike,
} from '../lib/coachRecording';
import { FEEDBACK_API_BASE, makeClientDemoFeedback } from '../lib/feedback';
import { feedbackRequestUrl } from '../lib/runtimeServices';
import type { Feedback } from '../types';
import { useFeedbackService } from './useFeedbackService';

export type { CoachRecorderTarget } from '../lib/coachRecording';

// The only owner of browser recording, speech recognition, and feedback
// delivery. Coach components consume this state and keep presentation separate.
export function useCoachRecorder(target: CoachRecorderTarget) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);
  const [recordedBytes, setRecordedBytes] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [recordedPeakLevel, setRecordedPeakLevel] = useState(0);
  const [audioInputs, setAudioInputs] = useState<MediaDeviceInfo[]>([]);
  const [selectedAudioInputId, setSelectedAudioInputId] = useState('');
  const [activeInputLabel, setActiveInputLabel] = useState('系统默认麦克风');
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [speechTranscript, setSpeechTranscript] = useState('');
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const uploadAttemptedBlobRef = useRef<Blob | null>(null);
  const finalSpeechTranscriptRef = useRef('');
  const interimSpeechTranscriptRef = useRef('');
  const recordingResourcesRef = useRef<RecordingResources | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const pcmSampleCountRef = useRef(0);
  const recordingSampleRateRef = useRef(44100);
  const peakMicLevelRef = useRef(0);
  const audioUrlRef = useRef<string | null>(null);
  const feedbackAbortControllerRef = useRef<AbortController | null>(null);
  const recordingAttemptRef = useRef(0);
  const recordingOwnerRef = useRef<number | null>(null);
  const startingAttemptRef = useRef<number | null>(null);
  const activeTargetIdRef = useRef(target.clipId);
  activeTargetIdRef.current = target.clipId;

  const { service: feedbackService, canUseAiFeedback, markUnavailable } = useFeedbackService();
  const displayedMicLevel = isRecording ? micLevel : recordedPeakLevel;
  const displayedMicPercent = Math.round(displayedMicLevel * 100);

  const refreshAudioInputs = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((device) => device.kind === 'audioinput');
      setAudioInputs(inputs);
      setSelectedAudioInputId((currentDeviceId) =>
        currentDeviceId && !inputs.some((device) => device.deviceId === currentDeviceId)
          ? ''
          : currentDeviceId
      );
    } catch {
      setAudioInputs([]);
    }
  }, []);

  const stopSpeechRecognition = useCallback(() => {
    const recognition = speechRecognitionRef.current;
    if (!recognition) return;
    speechRecognitionRef.current = null;
    try {
      recognition.onresult = null;
      recognition.onend = null;
      recognition.onerror = null;
      recognition.stop();
    } catch {
      // Browser speech recognition can throw if it already stopped.
    }
  }, []);

  const cleanupRecordingResources = useCallback(
    (owner?: number) => {
      if (owner !== undefined && recordingOwnerRef.current !== owner) return;

      if (recordingTimerRef.current !== null) {
        window.clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }

      const resources = recordingResourcesRef.current;
      if (resources) {
        recordingResourcesRef.current = null;
        disposeRecordingResources(resources);
      }
      stopSpeechRecognition();
      recordingOwnerRef.current = null;
    },
    [stopSpeechRecognition]
  );

  const clearAudioUrl = useCallback(() => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    audioUrlRef.current = null;
    setAudioUrl(null);
  }, []);

  const startPcmRecorder = useCallback(async (stream: MediaStream, owner: number) => {
    recordingOwnerRef.current = owner;
    const AudioContextConstructor =
      window.AudioContext ??
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextConstructor) {
      stream.getTracks().forEach((track) => track.stop());
      throw new Error('AudioContext is not supported.');
    }

    const resources = createRecordingResources(stream, owner, AudioContextConstructor);
    const { audioContext, source, processor, silentGain } = resources;
    recordingResourcesRef.current = resources;

    pcmChunksRef.current = [];
    pcmSampleCountRef.current = 0;
    peakMicLevelRef.current = 0;
    recordingSampleRateRef.current = audioContext.sampleRate;

    processor.onaudioprocess = (event) => {
      if (recordingOwnerRef.current !== owner || recordingResourcesRef.current !== resources) {
        return;
      }
      const input = event.inputBuffer.getChannelData(0);
      const chunk = new Float32Array(input.length);
      chunk.set(input);
      pcmChunksRef.current.push(chunk);
      pcmSampleCountRef.current += chunk.length;

      let sum = 0;
      for (const sample of chunk) sum += sample * sample;
      const level = Math.min(1, Math.sqrt(sum / chunk.length) * 8);
      peakMicLevelRef.current = Math.max(peakMicLevelRef.current, level);
      setMicLevel(level);
      setRecordedBytes(44 + pcmSampleCountRef.current * 2);
    };

    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);
    await audioContext.resume();
    if (recordingOwnerRef.current !== owner || recordingResourcesRef.current !== resources) {
      disposeRecordingResources(resources);
    }
  }, []);

  const startSpeechRecognition = useCallback(() => {
    const SpeechRecognition = speechRecognitionConstructor();
    if (!SpeechRecognition) return;

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = 'en-US';
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.onresult = (event) => {
        let interim = '';
        for (let index = event.resultIndex; index < event.results.length; index += 1) {
          const result = event.results[index];
          const text = result[0]?.transcript || '';
          if (result.isFinal) {
            finalSpeechTranscriptRef.current = `${finalSpeechTranscriptRef.current} ${text}`.trim();
          } else {
            interim += ` ${text}`;
          }
        }
        interimSpeechTranscriptRef.current = interim.trim();
        setSpeechTranscript(
          `${finalSpeechTranscriptRef.current} ${interimSpeechTranscriptRef.current}`.trim()
        );
      };
      recognition.onerror = () => {
        interimSpeechTranscriptRef.current = '';
      };
      recognition.onend = () => {
        if (speechRecognitionRef.current === recognition) {
          speechRecognitionRef.current = null;
        }
      };
      speechRecognitionRef.current = recognition;
      recognition.start();
    } catch {
      if (speechRecognitionRef.current) speechRecognitionRef.current = null;
    }
  }, []);

  useEffect(() => {
    void refreshAudioInputs();
    const handleDeviceChange = () => void refreshAudioInputs();
    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, [refreshAudioInputs]);

  useEffect(() => {
    recordingAttemptRef.current += 1;
    startingAttemptRef.current = null;
    feedbackAbortControllerRef.current?.abort();
    feedbackAbortControllerRef.current = null;
    cleanupRecordingResources();
    clearAudioUrl();
    uploadAttemptedBlobRef.current = null;
    finalSpeechTranscriptRef.current = '';
    interimSpeechTranscriptRef.current = '';
    setIsRecording(false);
    setIsStarting(false);
    setRecordedBlob(null);
    setFeedback(null);
    setError(null);
    setRecordedBytes(0);
    setRecordingSeconds(0);
    setMicLevel(0);
    setRecordedPeakLevel(0);
    setSpeechTranscript('');
    setIsSending(false);

    return () => {
      recordingAttemptRef.current += 1;
      startingAttemptRef.current = null;
      feedbackAbortControllerRef.current?.abort();
      feedbackAbortControllerRef.current = null;
      cleanupRecordingResources();
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
      audioUrlRef.current = null;
    };
  }, [cleanupRecordingResources, clearAudioUrl, target.clipId]);

  const selectAudioInput = useCallback(
    (deviceId: string) => {
      setSelectedAudioInputId(deviceId);
      const nextDevice = audioInputs.find((device) => device.deviceId === deviceId);
      setActiveInputLabel(nextDevice?.label || '系统默认麦克风');
    },
    [audioInputs]
  );

  const startRecording = useCallback(async () => {
    if (startingAttemptRef.current !== null || isRecording) return;

    const attempt = ++recordingAttemptRef.current;
    const targetId = target.clipId;
    startingAttemptRef.current = attempt;
    setIsStarting(true);
    const finishStarting = () => {
      if (startingAttemptRef.current !== attempt) return;
      startingAttemptRef.current = null;
      setIsStarting(false);
    };
    try {
      feedbackAbortControllerRef.current?.abort();
      feedbackAbortControllerRef.current = null;
      setIsSending(false);
      setError(null);
      setFeedback(null);
      setRecordedBlob(null);
      uploadAttemptedBlobRef.current = null;
      setRecordedBytes(0);
      setRecordingSeconds(0);
      setMicLevel(0);
      setRecordedPeakLevel(0);
      setSpeechTranscript('');
      finalSpeechTranscriptRef.current = '';
      interimSpeechTranscriptRef.current = '';
      clearAudioUrl();

      if (!navigator.mediaDevices?.getUserMedia) {
        finishStarting();
        setError('当前浏览器不支持网页录音。请用最新版 Chrome 或 Edge 打开这个页面。');
        return;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: makeAudioConstraints(selectedAudioInputId),
      });
      if (attempt !== recordingAttemptRef.current || targetId !== activeTargetIdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        finishStarting();
        return;
      }

      const [audioTrack] = stream.getAudioTracks();
      if (!audioTrack) {
        stream.getTracks().forEach((track) => track.stop());
        finishStarting();
        setError('浏览器没有返回可用的麦克风音轨。请换一个输入设备后再试。');
        return;
      }

      const selectedInput = audioInputs.find((device) => device.deviceId === selectedAudioInputId);
      setActiveInputLabel(audioTrack.label || selectedInput?.label || '系统默认麦克风');
      void refreshAudioInputs();
      await startPcmRecorder(stream, attempt);
      if (attempt !== recordingAttemptRef.current || targetId !== activeTargetIdRef.current) {
        cleanupRecordingResources(attempt);
        finishStarting();
        return;
      }
      if (canUseAiFeedback) startSpeechRecognition();
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((seconds) => seconds + 1);
      }, 1000);
      finishStarting();
      setIsRecording(true);
    } catch (recordingError) {
      cleanupRecordingResources(attempt);
      finishStarting();
      if (attempt !== recordingAttemptRef.current || targetId !== activeTargetIdRef.current) return;
      setIsRecording(false);
      setMicLevel(0);
      setError(getRecordingErrorMessage(recordingError));
    }
  }, [
    audioInputs,
    canUseAiFeedback,
    cleanupRecordingResources,
    clearAudioUrl,
    isRecording,
    refreshAudioInputs,
    selectedAudioInputId,
    startPcmRecorder,
    startSpeechRecognition,
    target.clipId,
  ]);

  const stopRecording = useCallback(() => {
    recordingAttemptRef.current += 1;
    startingAttemptRef.current = null;
    setIsStarting(false);
    if (!isRecording) {
      cleanupRecordingResources();
      setIsRecording(false);
      setMicLevel(0);
      return;
    }

    const sampleCount = pcmSampleCountRef.current;
    const blob = encodeWav(
      mergeFloat32Arrays(pcmChunksRef.current, sampleCount),
      recordingSampleRateRef.current
    );
    const peakLevel = peakMicLevelRef.current;
    cleanupRecordingResources();
    setIsRecording(false);
    setMicLevel(0);
    setRecordedPeakLevel(peakLevel);
    setSpeechTranscript(
      `${finalSpeechTranscriptRef.current} ${interimSpeechTranscriptRef.current}`.trim()
    );

    if (blob.size <= 44 || sampleCount === 0) {
      setRecordedBlob(null);
      setRecordedBytes(0);
      setRecordedPeakLevel(0);
      setError('这次没有录到声音。请确认麦克风权限已允许，并靠近麦克风再录一遍。');
      return;
    }

    setRecordedBlob(blob);
    setRecordedBytes(blob.size);
    clearAudioUrl();
    const nextAudioUrl = URL.createObjectURL(blob);
    audioUrlRef.current = nextAudioUrl;
    setAudioUrl(nextAudioUrl);
    setError(
      peakLevel < LOW_INPUT_LEVEL
        ? `录音文件已生成，但当前输入「${activeInputLabel}」几乎没有检测到声音。请在上方换一个麦克风，或检查系统输入设备。`
        : null
    );
  }, [activeInputLabel, cleanupRecordingResources, clearAudioUrl, isRecording]);

  const sendFeedback = useCallback(async () => {
    if (!recordedBlob) {
      setError('先录一遍，再让 AI 教练反馈。');
      return;
    }

    setError(null);
    if (!canUseAiFeedback) {
      setFeedback(
        makeClientDemoFeedback({
          targetSentence: target.sentence,
          keywords: target.keywords,
          delivery:
            uploadAttemptedBlobRef.current === recordedBlob ? 'remote-failed' : 'local-only',
        })
      );
      return;
    }

    const targetId = target.clipId;
    const controller = new AbortController();
    feedbackAbortControllerRef.current?.abort();
    feedbackAbortControllerRef.current = controller;
    setFeedback(null);
    setIsSending(true);

    try {
      const formData = makeFeedbackFormData({
        blob: recordedBlob,
        target,
        recordingSeconds,
        recordedBytes,
        speechTranscript,
      });
      uploadAttemptedBlobRef.current = recordedBlob;
      const response = await fetch(feedbackRequestUrl(FEEDBACK_API_BASE), {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw new Error('Feedback API did not return JSON.');
      }

      const payload = (await response.json()) as Feedback & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'Feedback request failed.');
      if (payload.mode !== 'ai') throw new Error('Feedback service did not return AI feedback.');
      if (targetId === activeTargetIdRef.current && !controller.signal.aborted) {
        setFeedback(payload);
      }
    } catch {
      if (controller.signal.aborted || targetId !== activeTargetIdRef.current) return;
      markUnavailable();
      setFeedback(
        makeClientDemoFeedback({
          targetSentence: target.sentence,
          keywords: target.keywords,
          delivery: 'remote-failed',
        })
      );
    } finally {
      if (feedbackAbortControllerRef.current === controller) {
        feedbackAbortControllerRef.current = null;
      }
      if (targetId === activeTargetIdRef.current && !controller.signal.aborted) setIsSending(false);
    }
  }, [
    canUseAiFeedback,
    markUnavailable,
    recordedBlob,
    recordedBytes,
    recordingSeconds,
    speechTranscript,
    target,
  ]);

  return {
    activeInputLabel,
    audioInputs,
    audioUrl,
    canUseAiFeedback,
    displayedMicLevel,
    displayedMicPercent,
    error,
    feedback,
    feedbackService,
    isRecording,
    isStarting,
    isSending,
    recordedBlob,
    recordedBytes,
    recordingSeconds,
    selectedAudioInputId,
    selectAudioInput,
    sendFeedback,
    speechTranscript,
    startRecording,
    stopRecording,
  };
}
