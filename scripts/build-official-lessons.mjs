import fs from 'node:fs';
import path from 'node:path';
import { reviewedTranslations } from './reviewed-translations.mjs';

const SOURCE_URL = 'https://www.youtube.com/watch?v=CPhZ18zmrBs';
const SOURCE_LABEL = "Women's Boulder final | Bern 2025";
const VIDEO_ID = 'CPhZ18zmrBs';
const MEDIA_URL = '/media/bern-2025-wb-10m31-40m32-web.mp4';
const MEDIA_START = 631;
const LESSON_START = 632;
const SESSION_SECONDS = 300;
const SESSION_COUNT = 6;
const BLOCK_SECONDS = 25;
const PREROLL_SECONDS = 1;

const vttPath = process.argv[2] ?? '/tmp/climb-captions/CPhZ18zmrBs.en.vtt';
// Generated Bern lessons only. Hand-written Innsbruck lives in
// src/data/lessons.manual.ts and must never be touched by this script — the
// data-protect CI job guards that file against accidental rewrites.
const outputPath = path.join(process.cwd(), 'src/data/lessons.generated.ts');

const manualSeed = [
  {
    id: 's01',
    label: 'Top of the slab',
    startTime: 632.44,
    endTime: 636,
    transcript:
      'The top of the slab. It was blocked. Most athletes did what Zelia did there, peeled off.',
    zhTranslation:
      '这是板壁线路的顶部。那里被挡住了。大多数运动员都像 Zelia 那样，在那里掉了下来。',
    zhExplanation: '这句是在回看 slab 顶部。blocked 表示被挡住/卡住，peeled off 是从墙上掉下来。',
    keywords: [
      {
        term: 'slab',
        zh: '偏平衡的板壁',
        example: 'The top of the slab was hard to read.',
      },
      {
        term: 'peeled off',
        zh: '从墙上掉下来',
        example: 'She peeled off near the top.',
      },
    ],
    sentencePatterns: ['Most athletes did what...', 'peeled off near/from...'],
    speakingPrompt: 'Say what happened at the top of the slab.',
  },
  {
    id: 's02',
    label: 'Trust the heel',
    startTime: 636,
    endTime: 641,
    transcript:
      'Zelia was strong earlier on. She topped this one as well, trusting that right heel and the double heel.',
    zhTranslation:
      'Zelia 前面表现很强。她也完攀了这个问题，靠的是相信自己的右脚跟，以及那个双脚跟位置。',
    zhExplanation:
      '这句重点是 topped this one 和 trusting that right heel。heel 是脚跟挂点/脚跟技术。',
    keywords: [
      {
        term: 'topped',
        zh: '完攀了',
        example: 'She topped this boulder.',
      },
      {
        term: 'right heel',
        zh: '右脚跟',
        example: 'She trusted that right heel.',
      },
      {
        term: 'double heel',
        zh: '双脚跟/双 heel',
        example: 'The double heel position looked powerful.',
      },
    ],
    sentencePatterns: ['She topped this one as well', 'trusting that + body part'],
    speakingPrompt: 'Explain why the heel position mattered.',
  },
  {
    id: 's03',
    label: 'Flexibility required',
    startTime: 641,
    endTime: 646,
    transcript: 'That flexibility required there. Yeah.',
    zhTranslation: '那里需要的柔韧性很强。是的。',
    zhExplanation: '这句很短，适合练听懂口语省略。完整意思是：那个位置需要很强的柔韧性。',
    keywords: [
      {
        term: 'flexibility',
        zh: '柔韧性',
        example: 'That move requires flexibility.',
      },
      {
        term: 'required',
        zh: '需要的',
        example: 'The flexibility required there is serious.',
      },
    ],
    sentencePatterns: ['That + noun + required there', 'It requires + noun'],
    speakingPrompt: 'Turn the short commentary into a full sentence.',
  },
  {
    id: 's04',
    label: 'Making the match',
    startTime: 646,
    endTime: 650,
    transcript:
      'Scotty down making that match. She had to fight a little bit for it. Bit of a wobble.',
    zhTranslation: 'Scotty 在那里完成了并点。她得稍微拼一下才做成，身体有一点晃。',
    zhExplanation: 'match 是双手并点，fight for it 是很吃力地完成，wobble 是晃了一下。',
    keywords: [
      {
        term: 'match',
        zh: '双手并点',
        example: 'She made the match.',
      },
      {
        term: 'fight for it',
        zh: '费力完成',
        example: 'She had to fight for that move.',
      },
      {
        term: 'wobble',
        zh: '晃动/不稳',
        example: 'There was a bit of a wobble.',
      },
    ],
    sentencePatterns: ['making that + move', 'had to fight for it', 'a bit of a + noun'],
    speakingPrompt: 'Describe the match and the wobble in your own words.',
  },
  {
    id: 's05',
    label: 'Appeal confirmed',
    startTime: 650,
    endTime: 658,
    transcript:
      'She did get an appeal on that one, but it was given. She slipped after she had matched, and it was confirmed already done.',
    zhTranslation:
      '她那一下确实提出了申诉，但裁判给了认可。她是在已经完成并点之后才滑掉的，所以被确认已经完成。',
    zhExplanation:
      'appeal 是申诉，given/confirmed 表示裁判认可。核心逻辑：她是在 match 之后滑掉，所以成绩被确认。',
    keywords: [
      {
        term: 'appeal',
        zh: '申诉',
        example: 'She got an appeal on that one.',
      },
      {
        term: 'match',
        zh: '双手并点',
        example: 'She slipped after she had matched.',
      },
      {
        term: 'confirmed',
        zh: '确认有效',
        example: 'It was confirmed already done.',
      },
    ],
    sentencePatterns: [
      'She did get an appeal',
      'after she had + past participle',
      'it was confirmed',
    ],
    speakingPrompt: 'Explain why the appeal was accepted.',
  },
];

