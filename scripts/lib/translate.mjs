// Translation helpers for the import pipeline.
//  - translateSentences: batch machine translation via DeepSeek (or any
//    OpenAI-compatible chat endpoint). Degrades gracefully without a key:
//    cues are marked needsTranslation instead of crashing the build.
//  - backfillFromReference: reuses human-reviewed translations from an
//    existing lessons dataset by fuzzy text overlap (used to rebuild the
//    Bern 2025 course with the new segmenter without re-translating).

import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_BATCH_SIZE = 24;

export async function translateSentences(sentences, options = {}) {
  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
  const baseUrl = (
    options.baseUrl ??
    process.env.DEEPSEEK_BASE_URL ??
    'https://api.deepseek.com'
  ).replace(/\/+$/, '');
  const model = options.model ?? process.env.DEEPSEEK_MODEL ?? 'deepseek-chat';
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;

  if (!apiKey) {
    return sentences.map((sentence) => ({
      ...sentence,
      zh: '',
      note: '机器翻译待补：配置 DEEPSEEK_API_KEY 后重新运行翻译。',
      needsTranslation: true,
    }));
  }

  const output = [];
  for (let start = 0; start < sentences.length; start += batchSize) {
    const batch = sentences.slice(start, start + batchSize);
    const translated = await translateBatch(batch, { apiKey, baseUrl, model });
    output.push(...translated);
  }
  return output;
}

async function translateBatch(batch, { apiKey, baseUrl, model }) {
  const payload = batch.map((sentence, index) => ({ i: index, en: sentence.text }));

  const body = {
    model,
    temperature: 0.2,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content:
          'You are a bilingual (en/zh-CN) climbing-commentary coach. Translate each English commentary sentence into natural simplified Chinese for climbers learning English. Keep climbing terms accurate (flash=一把完攀, top=完攀, zone=Zone得分点, match=双手并点, slab=板壁, heel hook=脚跟钩, crux=难点, beta=动作解法, low percentage=成功率低). Also add a one-line learning note (tip) pointing out the most useful word, pattern or listening point. Return JSON only: {"items":[{"i":0,"zh":"...","tip":"..."}]}.',
      },
      { role: 'user', content: JSON.stringify(payload) },
    ],
  };

  let lastError = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(
          `translate API error ${response.status}: ${(await response.text()).slice(0, 200)}`
        );
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content ?? '{}';
      const parsed = parseJsonLoose(content);
      const items = Array.isArray(parsed.items) ? parsed.items : [];

      reportBatchCoverage(items, batch);
      return alignTranslationResponse(items, batch);
    } catch (error) {
      lastError = error;
    }
  }

  console.warn(
    `  ! translation batch failed (${lastError?.message ?? 'unknown error'}); keeping placeholders`
  );
  return batch.map((sentence) => ({
    ...sentence,
    zh: '',
    note: '机器翻译失败，保留占位，可稍后重跑。',
    needsTranslation: true,
  }));
}

// Strict row picker: only matches when the response carries the exact numeric
// `i` for this index. Returns null instead of falling back to the array slot,
// because array order is not contractually guaranteed by chat completions.
export function pickTranslationForIndex(items, index) {
  return items.find((entry) => entry && Number.isInteger(entry.i) && entry.i === index) ?? null;
}

// Align a batch of LLM responses to the input sentences. Any row the model
// dropped, mis-numbered, or shifted is left as needsTranslation=true so it can
// be re-run by translate-videos.mjs, NOT silently borrowed from a neighbour
// (which is how the +1 drift in technique / Bern videos was born).
export function alignTranslationResponse(items, batch) {
  return batch.map((sentence, index) => {
    const item = pickTranslationForIndex(items, index);
    const zh = item && typeof item.zh === 'string' ? item.zh.trim() : '';
    const tip = item && typeof item.tip === 'string' ? item.tip.trim() : '';
    if (!item) {
      return {
        ...sentence,
        zh: '',
        note: '',
        needsTranslation: true,
      };
    }
    return {
      ...sentence,
      zh,
      note: tip,
      needsTranslation: zh.length === 0,
    };
  });
}

function reportBatchCoverage(items, batch) {
  const matched = batch.filter((_, index) => pickTranslationForIndex(items, index)).length;
  const coverage = batch.length === 0 ? 1 : matched / batch.length;
  if (matched < batch.length) {
    console.warn(
      `  ! translate batch coverage ${matched}/${batch.length} (${Math.round(coverage * 100)}%); ` +
        `${batch.length - matched} cues will be re-flagged as needsTranslation.`
    );
  }
}

