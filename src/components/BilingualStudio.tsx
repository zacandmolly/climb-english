import {
  BookOpen,
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
  Star,
  Pause,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { useCuePlayer } from '../hooks/useCuePlayer';
import { patternsForEnglish } from '../lib/cue';
import { CLIMBING_TERM_DICT } from '../data/videos/climbing-terms';
import { loadVideo } from '../data/videos';
import type { Keyword, SubtitleCue, VideoCategory, VideoEntry, VideoSummary } from '../types';
import { formatDuration, formatTime, HighlightedText } from '../lib/ui';
import { CueMediaPlayer } from '../players/CueMediaPlayer';
import { SpeakingCoach, type CoachTarget } from './SpeakingCoach';

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

// Bilingual subtitle studio: watch a climbing video with synced en/zh cues,
// click any cue to loop it, shadow it with the AI coach. Full cue data is
// lazy-loaded per video; the library listing runs on lightweight summaries.
// hideLibraryStrip: when the video is selected upstream (素材栏), the studio's
// own library picker is redundant and can be hidden.
export function BilingualStudio({
  summaries,
  hideLibraryStrip = false,
}: {
  summaries: VideoSummary[];
  hideLibraryStrip?: boolean;
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
  const [query, setQuery] = useState('');
  const [showZh, setShowZh] = useState(true);
  const [studyOnly, setStudyOnly] = useState(false);

  useEffect(() => {
    let alive = true;
    setVideo(null);
    void loadVideo(videoId).then((loaded) => {
      if (alive) setVideo(loaded ?? null);
    });
    return () => {
      alive = false;
    };
  }, [videoId]);

  const cues = useMemo(() => video?.cues ?? [], [video]);
  const player = useCuePlayer(cues, video?.mediaStartTime ?? 0, video?.id ?? '');
  const activeCue = cues[player.activeCueIndex] ?? cues[0];
  const activeKeywords = useMemo(() => expandTerms(activeCue?.keywords ?? []), [activeCue]);

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

      {!video ? (
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

          <SubtitlePanel
            cues={cues}
            activeCueIndex={player.activeCueIndex}
            currentTime={player.currentTime}
            mediaStartTime={video.mediaStartTime}
            showZh={showZh}
            studyOnly={studyOnly}
            onSelectCue={(index) => player.playCue(index)}
          />
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

function SubtitlePanel({
  cues,
  activeCueIndex,
  currentTime,
  mediaStartTime,
  showZh,
  studyOnly,
  onSelectCue,
}: {
  cues: SubtitleCue[];
  activeCueIndex: number;
  currentTime: number;
  mediaStartTime: number;
  showZh: boolean;
  studyOnly: boolean;
  onSelectCue: (index: number) => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const visible = studyOnly ? cues.filter((cue) => cue.study) : cues;
  const terms = useMemo(() => Array.from(new Set(cues.flatMap((cue) => cue.keywords))), [cues]);

  // Pin the active cue to the TOP of the list: as playback advances the
  // subtitle cards scroll upward underneath it (like the reference UI).
  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-cue-index="${activeCueIndex}"]`);
    if (!list || !row) return;
    const rowTop =
      row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    list.scrollTo({ top: Math.max(0, rowTop - 8), behavior: 'smooth' });
  }, [activeCueIndex]);

  return (
    <section className="subtitle-panel" aria-label="Bilingual subtitles">
      <div className="panel-heading spread">
        <span>
          <BookOpen size={18} aria-hidden="true" />
          中英字幕 · {visible.length}/{cues.length} 句
        </span>
        <span className="subtitle-legend">
          <Star size={13} aria-hidden="true" /> 高分佳句
        </span>
      </div>
      <div className="subtitle-list" ref={listRef}>
        {visible.map((cue) => {
          const index = cues.indexOf(cue);
          const isActive = index === activeCueIndex;
          const cueProgress = isActive
            ? Math.min(
                100,
                Math.max(
                  0,
                  ((currentTime + mediaStartTime - cue.startTime) /
                    Math.max(0.1, cue.endTime - cue.startTime)) *
                    100
                )
              )
            : 0;
          return (
            <button
              className={`subtitle-card ${isActive ? 'active' : ''} ${cue.study ? '' : 'filler'}`}
              data-cue-index={index}
              style={{ '--cue-progress': `${cueProgress}%` } as CSSProperties}
              key={cue.id}
              type="button"
              onClick={() => onSelectCue(index)}
            >
              <span className="subtitle-topline">
                <span className="subtitle-ts">{formatTime(cue.startTime)}</span>
                {cue.highlight ? (
                  <span className="subtitle-star">
                    <Star size={13} aria-hidden="true" /> 佳句
                  </span>
                ) : null}
                {cue.score >= 0 ? <em className="score-chip">{cue.score}</em> : null}
              </span>
              <span className="subtitle-en">
                <HighlightedText text={cue.en} terms={terms} />
              </span>
              {showZh && cue.zh ? <span className="subtitle-zh">{cue.zh}</span> : null}
              {showZh && cue.needsTranslation ? (
                <span className="subtitle-zh pending">翻译待补</span>
              ) : null}
            </button>
          );
        })}
      </div>
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
