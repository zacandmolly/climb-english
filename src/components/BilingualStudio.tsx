import {
  Captions,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Gauge,
  Languages,
  ListFilter,
  ListMusic,
  Play,
  Repeat,
  Search,
  Pause,
} from 'lucide-react';
import { Profiler, useEffect, useMemo, useRef, useState } from 'react';
import { useCuePlayer } from '../hooks/useCuePlayer';
import { patternsForEnglish } from '../lib/cue';
import { reportError } from '../lib/errorReporter';
import { describeVideoLoadFailure, type VideoLoadFailure } from '../lib/videoLoad';
import { CLIMBING_TERM_DICT } from '../data/videos/climbing-terms';
import { loadVideo } from '../data/videos';
import type { Keyword, VideoCategory, VideoEntry, VideoSummary } from '../types';
import { formatDuration } from '../lib/ui';
import { CueMediaPlayer } from '../players/CueMediaPlayer';
import { resolveVideoResumePosition, type VideoResumePosition } from '../progress/videoSession';
import { SpeakingCoach, type CoachTarget } from './SpeakingCoach';
import { SubtitlePanel } from './SubtitlePanel';

const CATEGORY_ORDER: VideoCategory[] = [
  'world-cup',
  'technique',
  'interview',
  'training',
  'other',
];
const CATEGORY_NAMES: Record<VideoCategory, string> = {
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

declare global {
  interface Window {
    __CLIMB_ENGLISH_MOBILE_QA__?: {
      subtitleCommits: Array<{ at: number; actualDuration: number; activeCueIndex: number }>;
    };
  }
}

// Bilingual subtitle studio: watch a climbing video with synced en/zh cues,
// click any cue to loop it, shadow it with the AI coach. Full cue data is
// lazy-loaded per video; the library listing runs on lightweight summaries.
// hideLibraryStrip: when the video is selected upstream (素材栏), the studio's
// own library picker is redundant and can be hidden.
export function BilingualStudio({
  summaries,
  hideLibraryStrip = false,
  isActive = true,
  resumePosition,
  onPositionChange,
  onReturnToLibrary,
}: {
  summaries: VideoSummary[];
  hideLibraryStrip?: boolean;
  isActive?: boolean;
  resumePosition?: VideoResumePosition;
  onPositionChange?: (videoId: string, position: VideoResumePosition) => void;
  onReturnToLibrary?: () => void;
}) {
  const [videoId, setVideoId] = useState(() => {
    // Default to the first video in display order (world-cup first).
    for (const category of CATEGORY_ORDER) {
      const hit = summaries.find((entry) => entry.category === category);
      if (hit) return hit.id;
    }
    return summaries[0]?.id ?? '';
  });
  const [video, setVideo] = useState<VideoEntry | null>(null);
  const [loadFailure, setLoadFailure] = useState<VideoLoadFailure | null>(null);
  const [query, setQuery] = useState('');
  const [showZh, setShowZh] = useState(true);
  const [studyOnly, setStudyOnly] = useState(false);
  const lastPositionSaveRef = useRef({ at: 0, cueId: '' });
  const latestPositionRef = useRef<{ videoId: string; position: VideoResumePosition } | null>(null);

  useEffect(() => {
    if (!isActive) return;

    const compactLandscape = window.matchMedia(
      '(max-width: 920px) and (orientation: landscape) and (max-height: 520px)'
    );
    let firstFrame = 0;
    let secondFrame = 0;
    const resetOuterScroll = () => {
      // Android Chrome preserves the document scroll anchor across rotation.
      // The landscape studio reflows into a compact grid, so that old anchor
      // can otherwise land in the coach section with the video off-screen.
      // Wait for the new layout, then reset only the OUTER page scroll; the
      // virtual subtitle list keeps its own active-cue position and state.
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        });
      });
    };
    compactLandscape.addEventListener('change', resetOuterScroll);
    return () => {
      compactLandscape.removeEventListener('change', resetOuterScroll);
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [isActive]);

  useEffect(() => {
    let alive = true;
    setVideo(null);
    setLoadFailure(null);
    void loadVideo(videoId)
      .then((loaded) => {
        if (!loaded) throw new Error(`Unknown video material: ${videoId}`);
        if (alive) setVideo(loaded);
      })
      .catch((cause: unknown) => {
        const failure = describeVideoLoadFailure(videoId, cause);
        if (alive) {
          reportError(failure.error);
          setLoadFailure(failure);
        }
      });
    return () => {
      alive = false;
    };
  }, [videoId]);

  const cues = useMemo(() => video?.cues ?? [], [video]);
  const resolvedResumePosition = useMemo(
    () =>
      video && resumePosition
        ? resolveVideoResumePosition(
            resumePosition,
            cues,
            video.mediaStartTime,
            video.durationSeconds
          )
        : undefined,
    [cues, resumePosition, video]
  );
  const player = useCuePlayer(
    cues,
    video?.mediaStartTime ?? 0,
    video?.id ?? '',
    resolvedResumePosition
  );
  const activeCue = cues[player.activeCueIndex] ?? cues[0];
  const activeKeywords = useMemo(() => expandTerms(activeCue?.keywords ?? []), [activeCue]);

  useEffect(() => {
    if (isActive) return;
    player.pause();
    const latest = latestPositionRef.current;
    if (latest && onPositionChange) onPositionChange(latest.videoId, latest.position);
  }, [isActive, onPositionChange, player.pause]);

  useEffect(() => {
    if (!video || !activeCue || !onPositionChange) return;
    const now = Date.now();
    const last = lastPositionSaveRef.current;
    const cueChanged = last.cueId !== activeCue.id;
    const enoughTimePassed = now - last.at >= 500;
    const position: VideoResumePosition = {
      cueId: activeCue.id,
      cueIndex: player.activeCueIndex,
      currentTime: player.currentTime,
      updatedAt: new Date(now).toISOString(),
    };
    latestPositionRef.current = { videoId: video.id, position };
    if (!cueChanged && !enoughTimePassed) return;

    lastPositionSaveRef.current = {
      at: now,
      cueId: activeCue.id,
    };
    onPositionChange(video.id, position);
  }, [activeCue, onPositionChange, player.activeCueIndex, player.currentTime, video]);

  useEffect(
    () => () => {
      const latest = latestPositionRef.current;
      if (latest && onPositionChange) onPositionChange(latest.videoId, latest.position);
    },
    [onPositionChange]
  );

  const coachTarget: CoachTarget | null =
    video && activeCue
      ? {
          clipId: `${video.id}:cue:${activeCue.id}`,
          sentence: activeCue.en,
          keywords: activeKeywords,
          patterns: patternsForEnglish(activeCue.en),
          prompt: '先模仿解说复述这句，再用自己的话描述这个动作。',
          label: 'Shadowing sentence',
        }
      : null;
  const subtitlePanel = video ? (
    <SubtitlePanel
      cues={cues}
      activeCueIndex={player.activeCueIndex}
      currentTime={player.currentTime}
      mediaStartTime={video.mediaStartTime}
      showZh={showZh}
      studyOnly={studyOnly}
      isActive={isActive}
      onSelectCue={player.playCue}
    />
  ) : null;
  const measuredSubtitlePanel = window.__CLIMB_ENGLISH_MOBILE_QA__ ? (
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
      {subtitlePanel}
    </Profiler>
  ) : (
    subtitlePanel
  );

  if (summaries.length === 0) {
    return (
      <main className="bilingual-shell">
        <p className="empty-library">
          视频库为空。运行 npm run import:youtube 导入第一条攀岩视频。
        </p>
      </main>
    );
  }

  return (
    <main className="stage-flow">
      {hideLibraryStrip ? null : (
        <LibraryStrip
          summaries={summaries}
          activeVideoId={videoId}
          query={query}
          onQueryChange={setQuery}
          onSelect={(id) => {
            setVideoId(id);
            player.pause();
          }}
        />
      )}

      {!video && loadFailure ? (
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
      ) : !video ? (
        <section className="stage-card" aria-label="Loading video">
          <p className="empty-library">正在加载字幕数据…</p>
        </section>
      ) : (
        <section className="stage-card" aria-label="Bilingual subtitle studio">
          <div className="clip-head">
            <div>
              <p className="eyebrow">{CATEGORY_NAMES[video.category]}</p>
              <h2>{video.title}</h2>
              <p className="clip-subtitle">
                {video.channel} · {LEVEL_NAMES[video.level]} · {video.studyCueCount}/
                {video.cueCount} 学习句
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
                onClick={() =>
                  player.isPlaying ? player.pause() : player.playCue(player.activeCueIndex)
                }
                disabled={!video.mediaUrl && !video.youtubeId && !video.previewMediaUrl}
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
                disabled={player.activeCueIndex >= cues.length - 1}
                onClick={() => player.playCue(player.activeCueIndex + 1)}
              >
                <ChevronRight size={19} aria-hidden="true" />
                <span>下一句</span>
              </button>
            </div>
            <div className="learning-controls">
              <button
                className="control-button"
                type="button"
                onClick={player.playContinuous}
                disabled={!video.mediaUrl && !video.youtubeId && !video.previewMediaUrl}
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
                onClick={() => setShowZh((value) => !value)}
              >
                <Languages size={16} aria-hidden="true" />
                {showZh ? '隐藏中文' : '显示中文'}
              </button>
              <button
                className={`control-button ${studyOnly ? 'active' : ''}`}
                type="button"
                onClick={() => setStudyOnly((value) => !value)}
                title="只显示有学习价值的句子"
              >
                <ListFilter size={16} aria-hidden="true" />
                只看学习句
              </button>
            </div>
          </div>

          {measuredSubtitlePanel}
        </section>
      )}

      {coachTarget ? (
        <>
          {activeKeywords.length > 0 ? (
            <div className="keyword-row stage-card compact" aria-label="Cue keywords">
              {activeKeywords.map((keyword) => (
                <span className="keyword-chip" key={keyword.term} title={keyword.example}>
                  <strong>{keyword.term}</strong>
                  {keyword.zh}
                </span>
              ))}
            </div>
          ) : null}
          <SpeakingCoach target={coachTarget} />
        </>
      ) : null}
    </main>
  );
}

