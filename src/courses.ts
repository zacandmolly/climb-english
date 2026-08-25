import type { Course, DailySession, Lesson } from './types';

const COURSE_META: Record<string, { name: string }> = {
  'ifsc-world-cup-bern-2025': { name: 'Bern 2025 · 女子抱石决赛' },
  'ifsc-world-cup-innsbruck-2026': { name: 'Innsbruck 2026 · 男子抱石决赛' },
};

const COURSE_PLANS: Record<
  string,
  { titles: string[]; goals: string[]; steps: string[][]; segmentDays: number[] }
> = {
  'ifsc-world-cup-bern-2025': {
    titles: ['slab 初听', '脚点和低成功率', '选手背景和尝试', '身体位置和动作序列', '压力下的最后动作', '整段复述'],
    goals: [
      '先把原声和练习稿对齐，听出 slab、heel、match、appeal。',
      '重点听脚点、低成功率动作和解说里的判断词。',
      '听懂选手背景、尝试次数和解说员如何预测结果。',
      '抓身体位置、脚点调整和动作序列。',
      '听懂最后动作、时间压力和成败判断。',
      '完整听一段 5 分钟官方解说，然后用自己的话复述。',
    ],
    steps: [
      ['盲听 1 遍，只听出关键词', '看英文字幕跟播 2 遍', '录 1 句最短 shadowing'],
      ['慢速听 2 个练习块', '读中文重点提示', '用关键词说 1 个自己的句子'],
      ['逐块听 2 遍', '隐藏中文再听 1 遍', '录音回答右侧问题'],
      ['看视频动作，不看中文', '跟读原句 2 遍', '用自己的话描述动作'],
      ['先听关键块 2 遍', '拆 because / if she 句型', '口头解释为什么成功或失败'],
      ['整段精听 1 遍', '隐藏中文再听 1 遍', '录一段 20 秒英文复述'],
    ],
    segmentDays: [5],
  },
  'ifsc-world-cup-innsbruck-2026': {
    titles: [
      '开场：欢迎来到 Innsbruck',
      '半决赛：力量与协调',
      '决赛前夜：Saut 接近完攀',
      'M2 关键 zone：Ray 顶完',
      'Max M2 失误：物理 boulder 的艰难',
      'M4 脚下功夫 + 5 连冠',
      'Anraku 赛后采访：压力与专注',
    ],
    goals: [
      '听懂主持人开场介绍、天气状况、赛季日历，以及八位决赛选手的快速预热。',
      '分辨 physical boulder 和 coordination boulder 的解说话术，听懂 rest / momentum / rock over / situational cheering 等关键表达。',
      '听懂 Saut Amagasa 决赛前一轮的临界表现、heel hook 的关键作用，以及 Sam Avezou 的 power boulder 教学。',
      '听懂 brush holds / slab climbing / thumb / send 等关键解说话术，以及 Hannes van Duysen 顶完时的关键 zone 抉择。',
      '听懂 hot rubber / crimp / jib / blind / screw holds / trust your feet / friction 等核心攀岩词汇在实战中的具体含义。',
      '听懂 Ray Kawamata 在 M4 的 foot swap / crimp / foot match，以及 Anraku 历史性 5 连冠的关键解说。',
      '听懂 Anraku 赛后采访的关键表达：honor / focused / pressure / frustrated / train / footwork，理解他 5 连冠的赛后心理。',
    ],
    steps: [
      ['盲听 1 遍记下四个运动员名字', '看英文字幕跟读介绍语', '用英语复述今天天气和条件'],
      ['盲听 1 遍分清 4 句类型', '看中英对照识别 rest / momentum / rock over', '用英语复述 1 句关键判断'],
      ['盲听 1 遍抓 1 句惊险句', '对照识别 heel hook / intended beta', '复述 Saut 接近完攀的关键原因'],
      ['盲听 1 遍识别 Ray 与 Hannes 主角切换', '对照识别 brush holds / thumb', '解释 thumb 怎么增加把点摩擦力'],
      ['盲听 1 遍识别 hot rubber / friction 关系', '对照识别 crimp / jib / blind / screw holds', '用英语解释为什么物理 boulder 需要更多休息'],
      ['先盲听 1 遍 6400-6780s 段落', '重点听 foot swap / crimp / foot match 三个动作词', '用英语复述 Anraku 5 连冠的关键句'],
      ['盲听 1 遍抓住采访节奏', '听中英对照识别 honor / focused / pressure', '用英语复述 Anraku 训练 footwork 的回答'],
    ],
    segmentDays: [5],
  },
};

function slugifyCourseId(competition: string) {
  return competition
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function buildSessionsForCourse(courseId: string, courseLessons: Lesson[]): DailySession[] {
  const plan = COURSE_PLANS[courseId];
  const segmentDays = new Set(plan ? plan.segmentDays : [courseLessons.length - 1]);
  const defaultSteps = ['听 1 遍', '跟读 1 遍', '用自己的话复述'];

  return courseLessons.map((lesson, index) => ({
    id: `${courseId}-day-${index + 1}`,
    day: index + 1,
    title: plan?.titles[index] ?? lesson.title,
    lessonIndex: index,
    mode: segmentDays.has(index) ? 'segment' : 'sentence',
    sentenceIndexes: lesson.sentences.map((_, sentenceIndex) => sentenceIndex),
    goal: plan?.goals[index] ?? lesson.segmentGoal,
    steps: plan?.steps[index] ?? defaultSteps,
  }));
}

export function buildCourses(allLessons: Lesson[]): Course[] {
  const groups: Lesson[][] = [];

  for (const lesson of allLessons) {
    const lastGroup = groups[groups.length - 1];
    if (lastGroup && lastGroup[0].competition === lesson.competition) {
      lastGroup.push(lesson);
    } else {
      groups.push([lesson]);
    }
  }

  return groups.map((group) => {
    const id = slugifyCourseId(group[0].competition);
    return {
      id,
      name: COURSE_META[id]?.name ?? group[0].competition,
      competition: group[0].competition,
      discipline: group[0].discipline,
      lessons: group,
      sessions: buildSessionsForCourse(id, group),
    };
  });
}
