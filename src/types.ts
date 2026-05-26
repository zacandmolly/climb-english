export type Keyword = {
  term: string;
  zh: string;
  example: string;
};

export type PracticeSentence = {
  id: string;
  label: string;
  startTime: number;
  endTime: number;
  transcript: string;
  zhTranslation: string;
  zhExplanation: string;
  keywords: Keyword[];
  sentencePatterns: string[];
  speakingPrompt: string;
};

export type Lesson = {
  id: string;
  title: string;
  sourceUrl: string;
  sourceLabel: string;
  mediaUrl: string;
  mediaStartTime: number;
  videoId: string;
  competition: string;
  discipline: string;
  athlete: string;
  startTime: number;
  endTime: number;
  segmentGoal: string;
  captionStatus: string;
  sentences: PracticeSentence[];
};

export type Feedback = {
  mode: 'ai' | 'demo';
  provider?: 'openai' | 'deepseek' | 'client-demo' | 'server-demo';
  transcript: string;
  keywordHits: string[];
  closeness: string;
  suggestions: string[];
  naturalVersion: string;
};
