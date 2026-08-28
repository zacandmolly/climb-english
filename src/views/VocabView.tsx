import { BookOpen, Sparkles, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { VocabEntry, VocabMastery } from '../types';

const MASTERY_LABEL: Record<VocabMastery, string> = {
  0: '新词',
  1: '模糊',
  2: '已掌握',
};

const MASTERY_CLASS: Record<VocabMastery, string> = {
  0: 'mastery-new',
  1: 'mastery-learning',
  2: 'mastery-known',
};

export function VocabView({
  vocab,
  courseNameById,
  onSetMastery,
  onRemove,
}: {
  vocab: VocabEntry[];
  courseNameById: Record<string, string>;
  onSetMastery: (term: string, mastery: VocabMastery) => void;
  onRemove: (term: string) => void;
}) {
  const [filter, setFilter] = useState<'all' | VocabMastery>('all');
  const [reviewActive, setReviewActive] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const filtered = useMemo(() => {
    if (filter === 'all') return vocab;
    return vocab.filter((entry) => entry.mastery === filter);
  }, [vocab, filter]);

  const reviewQueue = useMemo(
    () => vocab.filter((entry) => entry.mastery < 2),
    [vocab],
  );
  const reviewWord = reviewQueue[reviewIndex % Math.max(1, reviewQueue.length)];

  const startReview = () => {
    if (!reviewQueue.length) return;
    setReviewIndex(0);
    setRevealed(false);
    setReviewActive(true);
  };

  const markReview = (mastery: VocabMastery) => {
    if (!reviewWord) return;
    onSetMastery(reviewWord.term, mastery);
    setRevealed(false);
    if (reviewIndex + 1 >= reviewQueue.length) {
      setReviewActive(false);
      return;
    }
    setReviewIndex((index) => index + 1);
  };

  if (!vocab.length) {
    return (
      <section className="main-pane vocab-pane" aria-label="生词本">
        <div className="library-head">
          <div>
            <p className="eyebrow">生词本</p>
            <h2>还没有收录单词</h2>
          </div>
        </div>
        <div className="empty-state">
          <BookOpen size={28} aria-hidden="true" />
          <p>完成每日练习会自动把这课的攀岩关键词收进生词本。</p>
          <p>练习时也可以点关键词卡片上的星标，先收想练的词。</p>
        </div>
      </section>
    );
  }

  if (reviewActive && reviewWord) {
    return (
      <section className="main-pane vocab-pane" aria-label="生词复习">
        <div className="library-head">
          <div>
            <p className="eyebrow">
              复习 {reviewIndex + 1} / {reviewQueue.length}
            </p>
            <h2>还记得这个词吗？</h2>
          </div>
          <button
            className="control-button small"
            type="button"
            onClick={() => setReviewActive(false)}
          >
            退出复习
          </button>
        </div>
        <div
          className="review-card"
          role="button"
          tabIndex={0}
          onClick={() => setRevealed(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') setRevealed(true);
          }}
        >
          <p className="review-term">{reviewWord.term}</p>
          {revealed ? (
            <div className="review-detail">
              <p className="review-zh">{reviewWord.zh}</p>
              <p className="review-example">{reviewWord.example}</p>
              <p className="review-source">
                来自 {reviewWord.courseId ? courseNameById[reviewWord.courseId] ?? '' : ''}
                {reviewWord.courseId ? ' · ' : ''}Day {reviewWord.day}
              </p>
            </div>
          ) : (
            <p className="review-hint">点卡片看释义</p>
          )}
        </div>
        {revealed ? (
          <div className="review-actions">
            <button className="control-button" type="button" onClick={() => markReview(0)}>
              忘了
            </button>
            <button className="control-button" type="button" onClick={() => markReview(1)}>
              模糊
            </button>
            <button className="control-button primary" type="button" onClick={() => markReview(2)}>
              记得
            </button>
          </div>
        ) : null}
      </section>
    );
  }

  return (
    <section className="main-pane vocab-pane" aria-label="生词本">
      <div className="library-head">
        <div>
          <p className="eyebrow">生词本</p>
          <h2>{vocab.length} 个攀岩词</h2>
        </div>
        <button
          className="control-button small"
          type="button"
          disabled={!reviewQueue.length}
          onClick={startReview}
        >
          <Sparkles size={14} aria-hidden="true" />
          复习 {reviewQueue.length} 个待巩固
        </button>
      </div>

      <div className="vocab-filters">
        {(['all', 0, 1, 2] as const).map((value) => {
          const count =
            value === 'all' ? vocab.length : vocab.filter((entry) => entry.mastery === value).length;
          const label = value === 'all' ? '全部' : MASTERY_LABEL[value];
          return (
            <button
              className={`strip-chip ${filter === value ? 'active' : ''}`}
              key={String(value)}
              type="button"
              onClick={() => setFilter(value)}
            >
              {label} {count}
            </button>
          );
        })}
      </div>

      <div className="vocab-list">
        {filtered.map((entry) => (
          <article className="vocab-card" key={entry.term}>
            <div className="vocab-card-head">
              <div>
                <h3>{entry.term}</h3>
                <p className="keyword-zh">{entry.zh}</p>
              </div>
              <span className={`mastery-badge ${MASTERY_CLASS[entry.mastery]}`}>
                {MASTERY_LABEL[entry.mastery]}
              </span>
            </div>
            <p className="vocab-example">{entry.example}</p>
            <div className="vocab-actions">
              <button
                className={`mini-button ${entry.mastery === 0 ? 'active' : ''}`}
                type="button"
                onClick={() => onSetMastery(entry.term, 0)}
              >
                忘了
              </button>
              <button
                className={`mini-button ${entry.mastery === 1 ? 'active' : ''}`}
                type="button"
                onClick={() => onSetMastery(entry.term, 1)}
              >
                模糊
              </button>
              <button
                className={`mini-button ${entry.mastery === 2 ? 'active' : ''}`}
                type="button"
                onClick={() => onSetMastery(entry.term, 2)}
              >
                记得
              </button>
              <button
                className="mini-button danger"
                type="button"
                onClick={() => onRemove(entry.term)}
                title="移出生词本"
              >
                <Trash2 size={13} aria-hidden="true" />
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
