import {
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Gauge,
  Languages,
  ListFilter,
  ListMusic,
  Pause,
  Play,
  Repeat,
} from 'lucide-react';
import { Profiler } from 'react';
import type { useCuePlayer } from '../hooks/useCuePlayer';
import type { VideoLoadFailure } from '../lib/videoLoad';
import type { VideoEntry } from '../types';
import { CueMediaPlayer } from '../players/CueMediaPlayer';
import { SubtitlePanel } from './SubtitlePanel';

const CATEGORY_NAMES: Record<VideoEntry['category'], string> = {
  'world-cup': 'World Cup 赛事解说',
  technique: '攀岩技巧教学',
  interview: '访谈对话',
  training: '训练方法',
  other: '其他',
};

const LEVEL_NAMES: Record<VideoEntry['level'], string> = {
  beginner: '入门',
  intermediate: '进阶',
  advanced: '高阶',
};

type CuePlayer = ReturnType<typeof useCuePlayer>;

type BilingualVideoStageProps = {
  video: VideoEntry | null;
  loadFailure: VideoLoadFailure | null;
  player: CuePlayer;
  showZh: boolean;
  studyOnly: boolean;
  isActive: boolean;
  onToggleZh: () => void;
  onToggleStudyOnly: () => void;
  onReturnToLibrary?: () => void;
};

