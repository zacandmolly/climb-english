import { BookOpen, Star } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defaultRangeExtractor, type Range, useVirtualizer } from '@tanstack/react-virtual';
import { activeWordIndex, displayText, speakerWordBoundaries, spokenWords } from '../lib/words';
import { subtitleVirtualIndexForCue, subtitleVirtualRows } from '../lib/subtitleVirtualization';
import type { SubtitleCue } from '../types';
import { formatTime, HighlightedText } from '../lib/ui';

export function SubtitlePanel({
  cues,
  activeCueIndex,
  currentTime,
  mediaStartTime,
  showZh,
  studyOnly,
  isActive,
  onSelectCue,
}: {
  cues: SubtitleCue[];
  activeCueIndex: number;
  currentTime: number;
  mediaStartTime: number;
  showZh: boolean;
  studyOnly: boolean;
  isActive: boolean;
  onSelectCue: (index: number) => void;
}) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [orientationRevision, setOrientationRevision] = useState(0);
  const rowsActiveCueIndex = studyOnly ? activeCueIndex : -1;
  const rows = useMemo(
    () => subtitleVirtualRows(cues, rowsActiveCueIndex, studyOnly),
    [cues, rowsActiveCueIndex, studyOnly]
  );
  const terms = useMemo(() => Array.from(new Set(cues.flatMap((cue) => cue.keywords))), [cues]);
  const getItemKey = useCallback((index: number) => rows[index]?.cue.id ?? index, [rows]);
  const activeVirtualRowIndex = useMemo(
    () => subtitleVirtualIndexForCue(rows, activeCueIndex),
    [activeCueIndex, rows]
  );
  const rangeExtractor = useCallback(
    (range: Range) => {
      const indexes = defaultRangeExtractor(range);
      if (!studyOnly || activeVirtualRowIndex < 0 || indexes.includes(activeVirtualRowIndex)) {
        return indexes;
      }
      // Shrinking a deeply scrolled list to study-only rows can clamp the DOM
      // scrollTop before TanStack receives a scroll event. Keep the active row
      // mounted through that transition so the pinning effect can always find
      // and place it instead of leaving a blank virtual window.
      return [...indexes, activeVirtualRowIndex].sort((left, right) => left - right);
    },
    [activeVirtualRowIndex, studyOnly]
  );

  const virtualizer = useVirtualizer({
    // A hidden mobile tab reports zero geometry. Disable the observer and any
    // pending scroll reconciliation so stale offsets cannot unmount the active
    // cue when the preserved studio becomes visible again.
    enabled: isActive,
    count: rows.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => 96,
    overscan: 6,
    getItemKey,
    rangeExtractor,
  });
  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    if (!isActive) return;

    const orientation = window.matchMedia('(orientation: landscape)');
    let firstFrame = 0;
    let secondFrame = 0;
    const repinAfterLayout = () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      firstFrame = window.requestAnimationFrame(() => {
        secondFrame = window.requestAnimationFrame(() => {
          setOrientationRevision((revision) => revision + 1);
        });
      });
    };
    repinAfterLayout();
    orientation.addEventListener('change', repinAfterLayout);
    return () => {
      orientation.removeEventListener('change', repinAfterLayout);
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [isActive]);

  useEffect(() => {
    if (!isActive || activeVirtualRowIndex < 0) return;
    // Dynamic measurement and smooth scrolling are not compatible in TanStack
    // Virtual. Pin synchronously so a changing row height cannot leave a blank
    // window or land on the wrong cue.
    virtualizer.scrollToIndex(activeVirtualRowIndex, { align: 'start', behavior: 'auto' });
    let firstFrame = 0;
    let secondFrame = 0;
    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        const list = listRef.current;
        const row = list?.querySelector<HTMLElement>(
          `[data-original-cue-index="${activeCueIndex}"]`
        );
        if (!list || !row) return;
        // `scrollToIndex` starts from estimated heights. Real Android fonts and
        // translated rows can differ enough to leave the active cue several
        // cards below the top. Once the row is measured, apply the exact delta.
        const delta = row.getBoundingClientRect().top - list.getBoundingClientRect().top - 8;
        if (Math.abs(delta) > 1) {
          list.scrollTo({ top: Math.max(0, list.scrollTop + delta), behavior: 'auto' });
        }
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
    };
  }, [
    activeCueIndex,
    activeVirtualRowIndex,
    isActive,
    orientationRevision,
    showZh,
    studyOnly,
    virtualizer,
  ]);

  return (
    <section className="subtitle-panel" aria-label="Bilingual subtitles">
      <div className="panel-heading spread">
        <span>
          <BookOpen size={18} aria-hidden="true" />
          中英字幕 · {studyOnly ? rows.length : cues.length}/{cues.length} 句
        </span>
        <span className="subtitle-legend">
          <Star size={13} aria-hidden="true" /> 高分佳句
        </span>
      </div>
      <div
        className="subtitle-list"
        role="list"
        ref={listRef}
        data-virtual-list="true"
        data-study-only={studyOnly ? 'true' : undefined}
      >
        <div
          className="subtitle-virtual-canvas"
          style={{
            flex: '0 0 auto',
            height: virtualizer.getTotalSize(),
            minHeight: virtualizer.getTotalSize(),
            position: 'relative',
            width: '100%',
          }}
        >
          {virtualItems.map((virtualRow) => {
            const row = rows[virtualRow.index];
            const { cue, originalIndex } = row;
            const isActive = originalIndex === activeCueIndex;
            return (
              <div
                className="subtitle-virtual-row"
                role="listitem"
                data-index={virtualRow.index}
                data-virtual-index={virtualRow.index}
                data-original-cue-index={originalIndex}
                data-cue-active={isActive ? 'true' : undefined}
                key={virtualRow.key}
                ref={virtualizer.measureElement}
                style={{
                  left: 0,
                  position: 'absolute',
                  top: 0,
                  transform: `translateY(${virtualRow.start}px)`,
                  width: '100%',
                }}
              >
                <SubtitleVirtualCard
                  cue={cue}
                  originalIndex={originalIndex}
                  isActive={isActive}
                  currentWordIndex={
                    isActive && cue.wordStartOffsetsMs?.length
                      ? activeWordIndex(
                          cue.wordStartOffsetsMs,
                          currentTime + mediaStartTime - cue.startTime
                        )
                      : -1
                  }
                  showZh={showZh}
                  terms={terms}
                  onSelectCue={onSelectCue}
                />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const SubtitleVirtualCard = memo(function SubtitleVirtualCard({
  cue,
  originalIndex,
  isActive,
  currentWordIndex,
  showZh,
  terms,
  onSelectCue,
}: {
  cue: SubtitleCue;
  originalIndex: number;
  isActive: boolean;
  currentWordIndex: number;
  showZh: boolean;
  terms: string[];
  onSelectCue: (index: number) => void;
}) {
  return (
    <button
      className={`subtitle-card ${isActive ? 'active' : ''} ${cue.study ? '' : 'filler'}`}
      data-cue-index={originalIndex}
      type="button"
      onClick={() => onSelectCue(originalIndex)}
      aria-current={isActive ? 'true' : undefined}
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
          <KaraokeWords cue={cue} currentIndex={currentWordIndex} />
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
});

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
