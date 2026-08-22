// Translation helpers for the import pipeline.
//  - translateSentences: batch machine translation via DeepSeek (or any
//    OpenAI-compatible chat endpoint). Degrades gracefully without a key:
//    cues are marked needsTranslation instead of crashing the build.
//  - backfillFromReference: reuses human-reviewed translations from an
//    existing lessons dataset by fuzzy text overlap (used to rebuild the
//    Bern 2025 course with the new segmenter without re-translating).

const DEFAULT_BATCH_SIZE = 24;

export async function translateSentences(sentences, options = {}) {
  const apiKey = options.apiKey ?? process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY ?? '';
  const baseUrl = (options.baseUrl ?? process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com').replace(/\/+$/, '');
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
        throw new Error(`translate API error ${response.status}: ${(await response.text()).slice(0, 200)}`);
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

  console.warn(`  ! translation batch failed (${lastError?.message ?? 'unknown error'}); keeping placeholders`);
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
  return (
    items.find((entry) => entry && Number.isInteger(entry.i) && entry.i === index) ?? null
  );
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
        `${batch.length - matched} cues will be re-flagged as needsTranslation.`,
    );
  }
}

export function backfillFromReference(sentences, referenceSentences, options = {}) {
  const timeWindow = options.timeWindow ?? 90;
  const minRefCoverage = options.minRefCoverage ?? 0.6; // ref fully inside the cue → safe to join
  const minCueCoverage = options.minCueCoverage ?? 0.5; // cue fully inside one ref → reuse its zh
  const maxJoin = options.maxJoin ?? 3;

  return sentences.map((sentence) => {
    const nearby = referenceSentences.filter(
      (reference) => Math.abs(reference.startTime - sentence.startTime) <= timeWindow,
    );

    const scored = nearby.map((reference) => {
      const { refCoverage, cueCoverage } = coverage(sentence.text, reference.en);
      return { reference, refCoverage, cueCoverage };
    });

    // Case 1: the new cue spans several reviewed blocks — join the zh of the
    // blocks that are (almost) fully contained in the cue, in time order.
    const contained = scored
      .filter((entry) => entry.refCoverage >= minRefCoverage)
      .sort((first, second) => first.reference.startTime - second.reference.startTime)
      .slice(0, maxJoin);

    if (contained.length > 0) {
      const zh = dedupeJoin(contained.map((entry) => entry.reference.zh));
      const note = dedupeJoin(contained.map((entry) => entry.reference.note).filter(Boolean));
      return { ...sentence, zh, note, needsTranslation: false, backfilled: true };
    }

    // Case 2: the cue matches one reviewed block closely enough to reuse its
    // zh. The check is BIDIRECTIONAL — cueCoverage alone is not enough. A
    // fragment cue ("this was the top of the slab") has high cueCoverage but
    // low refCoverage against the full reviewed block ("…of the slab it was
    // blocked"); reusing the whole zh there made every fragment of one block
    // show the same translation (Issue #2). Require both directions so only a
    // cue that *covers most of* the reference borrows its zh; a genuine
    // fragment stays needsTranslation and gets machine-translated on its own.
    const best = scored
      .filter((entry) => entry.cueCoverage >= minCueCoverage && entry.refCoverage >= minRefCoverage)
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

    return { ...sentence, zh: '', note: '新断句超出已校对范围，待补翻译。', needsTranslation: true };
  });
}

export function loadLessonsAsReference(lessonsFileText) {
  // src/data/lessons.ts is a generated file containing pure JSON after the
  // import line; parse it without needing a TS loader.
  const match = lessonsFileText.match(/=\s*(\[[\s\S]*\])\s*;?\s*$/);
  if (!match) throw new Error('Could not parse lessons.ts as JSON');
  const lessons = JSON.parse(match[1]);

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

function coverage(textA, textB) {
  const wordsA = new Set((textA.toLowerCase().match(/[a-z']+/g) ?? []));
  const wordsB = new Set((textB.toLowerCase().match(/[a-z']+/g) ?? []));
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

function parseJsonLoose(raw) {
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
