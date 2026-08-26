import { CircleStop, Mic, Send } from 'lucide-react';

export function isMicrophoneInputLocked(isRecording: boolean, isStarting: boolean): boolean {
  return isRecording || isStarting;
}

function feedbackButtonLabel(isSending: boolean, canUseAiFeedback: boolean): string {
  if (isSending) return '分析中';
  return canUseAiFeedback ? 'AI 反馈' : '离线反馈';
}

export function CoachRecorderControls({
  isRecording,
  isStarting,
  isSending,
  hasRecording,
  canUseAiFeedback,
  recordIconSize,
  sendIconSize,
  sendTitle,
  onStart,
  onStop,
  onSend,
}: {
  isRecording: boolean;
  isStarting: boolean;
  isSending: boolean;
  hasRecording: boolean;
  canUseAiFeedback: boolean;
  recordIconSize: number;
  sendIconSize: number;
  sendTitle: string;
  onStart: () => void;
  onStop: () => void;
  onSend: () => void;
}) {
  return (
    <div className="recording-controls">
      {!isRecording ? (
        <button className="record-button" type="button" onClick={onStart} disabled={isStarting}>
          <Mic size={recordIconSize} aria-hidden="true" />
          {isStarting ? '连接麦克风' : '开始录音'}
        </button>
      ) : (
        <button className="record-button danger" type="button" onClick={onStop}>
          <CircleStop size={recordIconSize} aria-hidden="true" />
          停止录音
        </button>
      )}
      <button
        className="icon-text-button send"
        type="button"
        onClick={onSend}
        disabled={!hasRecording || isSending}
        title={sendTitle}
      >
        <Send size={sendIconSize} aria-hidden="true" />
        {feedbackButtonLabel(isSending, canUseAiFeedback)}
      </button>
    </div>
  );
}
