import type { Feedback, Keyword } from '../types';

export const FEEDBACK_API_BASE = normalizeApiBaseUrl(import.meta.env.VITE_FEEDBACK_API_BASE);

export function isStaticFeedbackHost() {
  if (typeof window === 'undefined') return false;
  return window.location.hostname.endsWith('github.io');
}

function normalizeApiBaseUrl(value: unknown) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

export function makeClientDemoFeedback({
  targetSentence,
  keywords,
}: {
  targetSentence: string;
  keywords: Keyword[];
}): Feedback {
  return {
    mode: 'demo',
    provider: 'client-demo',
    transcript: '公开版已收到录音。当前 GitHub Pages 版本只提供录音回放和离线练习建议，AI 转写服务后续接入。',
    keywordHits: keywords.map((keyword) => keyword.term).slice(0, 4),
    closeness: '先听自己的回放：如果关键词清楚，就马上再录一遍；如果卡住，回到原句慢速跟读。',
    audioNotes: ['当前是离线建议，不能判断语音、语调、语速或重音。'],
    suggestions: ['把句子拆成两段说，再连起来。', '优先说清楚高亮的攀岩关键词。'],
    naturalVersion: targetSentence,
  };
}
