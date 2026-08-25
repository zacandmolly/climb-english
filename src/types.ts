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

export type SubtitleCue = {
  id: string;
  startTime: number;
  endTime: number;
  en: string;
  zh: string;
  note?: string;
  score: number;
  study: boolean;
  highlight?: boolean;
  needsTranslation?: boolean;
  keywords: string[];
};

export type VideoCategory = 'world-cup' | 'technique' | 'interview' | 'training' | 'other';

export type VideoLevel = 'beginner' | 'intermediate' | 'advanced';

export type VideoEntry = {
  id: string;
  title: string;
  sourceUrl: string;
  sourceLabel: string;
  youtubeId: string;
  channel: string;
  category: VideoCategory;
  categoryLabel?: string;
  level: VideoLevel;
  mediaUrl: string;
  mediaStartTime: number;
  durationSeconds: number;
  captionKind: 'auto' | 'manual';
  importedAt: string;
  cueCount: number;
  studyCueCount: number;
  needsTranslationCount?: number;
  cues: SubtitleCue[];
};

export type VideoSummary = Omit<VideoEntry, 'cues'>;

export type Feedback = {
  mode: 'ai' | 'demo';
  provider?: 'openai' | 'deepseek' | 'client-demo' | 'server-demo';
  transcript: string;
  keywordHits: string[];
  closeness: string;
  audioNotes?: string[];
  suggestions: string[];
  naturalVersion: string;
};

export type PracticeMode = 'sentence' | 'segment';
export type MainView = 'today' | 'library' | 'vocab' | 'me';
export type VocabMastery = 0 | 1 | 2;

export type DailySession = {
  id: string;
  day: number;
  title: string;
  lessonIndex: number;
  mode: PracticeMode;
  sentenceIndexes: number[];
  goal: string;
  steps: string[];
};

export type VocabEntry = {
  term: string;
  zh: string;
  example: string;
  lessonId: string;
  day: number;
  courseId?: string;
  addedAt: string;
  mastery: VocabMastery;
};

export type LearningProgress = {
  completedSessionIds: string[];
  activeSessionId: string | null;
  activeCourseId?: string | null;
  updatedAt: string | null;
  vocab: VocabEntry[];
  practiceDates: string[];
};

export type Course = {
  id: string;
  name: string;
  competition: string;
  discipline: string;
  lessons: Lesson[];
  sessions: DailySession[];
};
