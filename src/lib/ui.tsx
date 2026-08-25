import { useMemo } from 'react';

// 高亮文本：把关键词命中处包成 <mark>。带停用词过滤 + 多词命中判定。
// 这是全应用唯一实现（BilingualStudio 与课程流程共用）。
export function HighlightedText({ text, terms }: { text: string; terms: string[] }) {
  const regex = useMemo(() => {
    const stopwords = new Set(['the', 'and', 'with', 'then', 'that', 'this', 'into']);
    const escaped = terms
      .flatMap((term) => term.split(/\s+/))
      .filter((term) => term.length > 2 && !stopwords.has(term.toLowerCase()))
      .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));

    return escaped.length > 0 ? new RegExp(`\\b(${escaped.join('|')})\\b`, 'gi') : null;
  }, [terms]);

  if (!regex) return <span>{text}</span>;

  const parts = text.split(regex);

  return (
    <>
      {parts.map((part, index) =>
        terms.some((term) => term.toLowerCase().includes(part.toLowerCase())) &&
        part.length > 2 ? (
          <mark key={`${part}-${index}`}>{part}</mark>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        ),
      )}
    </>
  );
}

export function resolveStaticAssetUrl(assetUrl: string) {
  if (/^(https?:|data:|blob:)/.test(assetUrl)) return assetUrl;

  const base = import.meta.env.BASE_URL || '/';
  return `${base.replace(/\/?$/, '/')}${assetUrl.replace(/^\//, '')}`;
}

export function formatTime(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function formatDuration(totalSeconds: number) {
  const safeSeconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