function LibraryStrip({
  summaries,
  activeVideoId,
  query,
  onQueryChange,
  onSelect,
}: {
  summaries: VideoSummary[];
  activeVideoId: string;
  query: string;
  onQueryChange: (value: string) => void;
  onSelect: (id: string) => void;
}) {
  const normalizedQuery = query.trim().toLowerCase();
  const filtered = summaries.filter((video) => {
    if (!normalizedQuery) return true;
    return `${video.title} ${video.channel}`.toLowerCase().includes(normalizedQuery);
  });
  const ordered = CATEGORY_ORDER.flatMap((category) =>
    filtered.filter((video) => video.category === category)
  );

  return (
    <section className="library-strip" aria-label="Video library">
      <div className="library-strip-head">
        <span className="daily-strip-title">
          <Captions size={16} aria-hidden="true" />
          视频库 · {ordered.length}
        </span>
        <label className="library-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            placeholder="搜索标题或频道…"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
          />
        </label>
      </div>

      {ordered.length === 0 ? <p className="empty-library">没有匹配的视频。</p> : null}

      <div className="library-strip-row">
        {ordered.map((video) => (
          <button
            className={`library-card ${video.id === activeVideoId ? 'active' : ''}`}
            key={video.id}
            type="button"
            onClick={() => onSelect(video.id)}
          >
            <span className="library-card-cat">{CATEGORY_NAMES[video.category]}</span>
            <span className="library-card-title">{video.title}</span>
            <span className="library-card-meta">
              {video.channel || 'YouTube'} · {formatDuration(video.durationSeconds)} ·{' '}
              {video.studyCueCount} 学习句
            </span>
            <span className="library-card-badges">
              <em>{LEVEL_NAMES[video.level]}</em>
              {(video.needsTranslationCount ?? 0) === 0 ? (
                <em className="badge-reviewed">已校对</em>
              ) : null}
              {video.mediaUrl ? null : <em className="badge-nomedia">仅字幕</em>}
            </span>
          </button>
        ))}
      </div>
      <p className="library-strip-hint">
        导入新视频：npm run import:youtube &lt;YouTube链接&gt;；每日自动发现已在后台运行。
      </p>
    </section>
  );
}

function expandTerms(terms: string[]): Keyword[] {
  return terms.map((term) => {
    const entry = CLIMBING_TERM_DICT[term];
    return {
      term,
      zh: entry?.zh ?? '',
      example: entry?.example ?? '',
    };
  });
}
