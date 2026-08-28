import type { Feedback, Keyword } from '../types';

export function makeClientDemoFeedback({
  targetSentence,
  keywords,
  delivery = 'local-only',
}: {
  targetSentence: string;
  keywords: Keyword[];
  delivery?: 'local-only' | 'remote-failed';
}): Feedback {
  const focusTerms = keywords
    .map((keyword) => keyword.term)
    .slice(0, 3)
    .join('、');

  return {
    mode: 'demo',
    provider: 'client-demo',
    transcript:
      delivery === 'local-only'
        ? '本次录音只保留在当前浏览器供你回放；AI 反馈离线，录音没有上传，也没有经过转写或语音分析。'
        : '已尝试发送录音，但反馈服务没有返回可用结果；无法确认服务端是否已经接收或处理。本页改用离线练习建议。',
    keywordHits: [],
    closeness: '先听自己的回放：如果关键词清楚，就马上再录一遍；如果卡住，回到原句慢速跟读。',
    audioNotes: [
      delivery === 'local-only'
        ? '当前是离线建议，不能判断语音、语调、语速或重音。'
        : '下面的建议没有依据本次录音评分，不代表转写或发音分析结果。',
    ],
    suggestions: [
      '把句子拆成两段说，再连起来。',
      focusTerms ? `下一遍优先说清楚：${focusTerms}。` : '下一遍优先说清楚高亮的攀岩关键词。',
    ],
    naturalVersion: targetSentence,
  };
}
