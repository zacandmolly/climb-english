import { BookOpen, Star } from 'lucide-react';
import { memo, useEffect, useMemo, useRef } from 'react';
import { activeWordIndex, displayText, speakerWordBoundaries, spokenWords } from '../lib/words';
import type { SubtitleCue } from '../types';
import { formatTime, HighlightedText } from '../lib/ui';

export function SubtitlePanel({
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
  const rows = useMemo(
    () =>
      cues
        .map((cue, index) => ({ cue, index }))
        .filter(({ cue, index }) => !studyOnly || cue.study || index === activeCueIndex),
    [activeCueIndex, cues, studyOnly]
  );
  const terms = useMemo(() => Array.from(new Set(cues.flatMap((cue) => cue.keywords))), [cues]);

  useEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>(`[data-cue-index="${activeCueIndex}"]`);
    if (!list || !row) return;
    const rowTop =
      row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    list.scrollTo({ top: Math.max(0, rowTop - 8), behavior: 'smooth' });
  }, [activeCueIndex, showZh, studyOnly]);

  return (
    <section className="subtitle-panel" aria-label="Bilingual subtitles">
      <div className="panel-heading spread">
        <span>
          <BookOpen size={18} aria-hidden="true" />
          中英字幕 · {rows.length}/{cues.length} 句
        </span>
        <span className="subtitle-legend">
          <Star size={13} aria-hidden="true" /> 高分佳句
        </span>
      </div>
      <div className="subtitle-list" ref={listRef}>
        {rows.map(({ cue, index }) => {
          const isActive = index === activeCueIndex;
          return (
            <button
              className={`subtitle-card ${isActive ? 'active' : ''} ${cue.study ? '' : 'filler'}`}
              data-cue-index={index}
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
                {isActive && !cue.wordStartOffsetsMs?.length ? (
                  <em className="sentence-level-badge" title="该句无词级时间，按整句高亮">
                    句级
                  </em>
                ) : null}
                {cue.score >= 0 ? <em className="score-chip">{cue.score}</em> : null}
              </span>
              <span
                className={`subtitle-en ${isActive && cue.wordStartOffsetsMs?.length ? 'karaoke-line' : ''}`}
              >
                {isActive && cue.wordStartOffsetsMs?.length ? (
                  <KaraokeWords
                    cue={cue}
                    currentIndex={activeWordIndex(
                      cue.wordStartOffsetsMs,
                      currentTime + mediaStartTime - cue.startTime
                    )}
                  />
                ) : (
                  <HighlightedText text={displayText(cue.en)} terms={terms} />
                )}
              </span>
              {showZh && cue.zh ? <span className="subtitle-zh">{displayText(cue.zh)}</span> : null}
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

const KaraokeWords = memo(function KaraokeWords({
  cue,
  currentIndex,
}: {
  cue: SubtitleCue;
  currentIndex: number;
}) {
  const words = useMemo(() => spokenWords(cue.en), [cue.en]);
  const offsets = cue.wordStartOffsetsMs ?? [];
  const states = useMemo(
    () =>
      offsets.map((_offset, index) =>
        index < currentIndex ? 'past' : index === currentIndex ? 'current' : 'future'
      ),
    [offsets, currentIndex]
  );
  const boundaries = useMemo(() => speakerWordBoundaries(cue.en), [cue.en]);

  return (
    <span
      className="karaoke-words"
      data-current-word={currentIndex}
      aria-label={currentIndex >= 0 ? `正在读第 ${currentIndex + 1} 个词` : undefined}
    >
      {words.map((word, index) => (
        <span className="karaoke-word-group" key={`${index}-${word}`}>
          {boundaries.includes(index) ? (
            <span className="speaker-boundary" title="说话人切换" aria-hidden="true" />
          ) : null}
          <span
            className={`karaoke-word ${states[index]}`}
            data-word-index={index}
            data-word-state={states[index]}
          >
            {word}
          </span>{' '}
        </span>
      ))}
    </span>
  );
});
