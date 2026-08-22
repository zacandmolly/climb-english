import {
  CircleStop,
  Mic,
  Send,
  Sparkles,
  Volume2,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Feedback, Keyword } from '../types';

const LOW_INPUT_LEVEL = 0.01;
const FEEDBACK_API_BASE = normalizeApiBaseUrl(import.meta.env.VITE_FEEDBACK_API_BASE);

export type CoachTarget = {
  clipId: string;
  sentence: string;
  keywords: Keyword[];
  patterns: string[];
  prompt: string;
  label?: string;
};

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

type SpeechRecognitionLike = {
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

// Record -> transcribe -> AI coaching. Used by both the daily-plan view and
// the bilingual video library; the caller only supplies a CoachTarget.
export function SpeakingCoach({ target }: { target: CoachTarget }) {
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
  const [isSending, setIsSending] = useState(false);
  const [speechTranscript, setSpeechTranscript] = useState('');
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const finalSpeechTranscriptRef = useRef('');
  const interimSpeechTranscriptRef = useRef('');
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const silentGainRef = useRef<GainNode | null>(null);
  const recordingTimerRef = useRef<number | null>(null);
  const pcmChunksRef = useRef<Float32Array[]>([]);
  const pcmSampleCountRef = useRef(0);
  const recordingSampleRateRef = useRef(44100);
  const peakMicLevelRef = useRef(0);
  const activeKeywords = target.keywords;
  const targetSentence = target.sentence;
  const prompt = target.prompt;
  const patterns = target.patterns;
  const selectedAudioInput = audioInputs.find((device) => device.deviceId === selectedAudioInputId);
  const displayedMicLevel = isRecording ? micLevel : recordedPeakLevel;
  const displayedMicPercent = Math.round(displayedMicLevel * 100);
  const isStaticFeedbackMode = useMemo(
    () => isStaticFeedbackHost() && !FEEDBACK_API_BASE,
    [],
  );

  const refreshAudioInputs = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((device) => device.kind === 'audioinput');
      setAudioInputs(inputs);
      setSelectedAudioInputId((currentDeviceId) =>
        currentDeviceId && !inputs.some((device) => device.deviceId === currentDeviceId)
          ? ''
          : currentDeviceId,
      );
    } catch {
      setAudioInputs([]);
    }
  }, []);

  const cleanupRecordingResources = () => {
    if (recordingTimerRef.current) {
      window.clearInterval(recordingTimerRef.current);
      recordingTimerRef.current = null;
    }

    processorRef.current?.disconnect();
    mediaSourceRef.current?.disconnect();
    silentGainRef.current?.disconnect();
    processorRef.current = null;
    mediaSourceRef.current = null;
    silentGainRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    stopSpeechRecognition();

    void audioContextRef.current?.close();
    audioContextRef.current = null;
    setMicLevel(0);
  };

  useEffect(() => {
    void refreshAudioInputs();

    const handleDeviceChange = () => {
      void refreshAudioInputs();
    };

    navigator.mediaDevices?.addEventListener?.('devicechange', handleDeviceChange);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handleDeviceChange);
    };
  }, [refreshAudioInputs]);

  const startPcmRecorder = async (stream: MediaStream) => {
    const AudioContextConstructor =
      window.AudioContext ??
      (window as Window & typeof globalThis & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;

    if (!AudioContextConstructor) {
      throw new Error('AudioContext is not supported.');
    }

    const audioContext = new AudioContextConstructor();
    const source = audioContext.createMediaStreamSource(stream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    const silentGain = audioContext.createGain();
    silentGain.gain.value = 0;

    pcmChunksRef.current = [];
    pcmSampleCountRef.current = 0;
    peakMicLevelRef.current = 0;
    recordingSampleRateRef.current = audioContext.sampleRate;

    processor.onaudioprocess = (event) => {
      const input = event.inputBuffer.getChannelData(0);
      const chunk = new Float32Array(input.length);
      chunk.set(input);
      pcmChunksRef.current.push(chunk);
      pcmSampleCountRef.current += chunk.length;

      let sum = 0;
      for (const sample of chunk) sum += sample * sample;
      const rms = Math.sqrt(sum / chunk.length);
      const level = Math.min(1, rms * 8);
      peakMicLevelRef.current = Math.max(peakMicLevelRef.current, level);
      setMicLevel(level);
      setRecordedBytes(44 + pcmSampleCountRef.current * 2);
    };

    source.connect(processor);
    processor.connect(silentGain);
    silentGain.connect(audioContext.destination);
    await audioContext.resume();

    audioContextRef.current = audioContext;
    mediaSourceRef.current = source;
    processorRef.current = processor;
    silentGainRef.current = silentGain;
  };

  const startSpeechRecognition = () => {
    const SpeechRecognition =
      (window as Window & typeof globalThis & {
        SpeechRecognition?: SpeechRecognitionConstructor;
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
      }).SpeechRecognition ??
      (window as Window & typeof globalThis & {
        webkitSpeechRecognition?: SpeechRecognitionConstructor;
      }).webkitSpeechRecognition;

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
          `${finalSpeechTranscriptRef.current} ${interimSpeechTranscriptRef.current}`.trim(),
        );
      };
      recognition.onerror = () => {
        interimSpeechTranscriptRef.current = '';
      };
      recognition.onend = () => {
        speechRecognitionRef.current = null;
      };
      recognition.start();
      speechRecognitionRef.current = recognition;
    } catch {
      speechRecognitionRef.current = null;
    }
  };

  const stopSpeechRecognition = () => {
    const recognition = speechRecognitionRef.current;
    if (!recognition) return;
    speechRecognitionRef.current = null;
    try {
      recognition.onend = null;
      recognition.stop();
    } catch {
      // Browser speech recognition can throw if it already stopped.
    }
  };

  useEffect(() => {
    setRecordedBlob(null);
    setFeedback(null);
    setError(null);
    setRecordedBytes(0);
    setRecordingSeconds(0);
    setMicLevel(0);
    setRecordedPeakLevel(0);
    setAudioUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return null;
    });
    cleanupRecordingResources();

    return cleanupRecordingResources;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.clipId]);

  const startRecording = async () => {
    try {
      setError(null);
      setFeedback(null);
      setRecordedBlob(null);
      setRecordedBytes(0);
      setRecordingSeconds(0);
      setMicLevel(0);
      setRecordedPeakLevel(0);
      setSpeechTranscript('');
      finalSpeechTranscriptRef.current = '';
      interimSpeechTranscriptRef.current = '';
      setAudioUrl((currentUrl) => {
        if (currentUrl) URL.revokeObjectURL(currentUrl);
        return null;
      });

      if (!navigator.mediaDevices?.getUserMedia) {
        setError('当前浏览器不支持网页录音。请用最新版 Chrome 或 Edge 打开这个页面。');
        return;
      }

      const audioConstraints: MediaTrackConstraints = selectedAudioInputId
        ? {
            deviceId: { exact: selectedAudioInputId },
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          }
        : {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          };
      const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      const [audioTrack] = stream.getAudioTracks();

      if (!audioTrack) {
        stream.getTracks().forEach((track) => track.stop());
        setError('浏览器没有返回可用的麦克风音轨。请换一个输入设备后再试。');
        return;
      }

      mediaStreamRef.current = stream;
      setActiveInputLabel(audioTrack.label || selectedAudioInput?.label || '系统默认麦克风');
      void refreshAudioInputs();
      await startPcmRecorder(stream);
      startSpeechRecognition();
      recordingTimerRef.current = window.setInterval(() => {
        setRecordingSeconds((seconds) => seconds + 1);
      }, 1000);
      setIsRecording(true);
    } catch (recordingError) {
      cleanupRecordingResources();
      setIsRecording(false);
      setError(getRecordingErrorMessage(recordingError));
    }
  };

  const stopRecording = () => {
    if (!isRecording) {
      cleanupRecordingResources();
      setIsRecording(false);
      return;
    }

    const blob = encodeWav(
      mergeFloat32Arrays(pcmChunksRef.current, pcmSampleCountRef.current),
      recordingSampleRateRef.current,
    );
    const peakLevel = peakMicLevelRef.current;
    cleanupRecordingResources();
    setIsRecording(false);
    setRecordedPeakLevel(peakLevel);
    setSpeechTranscript(
      `${finalSpeechTranscriptRef.current} ${interimSpeechTranscriptRef.current}`.trim(),
    );

    if (blob.size <= 44 || pcmSampleCountRef.current === 0) {
      setRecordedBlob(null);
      setRecordedBytes(0);
      setRecordedPeakLevel(0);
      setError('这次没有录到声音。请确认麦克风权限已允许，并靠近麦克风再录一遍。');
      return;
    }

    setRecordedBlob(blob);
    setRecordedBytes(blob.size);
    setAudioUrl((currentUrl) => {
      if (currentUrl) URL.revokeObjectURL(currentUrl);
      return URL.createObjectURL(blob);
    });
    setError(
      peakLevel < LOW_INPUT_LEVEL
        ? `录音文件已生成，但当前输入「${activeInputLabel}」几乎没有检测到声音。请在上方换一个麦克风，或检查系统输入设备。`
        : null,
    );
  };

  const sendFeedback = async () => {
    if (!recordedBlob) {
      setError('先录一遍，再让 AI 教练反馈。');
      return;
    }

    setError(null);
    setFeedback(makeClientDemoFeedback({ targetSentence, keywords: activeKeywords }));

    if (isStaticFeedbackMode) return;

    setIsSending(true);

    try {
      const formData = new FormData();
      formData.append('audio', recordedBlob, 'shadowing.wav');
      formData.append('clipId', target.clipId);
      formData.append('targetSentence', targetSentence);
      formData.append('transcript', targetSentence);
      formData.append('keywords', activeKeywords.map((keyword) => keyword.term).join(', '));
      formData.append('durationSeconds', String(recordingSeconds));
      formData.append('recordedBytes', String(recordedBytes));
      formData.append('spokenText', speechTranscript);

      const response = await fetch(`${FEEDBACK_API_BASE}/api/speaking-feedback`, {
        method: 'POST',
        body: formData,
      });

      const contentType = response.headers.get('content-type') ?? '';
      if (!contentType.includes('application/json')) {
        throw new Error('Feedback API did not return JSON.');
      }

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error || 'Feedback request failed.');
      }
      setFeedback(payload);
    } catch {
      setFeedback(makeClientDemoFeedback({ targetSentence, keywords: activeKeywords }));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <aside className="coach-pane coach-bottom" aria-label="Speaking coach">
      <div className="panel-heading">
        <Sparkles size={18} aria-hidden="true" />
        <span>AI 教练</span>
        <span className="coach-hint">录一遍跟读，右侧实时给反馈</span>
      </div>

      <div className="coach-grid">
        <div className="coach-col">
          <section className="target-panel">
            <p className="target-label">{target.label ?? 'Shadowing sentence'}</p>
            <p className="target-sentence">{targetSentence}</p>
            <p className="speaking-prompt">{prompt}</p>
          </section>

          {patterns.length > 0 ? (
            <section className="pattern-panel">
              <p className="target-label">句型</p>
              <div className="pattern-list">
                {patterns.map((pattern) => (
                  <span key={pattern}>{pattern}</span>
                ))}
              </div>
            </section>
          ) : null}
        </div>

        <div className="coach-col">
          <section className="mic-device-panel" aria-label="Microphone input">
            <label htmlFor="microphone-input">麦克风</label>
            <select
              id="microphone-input"
              value={selectedAudioInputId}
              disabled={isRecording}
              onChange={(event) => {
                setSelectedAudioInputId(event.target.value);
                const nextDevice = audioInputs.find(
                  (device) => device.deviceId === event.target.value,
                );
                setActiveInputLabel(nextDevice?.label || '系统默认麦克风');
              }}
            >
              <option value="">系统默认</option>
              {audioInputs.map((device, index) => (
                <option key={device.deviceId || `audio-input-${index}`} value={device.deviceId}>
                  {device.label || `麦克风 ${index + 1}`}
                </option>
              ))}
            </select>
            <p>
              当前：{activeInputLabel}
              <span>输入电平 {displayedMicPercent}%</span>
            </p>
          </section>

          <div className="recording-controls">
            {!isRecording ? (
              <button className="record-button" type="button" onClick={startRecording}>
                <Mic size={18} aria-hidden="true" />
                开始录音
              </button>
            ) : (
              <button className="record-button danger" type="button" onClick={stopRecording}>
                <CircleStop size={18} aria-hidden="true" />
                停止录音
              </button>
            )}
            <button
              className="icon-text-button send"
              type="button"
              onClick={sendFeedback}
              disabled={!recordedBlob || isSending}
              title="Send recording for feedback"
            >
              <Send size={16} aria-hidden="true" />
              {isSending ? '分析中' : isStaticFeedbackMode ? '离线反馈' : '反馈'}
            </button>
          </div>

          {isRecording || recordedBlob ? (
            <div className="recording-status" aria-live="polite">
              <div>
                <strong>{isRecording ? '正在录音' : '已录音'}</strong>
                <span>
                  {recordingSeconds}s
                  {recordedBytes > 0 ? ` / ${formatBytes(recordedBytes)}` : ''}
                </span>
              </div>
              <div className="mic-meter" aria-hidden="true">
                <span
                  style={{
                    width:
                      displayedMicLevel > 0
                        ? `${Math.max(4, Math.round(displayedMicLevel * 100))}%`
                        : '0%',
                  }}
                />
              </div>
            </div>
          ) : null}

          {speechTranscript ? (
            <p className="speech-transcript">识别到：{speechTranscript}</p>
          ) : null}

          {audioUrl ? (
            <div className="playback-panel">
              <Volume2 size={18} aria-hidden="true" />
              <audio controls src={audioUrl}>
                <track kind="captions" />
              </audio>
            </div>
          ) : null}

          {error ? <p className="error-box">{error}</p> : null}
        </div>

        <div className="coach-col">
          {feedback ? (
            <section className="feedback-panel">
              <div className="feedback-mode">{feedback.mode === 'demo' ? '离线反馈' : 'AI 反馈'}</div>
              <p className="feedback-transcript">{feedback.transcript}</p>
              <p>{feedback.closeness}</p>
              <div className="hit-list">
                {feedback.keywordHits.map((hit) => (
                  <span key={hit}>{hit}</span>
                ))}
              </div>
              {feedback.audioNotes?.length ? (
                <ul className="audio-note-list">
                  {feedback.audioNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
              <ul>
                {feedback.suggestions.map((suggestion) => (
                  <li key={suggestion}>{suggestion}</li>
                ))}
              </ul>
              <p className="natural-line">{feedback.naturalVersion}</p>
            </section>
          ) : (
            <section className="feedback-panel feedback-placeholder">
              <p>还没有反馈。录一遍这句跟读，点「反馈」，这里会显示关键词命中、语速节奏和下一遍建议。</p>
            </section>
          )}
        </div>
      </div>
    </aside>
  );
}

function isStaticFeedbackHost() {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.endsWith('github.io');
}

function normalizeApiBaseUrl(value: unknown) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

function makeClientDemoFeedback({
  targetSentence,
  keywords,
}: {
  targetSentence: string;
  keywords: Keyword[];
}): Feedback {
  return {
    mode: 'demo',
    provider: 'client-demo',
    transcript: '公开版已收到录音。当前 GitHub Pages 版本只提供录音回放和离线练习建议，AI 转写服务后续接入。',
    keywordHits: keywords.map((keyword) => keyword.term).slice(0, 4),
    closeness: '先听自己的回放：如果关键词清楚，就马上再录一遍；如果卡住，回到原句慢速跟读。',
    audioNotes: ['当前是离线建议，不能判断语音、语调、语速或重音。'],
    suggestions: ['把句子拆成两段说，再连起来。', '优先说清楚高亮的攀岩关键词。'],
    naturalVersion: targetSentence,
  };
}

function getRecordingErrorMessage(error: unknown) {
  if (error instanceof DOMException) {
    if (error.name === 'NotAllowedError' || error.name === 'SecurityError') {
      return '浏览器没有麦克风权限。请点地址栏旁边的权限图标，允许 microphone，然后刷新页面再录。';
    }

    if (error.name === 'NotFoundError') {
      return '没有找到可用麦克风。请检查系统输入设备后再试。';
    }
  }

  return '麦克风不可用。请确认浏览器允许 microphone 权限，并使用最新版 Chrome 或 Edge。';
}

function mergeFloat32Arrays(chunks: Float32Array[], sampleCount: number) {
  const samples = new Float32Array(sampleCount);
  let offset = 0;

  for (const chunk of chunks) {
    samples.set(chunk, offset);
    offset += chunk.length;
  }

  return samples;
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const bytesPerSample = 2;
  const channelCount = 1;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, channelCount, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * channelCount * bytesPerSample, true);
  view.setUint16(32, channelCount * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (const sample of samples) {
    const clamped = Math.max(-1, Math.min(1, sample));
    view.setInt16(offset, clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff, true);
    offset += bytesPerSample;
  }

  return new Blob([view], { type: 'audio/wav' });
}

function writeAscii(view: DataView, offset: number, value: string) {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
