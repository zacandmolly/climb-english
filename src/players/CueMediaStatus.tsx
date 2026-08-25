import type { CueMediaSource } from './cueMedia';

type CueMediaStatusProps = {
  source: CueMediaSource;
  youtubeReady: boolean;
  youtubeSlow: boolean;
  youtubeFailed: boolean;
  youtubeRetrying: boolean;
  hasPreviewMedia: boolean;
  previewDurationSeconds: number;
  sourceUrl: string;
  onRetryYoutube: () => void;
  onReplayPreview: () => void;
};

export function CueMediaStatus({
  source,
  youtubeReady,
  youtubeSlow,
  youtubeFailed,
  youtubeRetrying,
  hasPreviewMedia,
  previewDurationSeconds,
  sourceUrl,
  onRetryYoutube,
  onReplayPreview,
}: CueMediaStatusProps) {
  const previewDurationLabel = Math.round(previewDurationSeconds);

  if (source === 'preview') {
    return (
      <>
        <p className="media-source-note preview-note" role="status">
          {previewDurationLabel} 秒快速预览 · 完整视频正在后台载入
        </p>
        {youtubeSlow || youtubeFailed ? (
          <div className={`yt-loading compact ${youtubeFailed ? 'warn' : ''}`} aria-live="polite">
            <p>
              {youtubeFailed
                ? 'YouTube 完整视频暂不可用；快速预览会继续播放。'
                : 'YouTube 仍在缓冲；快速预览会继续显示，避免黑屏。'}
            </p>
            <div className="yt-recovery-actions">
              <button className="recovery-button" type="button" onClick={onRetryYoutube}>
                重试加载
              </button>
              {youtubeFailed ? (
                <a className="recovery-link" href={sourceUrl} target="_blank" rel="noreferrer">
                  在 YouTube 打开原视频
                </a>
              ) : null}
            </div>
          </div>
        ) : null}
      </>
    );
  }

  if (source === 'youtube') {
    return (
      <>
        {!youtubeReady && !youtubeSlow && !youtubeFailed ? (
          <div className={`yt-loading ${youtubeRetrying ? 'compact' : ''}`} aria-live="polite">
            <p>正在载入 YouTube 完整视频；就绪后会按同一时间轴继续播放。</p>
          </div>
        ) : null}
        {youtubeSlow && !youtubeFailed ? (
          <div className="yt-loading compact" aria-live="polite">
            <p>YouTube 视频加载缓慢，请检查网络或重试；当前画面已保留。</p>
            <div className="yt-recovery-actions">
              <button className="recovery-button" type="button" onClick={onRetryYoutube}>
                重试加载
              </button>
            </div>
          </div>
        ) : null}
        {youtubeFailed ? (
          <div className="yt-loading compact warn" aria-live="polite">
            <p>YouTube 视频加载失败或已中断，已保留最后可用画面。</p>
            <div className="yt-recovery-actions">
              <button className="recovery-button primary" type="button" onClick={onRetryYoutube}>
                重试加载
              </button>
              {hasPreviewMedia ? (
                <button className="recovery-button" type="button" onClick={onReplayPreview}>
                  重播 {previewDurationLabel} 秒预览
                </button>
              ) : null}
              <a className="recovery-link" href={sourceUrl} target="_blank" rel="noreferrer">
                在 YouTube 打开原视频
              </a>
            </div>
          </div>
        ) : null}
        <p className="media-source-note" role="status">
          当前使用 YouTube 原视频；句子剪切与卡拉 OK 仍按导入 cue 时间轴运行。
        </p>
      </>
    );
  }

  if (source === 'unavailable') {
    return (
      <div className="no-media">
        <p>本地媒体与 YouTube 备用源均不可用。</p>
        <a href={sourceUrl} target="_blank" rel="noreferrer">
          在 YouTube 打开原视频
        </a>
      </div>
    );
  }

  return null;
}
