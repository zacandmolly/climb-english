import { Sparkles, Volume2 } from 'lucide-react';
import { useCoachRecorder } from '../hooks/useCoachRecorder';
import { formatBytes } from '../lib/audio';
import type { Keyword } from '../types';
import { CoachRecorderControls, isMicrophoneInputLocked } from './CoachRecorderControls';
import { FeedbackServiceNotice } from './FeedbackServiceNotice';

export type CoachTarget = {
  clipId: string;
  sentence: string;
  keywords: Keyword[];
  patterns: string[];
  prompt: string;
  label?: string;
};

// Presentation for the bilingual video library. Recording and feedback are
// deliberately owned by useCoachRecorder so both coach surfaces behave alike.
export function SpeakingCoach({ target }: { target: CoachTarget }) {
  const targetSentence = target.sentence;
  const prompt = target.prompt;
  const patterns = target.patterns;
  const recorder = useCoachRecorder({
    clipId: target.clipId,
    sentence: targetSentence,
    keywords: target.keywords,
  });
  const {
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
  } = recorder;

  return (
    <aside className="coach-pane coach-bottom" aria-label="Speaking coach">
      <div className="panel-heading">
        <Sparkles size={18} aria-hidden="true" />
        <span>AI 教练</span>
        <span className="coach-hint">录一遍跟读，右侧实时给反馈</span>
      </div>

      <FeedbackServiceNotice service={feedbackService} />

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
              disabled={isMicrophoneInputLocked(isRecording, isStarting)}
              onChange={(event) => selectAudioInput(event.target.value)}
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

          <CoachRecorderControls
            isRecording={isRecording}
            isStarting={isStarting}
            isSending={isSending}
            hasRecording={Boolean(recordedBlob)}
            canUseAiFeedback={canUseAiFeedback}
            recordIconSize={18}
            sendIconSize={16}
            sendTitle="Send recording for feedback"
            onStart={startRecording}
            onStop={stopRecording}
            onSend={sendFeedback}
          />

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
              <div className="feedback-mode">
                {feedback.mode === 'demo' ? '离线反馈' : 'AI 反馈'}
              </div>
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
              <p>
                {isSending
                  ? '录音正在发送并等待 AI 反馈，请稍候。'
                  : '还没有反馈。录一遍这句跟读，点「反馈」，这里会显示关键词命中、语速节奏和下一遍建议。'}
              </p>
            </section>
          )}
        </div>
      </div>
    </aside>
  );
}