const keywordBank = [
  ['slab', '偏平衡的板壁', 'The slab rewards balance and patience.'],
  ['heel', '脚跟技术/脚跟挂点', 'She keeps trusting the heel.'],
  ['match', '双手并点', 'She needs to make the match.'],
  ['wobble', '晃动/不稳', 'There was a bit of a wobble.'],
  ['appeal', '申诉', 'The team can appeal the decision.'],
  ['confirmed', '确认有效', 'The top was confirmed.'],
  ['undercling', '反抠点', 'She moves into the undercling.'],
  ['hold', '岩点/手点', 'That hold is difficult to use.'],
  ['foot', '脚点/踩点', 'The right foot is important here.'],
  ['toe', '脚尖', 'She needs to point her toe.'],
  ['boulder', '抱石线路', 'This boulder is low percentage.'],
  ['attempt', '尝试/次数', 'She has time for another attempt.'],
  ['flash', '一把完攀', 'A flash changes the scoreboard.'],
  ['top', '完攀点/顶点', 'She is close to the top.'],
  ['zone', 'Zone 点', 'The zone can still matter.'],
  ['move', '动作', 'That move requires commitment.'],
  ['sequence', '动作序列', 'This final sequence is delicate.'],
  ['scoreboard', '记分牌', 'Watch the scoreboard on the left.'],
  ['clock', '计时钟', 'The clock is still running.'],
  ['crimp', '小边/扣点', 'She holds the crimp carefully.'],
  ['volume', '大体积岩点', 'The volume changes the body position.'],
  ['mantle', '撑起/翻上去', 'She has to mantle over the volume.'],
  ['flexibility', '柔韧性', 'That move requires flexibility.'],
  ['commit', '果断投入动作', 'She has to commit to the move.'],
  ['reach', '伸手够点', 'She reaches over to the next hold.'],
  ['slipped', '滑掉', 'She slipped after the match.'],
  ['fall', '掉落', 'That was the first fall.'],
  ['cruising', '做得很顺', 'She is cruising through the lower section.'],
  ['tenuous', '很不稳/很微妙', 'It is such a tenuous move.'],
  ['low percentage', '成功率低', 'This is a low percentage boulder.'],
];

function parseTime(value) {
  const [hours, minutes, seconds] = value.split(':');
  return Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds);
}