export function BilingualVideoStage({
  video,
  loadFailure,
  player,
  showZh,
  studyOnly,
  isActive,
  onToggleZh,
  onToggleStudyOnly,
  onReturnToLibrary,
}: BilingualVideoStageProps) {
  if (!video) {
    return <VideoLoadState loadFailure={loadFailure} onReturnToLibrary={onReturnToLibrary} />;
  }

  return (
    <section className="stage-card bilingual-studio" aria-label="Bilingual subtitle studio">
      <div className="clip-head">
        <div>
          <p className="eyebrow">{CATEGORY_NAMES[video.category]}</p>
          <h2>{video.title}</h2>
          <p className="clip-subtitle">
            {video.channel} · {LEVEL_NAMES[video.level]} · {video.studyCueCount}/{video.cueCount}{' '}
            学习句
          </p>
        </div>
        <a
          className="review-badge source-link"
          href={video.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          <ExternalLink size={13} aria-hidden="true" /> 原视频
        </a>
      </div>

      <div className="video-frame bilingual-frame">
        <CueMediaPlayer
          key={video.id}
          ref={player.mediaRef}
          mediaUrl={video.mediaUrl}
          youtubeId={video.youtubeId}
          mediaStartTime={video.mediaStartTime}
          previewMediaUrl={video.previewMediaUrl}
          previewStartTime={video.previewStartTime}
          previewDurationSeconds={video.previewDurationSeconds}
          preferPreview={video.preferPreview}
          sourceUrl={video.sourceUrl}
          onTimeUpdate={player.handleTimeUpdate}
          onPlayingChange={player.setIsPlaying}
        />
      </div>

      <div className="video-controls bilingual-controls">
        <TransportControls video={video} player={player} />
        <LearningControls
          video={video}
          player={player}
          showZh={showZh}
          studyOnly={studyOnly}
          onToggleZh={onToggleZh}
          onToggleStudyOnly={onToggleStudyOnly}
        />
      </div>

      <MeasuredSubtitlePanel
        video={video}
        player={player}
        showZh={showZh}
        studyOnly={studyOnly}
        isActive={isActive}
      />
    </section>
  );
}

function VideoLoadState({
  loadFailure,
  onReturnToLibrary,
}: {
  loadFailure: VideoLoadFailure | null;
  onReturnToLibrary?: () => void;
}) {
  if (!loadFailure) {
    return (
      <section className="stage-card" aria-label="Loading video">
        <p className="empty-library">正在加载字幕数据…</p>
      </section>
    );
  }

  return (
    <section className="stage-card video-load-error" aria-label="Video load error">
      <div role="alert">
        <h2>字幕数据加载失败</h2>
        <p>网络或素材分包暂时不可用。你的学习位置已经保留。</p>
        <code data-testid="video-load-error-meta">
          {loadFailure.materialId} · {loadFailure.chunkUrl}
        </code>
      </div>
      <div className="video-load-actions">
        <button
          className="control-button primary"
          type="button"
          onClick={() => window.location.reload()}
        >
          重试
        </button>
        <button className="control-button" type="button" onClick={onReturnToLibrary}>
          返回素材列表
        </button>
      </div>
    </section>
  );
}

function TransportControls({ video, player }: { video: VideoEntry; player: CuePlayer }) {
  const canPlay = Boolean(video.mediaUrl || video.youtubeId || video.previewMediaUrl);

  return (
    <div className="transport-controls">
      <button
        className="control-button transport-button"
        type="button"
        aria-label="上一句"
        disabled={player.activeCueIndex <= 0}
        onClick={() => player.playCue(player.activeCueIndex - 1)}
      >
        <ChevronLeft size={19} aria-hidden="true" />
        <span>上一句</span>
      </button>
      <button
        className="control-button primary play-toggle"
        type="button"
        onClick={() => (player.isPlaying ? player.pause() : player.playCue(player.activeCueIndex))}
        disabled={!canPlay}
      >
        {player.isPlaying ? (
          <Pause size={18} aria-hidden="true" />
        ) : (
          <Play size={18} aria-hidden="true" />
        )}
        {player.isPlaying ? '暂停' : '播放本句'}
      </button>
      <button
        className="control-button transport-button"
        type="button"
        aria-label="下一句"
        disabled={player.activeCueIndex >= video.cues.length - 1}
        onClick={() => player.playCue(player.activeCueIndex + 1)}
      >
        <ChevronRight size={19} aria-hidden="true" />
        <span>下一句</span>
      </button>
    </div>
  );
}

function LearningControls({
  video,
  player,
  showZh,
  studyOnly,
  onToggleZh,
  onToggleStudyOnly,
}: {
  video: VideoEntry;
  player: CuePlayer;
  showZh: boolean;
  studyOnly: boolean;
  onToggleZh: () => void;
  onToggleStudyOnly: () => void;
}) {
  const canPlay = Boolean(video.mediaUrl || video.youtubeId || video.previewMediaUrl);

  return (
    <div className="learning-controls">
      <button
        className="control-button"
        type="button"
        onClick={player.playContinuous}
        disabled={!canPlay}
      >
        <ListMusic size={17} aria-hidden="true" />
        连播
      </button>
      <button
        className={`control-button ${player.loopOne ? 'active' : ''}`}
        type="button"
        onClick={() => player.setLoopOne(!player.loopOne)}
        title="单句循环"
      >
        <Repeat size={16} aria-hidden="true" />
        单句循环
      </button>
      <button
        className={`control-button ${player.playbackRate !== 1 ? 'active' : ''}`}
        type="button"
        onClick={player.toggleRate}
      >
        <Gauge size={17} aria-hidden="true" />
        {player.playbackRate === 1 ? '慢速' : `${player.playbackRate}x`}
      </button>
      <button
        className={`control-button ${showZh ? 'active' : ''}`}
        type="button"
        onClick={onToggleZh}
      >
        <Languages size={16} aria-hidden="true" />
        {showZh ? '隐藏中文' : '显示中文'}
      </button>
      <button
        className={`control-button ${studyOnly ? 'active' : ''}`}
        type="button"
        onClick={onToggleStudyOnly}
        title="只显示有学习价值的句子"
      >
        <ListFilter size={16} aria-hidden="true" />
        只看学习句
      </button>
    </div>
  );
}

function MeasuredSubtitlePanel({
  video,
  player,
  showZh,
  studyOnly,
  isActive,
}: {
  video: VideoEntry;
  player: CuePlayer;
  showZh: boolean;
  studyOnly: boolean;
  isActive: boolean;
}) {
  const panel = (
    <SubtitlePanel
      cues={video.cues}
      activeCueIndex={player.activeCueIndex}
      currentTime={player.currentTime}
      mediaStartTime={video.mediaStartTime}
      showZh={showZh}
      studyOnly={studyOnly}
      isActive={isActive}
      onSelectCue={player.playCue}
    />
  );

  if (!window.__CLIMB_ENGLISH_MOBILE_QA__) return panel;

  return (
    <Profiler
      id="SubtitlePanel"
      onRender={(_id, _phase, actualDuration) => {
        window.__CLIMB_ENGLISH_MOBILE_QA__?.subtitleCommits.push({
          at: performance.now(),
          actualDuration,
          activeCueIndex: player.activeCueIndex,
        });
      }}
    >
      {panel}
    </Profiler>
  );
}
