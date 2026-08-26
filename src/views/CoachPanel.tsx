import { Sparkles, Star, Volume2 } from 'lucide-react';
import {
  CoachRecorderControls,
  isMicrophoneInputLocked,
} from '../components/CoachRecorderControls';
import { FeedbackServiceNotice } from '../components/FeedbackServiceNotice';
import { useCoachRecorder } from '../hooks/useCoachRecorder';
import { formatBytes } from '../lib/audio';
import { fullTranscript, segmentPatterns, uniqueKeywords } from '../lib/lesson';
import type { Keyword, Lesson, PracticeMode, PracticeSentence } from '../types';

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
  const activeKeywords = mode === 'segment' ? uniqueKeywords(lesson.sentences) : sentence.keywords;
  const targetSentence = mode === 'segment' ? fullTranscript(lesson) : sentence.transcript;
  const prompt =
    mode === 'segment'
      ? 'Listen to the whole passage, then retell the action in your own words.'
      : sentence.speakingPrompt;
  const patterns = mode === 'segment' ? segmentPatterns(lesson) : sentence.sentencePatterns;
  const recorder = useCoachRecorder({
    clipId: `${lesson.id}:${mode}:${sentence.id}`,
    sentence: targetSentence,
    keywords: activeKeywords,
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
        recordIconSize={17}
        sendIconSize={15}
        sendTitle="发送录音获取反馈"
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