function cleanText(value) {
  return value
    .replace(/<\/?c>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeWord(value) {
  return value
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/^['"“”‘’.,!?;:()[\]-]+|['"“”‘’.,!?;:()[\]-]+$/g, '');
}

function recentPrefixOverlap(recentWords, prefixWords) {
  const recent = recentWords.map((word) => normalizeWord(word.raw)).filter(Boolean);
  const prefix = prefixWords.map((word) => normalizeWord(word)).filter(Boolean);
  const maxLength = Math.min(recent.length, prefix.length);

  for (let length = maxLength; length > 0; length -= 1) {
    const recentSuffix = recent.slice(-length).join(' ');
    const prefixStart = prefix.slice(0, length).join(' ');
    if (recentSuffix === prefixStart) return length;
  }

  return 0;
}

function readTimedWords(vtt) {
  const words = [];
  const seen = new Set();

  for (const block of vtt.split(/\n\s*\n/)) {
    const lines = block.split(/\n/).filter(Boolean);
    const timeLineIndex = lines.findIndex((line) => line.includes('-->'));
    if (timeLineIndex < 0) continue;

    const [startValue] = lines[timeLineIndex]
      .split('-->')
      .map((part) => part.trim().split(/\s+/)[0]);
    const cueStart = parseTime(startValue);

    for (const rawLine of lines.slice(timeLineIndex + 1)) {
      if (!rawLine.includes('<00:')) continue;

      const parts = rawLine
        .replace(/<\/?c>/g, '')
        .split(/(<\d\d:\d\d:\d\d\.\d+>)/g)
        .filter(Boolean);

      let time = cueStart;
      let sawInlineTimestamp = false;
      for (const part of parts) {
        const timestamp = part.match(/^<(\d\d:\d\d:\d\d\.\d+)>$/);
        if (timestamp) {
          time = parseTime(timestamp[1]);
          sawInlineTimestamp = true;
          continue;
        }

        const text = cleanText(part);
        if (!text || /^\[.*\]$/.test(text)) continue;

        const rawWords = text.split(/\s+/);
        const skipCount = sawInlineTimestamp ? 0 : recentPrefixOverlap(words.slice(-80), rawWords);
        for (const word of rawWords.slice(skipCount)) {
          const normalized = normalizeWord(word);
          if (!normalized) continue;

          const key = `${time.toFixed(2)}|${normalized}`;
          if (seen.has(key)) continue;
          seen.add(key);
          words.push({ time, word: normalized, raw: word });
        }
      }
    }
  }

  return words.sort((first, second) => first.time - second.time);
}

function wordsToText(words) {
  return words
    .map((word) => (typeof word === 'string' ? word : word.raw))
    .join(' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/\bi\b/g, 'I')
    .replace(/\s+/g, ' ')
    .trim();
}

function blockTranscript(timedWords, start, end) {
  const earliestWordTime = Math.max(MEDIA_START, start - PREROLL_SECONDS);
  const tokens = timedWords.filter((word) => word.time >= earliestWordTime && word.time < end);
  if (tokens.length < 4) return null;

  return {
    startTime: Math.max(start, tokens[0].time),
    endTime: Math.min(end, tokens[tokens.length - 1].time + 1),
    transcript: wordsToText(tokens),
  };
}

function keywordsFor(text) {
  const lower = text.toLowerCase();
  const hits = keywordBank
    .filter(([term]) => lower.includes(term))
    .slice(0, 4)
    .map(([term, zh, example]) => ({ term, zh, example }));

  if (hits.length > 0) return hits;

  return [
    {
      term: 'commentary',
      zh: '比赛解说',
      example: 'Listen for the main action in the commentary.',
    },
    {
      term: 'attempt',
      zh: '尝试',
      example: 'Describe what happened in this attempt.',
    },
  ];
}

function patternsFor(text) {
  const lower = text.toLowerCase();
  const patterns = [];
  if (lower.includes('you can see')) patterns.push('You can see...');
  if (lower.includes('she has to') || lower.includes("she's got to"))
    patterns.push('She has to...');
  if (lower.includes('this is all about')) patterns.push('This is all about...');
  if (lower.includes('if she')) patterns.push('If she..., she...');
  if (lower.includes('because')) patterns.push('..., because...');
  if (patterns.length < 2) patterns.push('She needs to...', 'The key move is...');
  return Array.from(new Set(patterns)).slice(0, 4);
}

function labelFor(text, index) {
  const keywords = keywordsFor(text)
    .filter((keyword) => keyword.term !== 'commentary' && keyword.term !== 'attempt')
    .map((keyword) => keyword.term);

  if (keywords.length > 0) return `${keywords.slice(0, 2).join(' / ')} block`;
  return `Commentary block ${String(index + 1).padStart(2, '0')}`;
}

function applyManualCorrections(sentence, sessionIndex, blockIndex) {
  if (sessionIndex === 5 && blockIndex === 0) {
    return {
      ...sentence,
      label: 'boulder / flash block',
      transcript:
        "I'm an expert on this boulder. If I had to flash it, I wouldn't be doing that. So, Aaron flashes it, and yeah, back to Annie on the last move: she kept her right foot on. The right foot is bad, so it's almost a little dangerous to keep your right foot on, because if I was trying the boulder, my foot would slip every time. Obviously, a phenomenal climber sticks the right foot. If the top hold was a lot worse, she would have stuck it.",
      zhTranslation:
        '我算是这条 boulder 的专家了。如果是我要一把完攀，我不会那样做。Aaron 一把完攀了；再回到 Annie 的最后一步，她保留了右脚。那个右脚点很差，所以继续踩着其实有点危险。要是我去做，我的脚可能每次都会滑。她能踩住，说明能力非常强；如果 top 点差很多，她也会坚持住。',
      zhExplanation:
        '这里按当前视频起播点手工裁掉了前一句滚动字幕残留。重点听 expert on this boulder, flash it, kept her right foot on, foot would slip。',
      keywords: [
        {
          term: 'boulder',
          zh: '抱石线路',
          example: 'I am an expert on this boulder.',
        },
        {
          term: 'flash',
          zh: '一把完攀',
          example: 'She flashes it.',
        },
        {
          term: 'right foot',
          zh: '右脚点/右脚',
          example: 'She kept her right foot on.',
        },
        {
          term: 'slip',
          zh: '滑掉',
          example: 'My foot would slip every time.',
        },
      ],
      sentencePatterns: [
        "I'm an expert on this...",
        "If I had to..., I wouldn't...",
        'She kept her right foot on.',
      ],
      speakingPrompt: 'Explain why keeping the right foot on was risky.',
    };
  }

  return sentence;
}

function learningTipFor(keywords) {
  const terms = keywords
    .filter((keyword) => keyword.term !== 'commentary')
    .map((keyword) => `${keyword.term}（${keyword.zh}）`)
    .slice(0, 3)
    .join('、');

  return `重点听 ${terms || '动作、尝试和结果'}。先跟读原句，再用这些词复述动作发生了什么。`;
}

function applyReviewedTranslation(sentence) {
  const reviewed = reviewedTranslations[sentence.id];

  if (reviewed) {
    return {
      ...sentence,
      zhTranslation: reviewed.zhTranslation,
      zhExplanation: reviewed.zhExplanation ?? learningTipFor(sentence.keywords),
    };
  }

  if (sentence.zhTranslation.trim() && sentence.zhExplanation.trim()) {
    return sentence;
  }

  throw new Error(`Missing reviewed Chinese translation for ${sentence.id}`);
}

function makeGeneratedSentence(sessionIndex, blockIndex, block) {
  const keywords = keywordsFor(block.transcript);

  const sentence = {
    id: `d${sessionIndex + 1}-b${String(blockIndex + 1).padStart(2, '0')}`,
    label: labelFor(block.transcript, blockIndex),
    startTime: Number(block.startTime.toFixed(2)),
    endTime: Number(block.endTime.toFixed(2)),
    transcript: block.transcript,
    zhTranslation: '',
    zhExplanation: '',
    keywords,
    sentencePatterns: patternsFor(block.transcript),
    speakingPrompt: 'Use the keywords to retell this part in one natural sentence.',
  };

  return applyReviewedTranslation(applyManualCorrections(sentence, sessionIndex, blockIndex));
}

function makeLesson(sessionIndex, timedWords) {
  const startTime = LESSON_START + sessionIndex * SESSION_SECONDS;
  const endTime = startTime + SESSION_SECONDS;
  const blocks = [];

  if (sessionIndex === 0) {
    blocks.push(...manualSeed);
  }

  for (let blockStart = startTime; blockStart < endTime; blockStart += BLOCK_SECONDS) {
    if (sessionIndex === 0 && blockStart < 659) continue;
    const block = blockTranscript(
      timedWords,
      blockStart,
      Math.min(blockStart + BLOCK_SECONDS, endTime)
    );
    if (block) blocks.push(makeGeneratedSentence(sessionIndex, blocks.length, block));
  }

  const titles = [
    'Day 1: slab and first attempts',
    'Day 2: feet and low-percentage moves',
    'Day 3: athlete context and attempts',
    'Day 4: positioning and sequences',
    'Day 5: final moves and pressure',
    'Day 6: replay and full retell',
  ];

  return {
    id: `bern-2025-wb-day-${sessionIndex + 1}`,
    title: titles[sessionIndex],
    sourceUrl: SOURCE_URL,
    sourceLabel: SOURCE_LABEL,
    mediaUrl: MEDIA_URL,
    mediaStartTime: MEDIA_START,
    videoId: VIDEO_ID,
    competition: 'IFSC World Cup Bern 2025',
    discipline: "Women's Boulder Final",
    athlete: 'Final field',
    startTime,
    endTime,
    segmentGoal:
      sessionIndex === 0
        ? '先听懂 slab 顶部、heel、match、appeal 等核心攀岩解说词。'
        : '用 5 分钟官方解说做精听：先听动作，再看字幕，最后用关键词复述。',
    captionStatus:
      sessionIndex === 0
        ? '前 5 句已手工校对；其余练习块已完成中文翻译。'
        : '已完成英文字幕整理和中文翻译。',
    sentences: blocks.sort((first, second) => first.startTime - second.startTime),
  };
}

if (!fs.existsSync(vttPath)) {
  throw new Error(`Missing VTT file: ${vttPath}`);
}

const timedWords = readTimedWords(fs.readFileSync(vttPath, 'utf8'));
const lessons = Array.from({ length: SESSION_COUNT }, (_, index) => makeLesson(index, timedWords));

const file = `import type { Lesson } from '../types';\n\nexport const bernLessons: Lesson[] = ${JSON.stringify(lessons, null, 2)};\n`;

fs.writeFileSync(outputPath, file);
console.log(`Wrote ${lessons.length} lessons to ${outputPath}`);
console.log(lessons.map((lesson) => `${lesson.id}: ${lesson.sentences.length} blocks`).join('\n'));
