import { CircleStop, Mic, Send, Sparkles, Star, Volume2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FeedbackServiceNotice } from '../components/FeedbackServiceNotice';
import { LOW_INPUT_LEVEL } from '../constants';
import { useFeedbackService } from '../hooks/useFeedbackService';
import { encodeWav, formatBytes, getRecordingErrorMessage, mergeFloat32Arrays } from '../lib/audio';
import { FEEDBACK_API_BASE, makeClientDemoFeedback } from '../lib/feedback';
import { fullTranscript, segmentPatterns, uniqueKeywords } from '../lib/lesson';
import { feedbackRequestUrl } from '../lib/runtimeServices';
import type { Feedback, Keyword, Lesson, PracticeMode, PracticeSentence } from '../types';

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

export function CoachPanel({
  lesson,
  sentence,
  mode,
  currentDay,
  vocabTerms,
  onToggleVocabTerm,
}: {
  lesson: Lesson;
  sentence: PracticeSentence;
  mode: PracticeMode;
  currentDay: number;
  vocabTerms: Set<string>;
  onToggleVocabTerm: (keyword: Keyword) => void;
}) {
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
  const uploadAttemptedBlobRef = useRef<Blob | null>(null);
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
  const activeKeywords = mode === 'segment' ? uniqueKeywords(lesson.sentences) : sentence.keywords;
  const targetSentence = mode === 'segment' ? fullTranscript(lesson) : sentence.transcript;
  const prompt =
    mode === 'segment'
      ? 'Listen to the whole passage, then retell the action in your own words.'
      : sentence.speakingPrompt;
  const patterns = mode === 'segment' ? segmentPatterns(lesson) : sentence.sentencePatterns;
  const selectedAudioInput = audioInputs.find((device) => device.deviceId === selectedAudioInputId);
  const displayedMicLevel = isRecording ? micLevel : recordedPeakLevel;
  const displayedMicPercent = Math.round(displayedMicLevel * 100);
  const { service: feedbackService, canUseAiFeedback, markUnavailable } = useFeedbackService();

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
      (
        window as Window &
          typeof globalThis & {
            SpeechRecognition?: SpeechRecognitionConstructor;
            webkitSpeechRecognition?: SpeechRecognitionConstructor;
          }
      ).SpeechRecognition ??
      (
        window as Window &
          typeof globalThis & {
            webkitSpeechRecognition?: SpeechRecognitionConstructor;
          }
      ).webkitSpeechRecognition;

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
  }, [lesson.id, sentence.id, mode]);

  const startRecording = async () => {
    try {
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
      if (canUseAiFeedback) startSpeechRecognition();
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
      recordingSampleRateRef.current
    );
    const peakLevel = peakMicLevelRef.current;
    cleanupRecordingResources();
    setIsRecording(false);
    setRecordedPeakLevel(peakLevel);
    setSpeechTranscript(
      `${finalSpeechTranscriptRef.current} ${interimSpeechTranscriptRef.current}`.trim()
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
        : null
    );
  };

  const sendFeedback = async () => {
    if (!recordedBlob) {
      setError('先录一遍，再让 AI 教练反馈。');
      return;
    }

    setError(null);
    if (!canUseAiFeedback) {
      setFeedback(
        makeClientDemoFeedback({
          targetSentence,
          keywords: activeKeywords,
          delivery:
            uploadAttemptedBlobRef.current === recordedBlob ? 'remote-failed' : 'local-only',
        })
      );
      return;
    }

    setFeedback(null);
    setIsSending(true);

    try {
      const formData = new FormData();
      formData.append('audio', recordedBlob, 'shadowing.wav');
      formData.append('clipId', `${lesson.id}:${mode}:${sentence.id}`);
      formData.append('targetSentence', targetSentence);
      formData.append('transcript', targetSentence);
      formData.append('keywords', activeKeywords.map((keyword) => keyword.term).join(', '));
      formData.append('durationSeconds', String(recordingSeconds));
      formData.append('recordedBytes', String(recordedBytes));
      formData.append('spokenText', speechTranscript);

      uploadAttemptedBlobRef.current = recordedBlob;
      const response = await fetch(feedbackRequestUrl(FEEDBACK_API_BASE), {
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
      if (payload.mode !== 'ai') {
        throw new Error('Feedback service did not return AI feedback.');
      }
      setFeedback(payload);
    } catch {
      markUnavailable();
      setFeedback(
        makeClientDemoFeedback({
          targetSentence,
          keywords: activeKeywords,
          delivery: 'remote-failed',
        })
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="coach-pane" aria-label="口语教练">
      <div className="panel-heading">
        <Sparkles size={16} aria-hidden="true" />
        <span>跟读这一句</span>
      </div>

      <FeedbackServiceNotice service={feedbackService} />

      <section className="target-panel">
        <p className="target-label">{mode === 'segment' ? '复述整段' : 'Shadowing 目标句'}</p>
        <p className={mode === 'segment' ? 'target-sentence compact' : 'target-sentence'}>
          {targetSentence}
        </p>
        <p className="speaking-prompt">{prompt}</p>
      </section>

      <section className="keyword-chip-panel" aria-label="攀岩关键词">
        <p className="target-label">关键词 · 点星标收进生词本</p>
        <div className="keyword-chip-list">
          {activeKeywords.map((keyword) => {
            const collected = vocabTerms.has(keyword.term);
            return (
              <button
                className={`keyword-chip ${collected ? 'collected' : ''}`}
                key={keyword.term}
                type="button"
                onClick={() => onToggleVocabTerm(keyword)}
                title={collected ? '已收入生词本，点一下移出' : '收进生词本'}
              >
                <span className="keyword-chip-term">{keyword.term}</span>
                <span className="keyword-chip-zh">{keyword.zh}</span>
                <Star size={13} aria-hidden="true" className={collected ? 'star filled' : 'star'} />
              </button>
            );
          })}
        </div>
      </section>

      <section className="pattern-panel">
        <p className="target-label">句型</p>
        <div className="pattern-list">
          {patterns.map((pattern) => (
            <span key={pattern}>{pattern}</span>
          ))}
        </div>
      </section>

      <section className="mic-device-panel" aria-label="麦克风输入">
        <label htmlFor="microphone-input">麦克风</label>
        <select
          id="microphone-input"
          value={selectedAudioInputId}
          disabled={isRecording}
          onChange={(event) => {
            setSelectedAudioInputId(event.target.value);
            const nextDevice = audioInputs.find((device) => device.deviceId === event.target.value);
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
            <Mic size={17} aria-hidden="true" />
            开始录音
          </button>
        ) : (
          <button className="record-button danger" type="button" onClick={stopRecording}>
            <CircleStop size={17} aria-hidden="true" />
            停止录音
          </button>
        )}
        <button
          className="icon-text-button send"
          type="button"
          onClick={sendFeedback}
          disabled={!recordedBlob || isSending}
          title="发送录音获取反馈"
        >
          <Send size={15} aria-hidden="true" />
          {isSending ? '分析中' : canUseAiFeedback ? 'AI 反馈' : '离线反馈'}
        </button>
      </div>

      {isRecording || recordedBlob ? (
        <div className="recording-status" aria-live="polite">
          <div>
            <strong>{isRecording ? '正在录音' : '已录音'}</strong>
            <span>
              {recordingSeconds}s{recordedBytes > 0 ? ` / ${formatBytes(recordedBytes)}` : ''}
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

      {speechTranscript ? <p className="speech-transcript">识别到：{speechTranscript}</p> : null}

      {audioUrl ? (
        <div className="playback-panel">
          <Volume2 size={16} aria-hidden="true" />
          <audio controls src={audioUrl}>
            <track kind="captions" />
          </audio>
        </div>
      ) : null}

      {error ? <p className="error-box">{error}</p> : null}

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
      ) : null}

      <p className="coach-day-note">
        当前练习：Day {currentDay} · {lesson.sourceLabel}
      </p>
    </section>
  );
}
