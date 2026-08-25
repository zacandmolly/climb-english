// R12 统一时间轴语义（Step 2 工具层）。
//
// 历史问题：课程线（Lesson/PracticeSentence）与视频线（VideoEntry/SubtitleCue）
// 维护两套时间轴语义——前者「sentence.startTime + mediaStartTime 偏移」双值，后者
// cue 直接带绝对时间；二者在"哪一句在播报"的判定上各写一份、行为微有出入。这是
// RETROSPECTIVE 里对齐漂移的记录根因。
//
// R12 统一方向（课程线并入视频线）：播放层绝对时间 = cue.startTime（已含
// mediaStartTime 偏移）的**单一语义**；mediaStartTime 仅保留在 player 层做
// toVideoTime 换算。本模块所有函数都只操作「媒体绝对时间轴」，不关心偏移换算。
//
// 本步骤（Step 2）为纯工具层：新增统一原语 cueAtTime / wordsInRange，并把
// src/lib/lesson.ts 的 sentenceIndexAtMediaTime 与 src/hooks/useCuePlayer.ts
// 的 cue 查找迁到共用语义。行为等价（仅收敛 gap 处的高亮语义为"保持上一句"，
// 与课程线原注释一致）。

/** 计时切片的通用结构（Cue / PracticeSentence / SubtitleCue 都是它的子集）。 */
export type TimeSlice = {
  startTime: number;
  endTime: number;
};

/**
 * 返回媒体绝对时间 t 处「正在播报」的 cue 下标（统一实现）。
 *
 * 语义（与课程线 sentenceIndexAtMediaTime 原注释一致）：
 *  - 取 startTime ≤ t 的最后一个 cue；在两句之间的自然停顿里保持上一句高亮，
 *    避免卡拉 OK 高亮在停顿处跳到下一句。
 *  - t 早于首句 startTime 时钳制到 0（pre-roll 安全）。
 *  - t 越过末句时钳制到最后一个下标。
 *
 * 课程线与视频线的卡拉 OK 跟随都走这一个实现，从而把两套时间轴判定收敛为单一事实源。
 */
export function cueAtTime(cues: readonly TimeSlice[], t: number): number {
  if (cues.length === 0) return 0;
  if (t < cues[0].startTime) return 0;

  let index = 0;
  for (let i = 0; i < cues.length; i += 1) {
    if (t >= cues[i].startTime) {
      index = i;
    } else {
      break;
    }
  }
  return index;
}

/**
 * 返回媒体绝对时间轴在 [start, end] 半开区间内（与该区间有任何交叠）的所有 cue，
 * 保持其在 cues 中的原有出现顺序。用于把某个练习段/时间窗口内的字幕切出来。
 */
export function wordsInRange<T extends TimeSlice>(
  cues: readonly T[],
  start: number,
  end: number,
): T[] {
  return cues.filter((cue) => cue.startTime < end && cue.endTime > start);
}
