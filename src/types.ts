export type Keyword = {
  term: string;
  zh: string;
  example: string;
};

// ============================================================================
// R12 双数据模型收敛——统一时间轴基类型 Cue（单一事实源）
// ============================================================================
// 两套模型（课程线 Lesson/PracticeSentence vs 视频线 VideoEntry/SubtitleCue）
// 的历史对齐漂移问题，根因是「两套时间轴语义 + 各写一份重复的文本/时间字段」。
// R12 方向定为：课程线并入视频线，以 Cue 为唯一时间轴基础单元。
//   - SubtitleCue：媒体直读版，字面 extends Cue（id/startTime/endTime/en/zh/note）。
//   - PracticeSentence：学习者标注版，复用 Cue 的时间轴字段（id/startTime/endTime），
//     文本字段沿用 transcript/zhTranslation 命名（与 en/zh 语义等价）。
//
// 时间轴语义（R12 Step 2 统一）：播放层绝对时间 = cue.startTime（已含 mediaStartTime
// 偏移）的单一语义；mediaStartTime 仅保留在 player 层做 toVideoTime 换算。
// NOTE: 本步骤（Step 1）只做类型层，不改任何字段取值语义、不改行为。
// ============================================================================

/**
 * R12 统一时间轴基类型：一句字幕/一句话在「媒体绝对时间轴」上的唯一表示。
 * - id: 全局唯一句 id（subtitle cue 为 c001/c002…，课程句为 s01/s02…）。
 * - startTime/endTime: 媒体绝对时间轴上的起止（已含 mediaStartTime 偏移）。
 * - en/zh: 英文原文与中文翻译。
 * - note: 可选中文字形/术语备注。
 */
export type Cue = {
  id: string;
  startTime: number;
  endTime: number;
  en: string;
  zh: string;
  note?: string;
};

// 视频线字幕句：媒体直读版，字面继承 Cue 的全部时间轴 + 文本字段。
export type SubtitleCue = Cue & {
  score: number;
  study: boolean;
  highlight?: boolean;
  needsTranslation?: boolean;
  keywords: string[];
};

// 课程线练习句：学习者标注版。复用 Cue 的时间轴字段（id/startTime/endTime），
// 文本字段保持 transcript/zhTranslation 命名（与 en/zh 语义等价），并在其之上
// 叠加学习者标注（keywords/patterns/speakingPrompt 作为附加字段）。
export type PracticeSentence = {
  id: Cue['id'];
  label: string;
  startTime: Cue['startTime'];
  endTime: Cue['endTime'];
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

export type VideoCategory = 'world-cup' | 'technique' | 'interview' | 'training' | 'other';

type VideoLevel = 'beginner' | 'intermediate' | 'advanced';

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