export function backfillFromReference(sentences, referenceSentences, options = {}) {
  const timeWindow = options.timeWindow ?? 90;
  // Both directions must reach this before a cue borrows a reviewed zh.
  // Tuned to 0.8: a cue that merely *overlaps* a reviewed block (e.g. shares
  // 60% of its words but each side has its own extra words) must NOT copy the
  // whole translation — that reproduced the "one sentence's zh on several
  // cards" bug (Issue #2). Only a near-exact match reuses reviewed text.
  const nearMatchCoverage = options.nearMatchCoverage ?? 0.8;
  const maxJoin = options.maxJoin ?? 3;

  return sentences.map((sentence) => {
    const nearby = referenceSentences.filter(
      (reference) => Math.abs(reference.startTime - sentence.startTime) <= timeWindow
    );

    const scored = nearby.map((reference) => {
      const { refCoverage, cueCoverage } = coverage(sentence.text, reference.en);
      return { reference, refCoverage, cueCoverage };
    });

    // Case 1: near-exact match with a single reviewed block — reuse its zh.
    const best = scored
      .filter(
        (entry) => entry.refCoverage >= nearMatchCoverage && entry.cueCoverage >= nearMatchCoverage
      )
      .sort((first, second) => second.cueCoverage - first.cueCoverage)[0];

    if (best) {
      return {
        ...sentence,
        zh: best.reference.zh,
        note: best.reference.note,
        needsTranslation: false,
        backfilled: true,
      };
    }

    // Case 2: the cue spans several reviewed blocks — join the zh of the
    // blocks that are (almost) fully contained in the cue, in time order.
    const contained = scored
      .filter((entry) => entry.refCoverage >= nearMatchCoverage)
      .sort((first, second) => first.reference.startTime - second.reference.startTime)
      .slice(0, maxJoin);

    if (contained.length > 0) {
      const zh = dedupeJoin(contained.map((entry) => entry.reference.zh));
      const note = dedupeJoin(contained.map((entry) => entry.reference.note).filter(Boolean));
      return { ...sentence, zh, note, needsTranslation: false, backfilled: true };
    }

    return { ...sentence, zh: '', note: '', needsTranslation: true };
  });
}

export function loadLessonsAsReference(lessonsFilePath) {
  const lessons = readLessonsModule(lessonsFilePath);

  const reference = [];
  for (const lesson of lessons) {
    for (const sentence of lesson.sentences ?? []) {
      reference.push({
        startTime: sentence.startTime,
        endTime: sentence.endTime,
        en: sentence.transcript,
        zh: sentence.zhTranslation,
        note: sentence.zhExplanation,
      });
    }
  }
  return reference;
}

// Resolve a lessons data module into its top-level Lesson[] regardless of
// shape:
//   - a direct array literal (`export const x: Lesson[] = [ ... ]`) — the
//     legacy combined lessons.ts and the split generated/manual files;
//   - a re-export (`export const lessons = [...a, ...b]`) — src/data/lessons.ts
//     after the R3 split. Each imported module is parsed recursively so the
//     `--backfill-zh src/data/lessons.ts` call keeps working unchanged.
function readLessonsModule(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');

  const direct = text.match(/=\s*(\[[\s\S]*\])\s*;?\s*$/);
  if (direct) {
    try {
      return JSON.parse(direct[1]);
    } catch {
      // Not a plain JSON array literal — it is a spread re-export
      // (`[...a, ...b]`). Fall through to import resolution below.
    }
  }

  const dir = path.dirname(filePath);
  const valueImports = [...text.matchAll(/import\s*\{([^}]+)\}\s*from\s*['"]([^'"]+)['"]/g)];
  const lessons = [];
  for (const [, , specifier] of valueImports) {
    if (!specifier.startsWith('.')) continue;
    const modulePath = path.resolve(dir, specifier.endsWith('.ts') ? specifier : `${specifier}.ts`);
    lessons.push(...readLessonsModule(modulePath));
  }
  if (lessons.length === 0) {
    throw new Error(
      `Could not parse lessons module (not an array literal or re-export): ${filePath}`
    );
  }
  return lessons;
}

function coverage(textA, textB) {
  const wordsA = new Set(textA.toLowerCase().match(/[a-z']+/g) ?? []);
  const wordsB = new Set(textB.toLowerCase().match(/[a-z']+/g) ?? []);
  if (wordsA.size === 0 || wordsB.size === 0) return { refCoverage: 0, cueCoverage: 0 };

  let shared = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) shared += 1;
  }
  return {
    refCoverage: shared / wordsB.size, // how much of the reference is inside the cue
    cueCoverage: shared / wordsA.size, // how much of the cue is inside the reference
  };
}

function dedupeJoin(parts) {
  const seen = new Set();
  const output = [];
  for (const part of parts.filter(Boolean)) {
    if (seen.has(part)) continue;
    seen.add(part);
    output.push(part);
  }
  return output.join(' ');
}

export function parseJsonLoose(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
}
