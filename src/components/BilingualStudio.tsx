import { Captions, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import {
  useBilingualVideo,
  useCompactLandscapeScrollReset,
  useResolvedVideoResumePosition,
  useVideoPositionPersistence,
} from '../hooks/useBilingualStudioSession';
import { useCuePlayer } from '../hooks/useCuePlayer';
import { patternsForEnglish } from '../lib/cue';
import { CLIMBING_TERM_DICT } from '../data/videos/climbing-terms';
import type { Keyword, VideoCategory, VideoEntry, VideoSummary } from '../types';
import { formatDuration } from '../lib/ui';
import type { VideoResumePosition } from '../progress/videoSession';
import { BilingualVideoStage } from './BilingualVideoStage';
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
  const [videoId, setVideoId] = useState(() => initialVideoId(summaries));
  const [query, setQuery] = useState('');
  const [showZh, setShowZh] = useState(true);
  const [studyOnly, setStudyOnly] = useState(false);
  const { video, loadFailure } = useBilingualVideo(videoId);

  useCompactLandscapeScrollReset(isActive);

  const cues = useMemo(() => video?.cues ?? [], [video]);
  const resolvedResumePosition = useResolvedVideoResumePosition(video, resumePosition);
  const player = useCuePlayer(
    cues,
    video?.mediaStartTime ?? 0,
    video?.id ?? '',
    resolvedResumePosition
  );
  const activeCue = cues[player.activeCueIndex] ?? cues[0];
  const activeKeywords = useMemo(() => expandTerms(activeCue?.keywords ?? []), [activeCue]);

  useVideoPositionPersistence({
    isActive,
    video,
    activeCue,
    activeCueIndex: player.activeCueIndex,
    currentTime: player.currentTime,
    pause: player.pause,
    onPositionChange,
  });

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

      <BilingualVideoStage
        video={video}
        loadFailure={loadFailure}
        player={player}
        showZh={showZh}
        studyOnly={studyOnly}
        isActive={isActive}
        onToggleZh={() => setShowZh((value) => !value)}
        onToggleStudyOnly={() => setStudyOnly((value) => !value)}
        onReturnToLibrary={onReturnToLibrary}
      />

      <CoachPractice target={coachTarget} keywords={activeKeywords} />
    </main>
  );
}

function initialVideoId(summaries: VideoSummary[]): string {
  for (const category of CATEGORY_ORDER) {
    const hit = summaries.find((entry) => entry.category === category);
    if (hit) return hit.id;
  }
  return summaries[0]?.id ?? '';
}

function CoachPractice({ target, keywords }: { target: CoachTarget | null; keywords: Keyword[] }) {
  if (!target) return null;

  return (
    <>
      {keywords.length > 0 ? (
        <div className="keyword-row stage-card compact" aria-label="Cue keywords">
          {keywords.map((keyword) => (
            <span className="keyword-chip" key={keyword.term} title={keyword.example}>
              <strong>{keyword.term}</strong>
              {keyword.zh}
            </span>
          ))}
        </div>
      ) : null}
      <SpeakingCoach target={target} />
    </>
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
