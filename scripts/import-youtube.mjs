#!/usr/bin/env node
// Import a YouTube climbing video into the Climb English library.
//
// Pipeline: yt-dlp (metadata + subtitles + video) -> word-level caption
// parsing -> sentence segmentation + learning-value scoring -> optional
// machine translation -> typed data module + media file + registry update.
//
// Usage:
//   node scripts/import-youtube.mjs <youtube-url-or-id> [options]
//
// Options:
//   --title <text>            Override the YouTube title
//   --category <slug>         world-cup | technique | interview | training | other
//   --level <slug>            beginner | intermediate | advanced (default intermediate)
//   --start <sec> / --end <sec>  Only import this window of the video
//   --max-height <px>         Download resolution cap (default 720)
//   --reuse-media <url>       Skip download; reuse an existing media URL
//   --media-start <sec>       Offset of the lesson timeline inside the media file
//   --no-translate            Skip machine translation (placeholders instead)
//   --backfill-zh <file>      Reuse reviewed translations from a lessons.ts file
//   --min-score <0-100>       Study-clip threshold (default 38)
//   --slug <id>               Custom video id
//   --dry-run                 Print stats without writing files

import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadSubtitleWords } from './lib/timed-words.mjs';
import { segmentWords } from './lib/segment.mjs';
import { writeGeneratedVideo } from './lib/generated-video.mjs';
import { wordStartOffsetsFromTimedWords } from './lib/word-times.mjs';
import { CLIMBING_TERMS, findClimbingTerms } from './lib/climbing-terms.mjs';
import {
  backfillFromReference,
  loadLessonsAsReference,
  translateSentences,
} from './lib/translate.mjs';
import { generateVideoPreview, getPreviewWindow } from './lib/video-preview.mjs';

const run = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'src/data/videos');
const MEDIA_DIR = path.join(ROOT, 'public/media');
const PREVIEW_DIR = path.join(MEDIA_DIR, 'previews');
const YT_DLP =
  process.env.YT_DLP ||
  (fs.existsSync('/Users/zaczhu/.workbuddy/binaries/python/envs/default/bin/yt-dlp')
    ? '/Users/zaczhu/.workbuddy/binaries/python/envs/default/bin/yt-dlp'
    : 'yt-dlp');
const FFMPEG = process.env.FFMPEG || 'ffmpeg';

const CATEGORY_LABELS = {
  'world-cup': 'World Cup / 世界杯赛事',
  technique: 'Technique / 攀岩技巧',
  interview: 'Interview / 访谈对话',
  training: 'Training / 训练方法',
  other: 'Other / 其他',
};

// Only run the CLI when executed directly (not when imported for writeRegistry).
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(`\n✗ import failed: ${error.message}`);
    process.exit(1);
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.input) {
    console.error('Usage: node scripts/import-youtube.mjs <youtube-url-or-id> [options]');
    process.exit(1);
  }

  const youtubeId = extractVideoId(args.input);
  if (!youtubeId) throw new Error(`Cannot parse a YouTube video id from: ${args.input}`);
  const sourceUrl = `https://www.youtube.com/watch?v=${youtubeId}`;
  console.log(`→ fetching metadata for ${youtubeId}`);

  const metadata = await fetchMetadata(sourceUrl);
  const title = args.title || metadata.title || youtubeId;
  const slug = args.slug || slugify(`${title}-${youtubeId}`);
  const mediaStart = args.mediaStart ?? args.start ?? 0;
  console.log(`  title: ${title}`);
  console.log(
    `  channel: ${metadata.channel ?? 'unknown'} | duration: ${metadata.duration ?? '?'}s`
  );

  // 1. Subtitles
  console.log('→ downloading English subtitles (manual first, auto fallback)');
  const subtitle = await fetchSubtitles(sourceUrl, youtubeId);
  if (!subtitle) throw new Error('No English subtitles available for this video.');
  console.log(`  caption kind: ${subtitle.kind} | file: ${path.basename(subtitle.file)}`);

  const { kind, words } = loadSubtitleWords(fs.readFileSync(subtitle.file, 'utf8'));
  const start = args.start ?? 0;
  const end = args.end ?? metadata.duration ?? Number.POSITIVE_INFINITY;
  const scoped = words.filter((word) => word.time >= start && word.time <= end);
  if (scoped.length < 20)
    throw new Error(`Only ${scoped.length} caption words in the selected window — aborting.`);
  console.log(
    `  ${scoped.length} words in window [${fmt(start)} → ${fmt(end === Infinity ? scoped[scoped.length - 1].time : end)}]`
  );

  // 2. Sentence segmentation + scoring
  console.log('→ segmenting sentences & scoring learning value');
  const { sentences, dropped } = segmentWords(scoped, { minScore: args.minScore ?? 38 });
  const studyCount = sentences.filter((sentence) => sentence.keep).length;
  const highlightCount = sentences.filter((sentence) => sentence.highlight).length;
  console.log(
    `  ${sentences.length} subtitle cues (${studyCount} study-worthy, ${highlightCount} highlights); ` +
      `${dropped.length} fragments below threshold (kept in subtitle track, excluded from practice)`
  );

  // 3. Translation
  let translated = sentences;
  if (args.backfillZh) {
    console.log(`→ backfilling Chinese from reviewed lessons: ${args.backfillZh}`);
    const reference = loadLessonsAsReference(args.backfillZh);
    translated = backfillFromReference(sentences, reference);
    const missing = translated.filter((sentence) => sentence.needsTranslation).length;
    console.log(
      `  ${translated.length - missing}/${translated.length} cues covered by reviewed translations`
    );
  }
  if (args.translate !== false) {
    // Only machine-translate cues that still lack Chinese (e.g. not covered by
    // the reviewed-translation backfill), then merge results back in place.
    const pendingIndexes = translated
      .map((sentence, index) => (sentence.needsTranslation === false ? -1 : index))
      .filter((index) => index >= 0);
    console.log(
      `→ translating ${pendingIndexes.length}/${translated.length} cues via DeepSeek (set DEEPSEEK_API_KEY; use --no-translate to skip)`
    );
    if (pendingIndexes.length > 0) {
      const machineTranslated = await translateSentences(
        pendingIndexes.map((index) => translated[index]),
        {}
      );
      pendingIndexes.forEach((sentenceIndex, offset) => {
        translated[sentenceIndex] = machineTranslated[offset];
      });
    }
    const missing = translated.filter((sentence) => sentence.needsTranslation).length;
    console.log(
      `  translated: ${translated.length - missing}/${translated.length}${missing ? ` (${missing} placeholders left)` : ''}`
    );
  } else {
    translated = translated.map((sentence) =>
      sentence.zh
        ? sentence
        : { ...sentence, zh: sentence.zh ?? '', needsTranslation: !sentence.zh }
    );
  }

  const cues = translated.map((sentence, index) => {
    const cue = {
      id: `c${String(index + 1).padStart(3, '0')}`,
      startTime: sentence.startTime,
      endTime: sentence.endTime,
      en: sentence.text,
      zh: sentence.zh ?? '',
      ...(sentence.note ? { note: sentence.note } : {}),
      score: sentence.score,
      study: sentence.keep,
      ...(sentence.highlight ? { highlight: true } : {}),
      ...(sentence.needsTranslation ? { needsTranslation: true } : {}),
      keywords: findClimbingTerms(sentence.text).slice(0, 5),
    };
    // Source-driven word timing only for auto captions: manual captions have
    // no real word timestamps and must never be interpolated into offsets.
    if (kind === 'auto' && Array.isArray(sentence.words) && sentence.words.length > 0) {
      const wordStartOffsetsMs = wordStartOffsetsFromTimedWords(sentence.words, cue);
      if (!wordStartOffsetsMs) {
        throw new Error(`Cannot derive reliable word times for imported cue ${cue.id}`);
      }
      cue.wordStartOffsetsMs = wordStartOffsetsMs;
    }
    return cue;
  });

  // 4. Media
  let mediaUrl = '';
  if (args.reuseMedia) {
    mediaUrl = args.reuseMedia;
    console.log(`→ reusing existing media: ${mediaUrl}`);
  } else if (!args.dryRun) {
    console.log(`→ downloading video (≤${args.maxHeight ?? 720}p) and transcoding for web`);
    mediaUrl = await downloadAndTranscode(sourceUrl, slug, {
      maxHeight: args.maxHeight ?? 720,
      start: args.start,
      end: args.end,
    });
    console.log(`  media: ${mediaUrl}`);
  }

  let previewMediaUrl = '';
  let previewStartTime;
  let previewDurationSeconds;
  let preferPreview = false;
  if (!args.dryRun) {
    if (!mediaUrl.startsWith('/media/')) {
      throw new Error('A local /media/*.mp4 source is required to generate the 20-second preview.');
    }
    const mediaFile = path.join(ROOT, 'public', mediaUrl.replace(/^\//, ''));
    if (!fs.existsSync(mediaFile)) {
      throw new Error(`Cannot generate preview; local media is missing: ${mediaFile}`);
    }
    const previewWindow = getPreviewWindow({ mediaStartTime: mediaStart, cues });
    const previewFileName = `${slug}-20s.mp4`;
    const previewFile = path.join(PREVIEW_DIR, previewFileName);
    console.log(
      `→ generating Git-tracked warm-up preview (${previewWindow.previewStartTime}s + ${previewWindow.previewDurationSeconds}s)`
    );
    await generateVideoPreview({
      inputFile: mediaFile,
      outputFile: previewFile,
      sourceOffset: previewWindow.previewSourceOffset,
    });
    previewMediaUrl = `/media/previews/${previewFileName}`;
    previewStartTime = previewWindow.previewStartTime;
    previewDurationSeconds = previewWindow.previewDurationSeconds;
    preferPreview = fs.statSync(mediaFile).size >= 100 * 1024 * 1024;
    console.log(`  preview: ${previewMediaUrl}`);
  }

  const video = {
    id: slug,
    title,
    sourceUrl,
    sourceLabel: `${title} | ${metadata.channel ?? 'YouTube'}`,
    youtubeId,
    channel: metadata.channel ?? '',
    category: args.category ?? 'other',
    categoryLabel: CATEGORY_LABELS[args.category] ?? CATEGORY_LABELS.other,
    level: args.level ?? 'intermediate',
    mediaUrl,
    mediaStartTime: mediaStart,
    ...(previewMediaUrl
      ? {
          previewMediaUrl,
          previewStartTime,
          previewDurationSeconds,
          ...(preferPreview ? { preferPreview: true } : {}),
        }
      : {}),
    durationSeconds: Number((end === Infinity ? (metadata.duration ?? 0) : end - start).toFixed(1)),
    captionKind: kind,
    importedAt: new Date().toISOString().slice(0, 10),
    cueCount: cues.length,
    studyCueCount: cues.filter((cue) => cue.study).length,
    needsTranslationCount: cues.filter((cue) => cue.needsTranslation).length,
    cues,
  };

  if (args.dryRun) {
    console.log('\n— dry run, no files written —');
    console.log(JSON.stringify({ ...video, cues: cues.slice(0, 5) }, null, 2).slice(0, 3000));
    return;
  }

  // 5. Write data module + registry
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(MEDIA_DIR, { recursive: true });
  const dataFile = path.join(DATA_DIR, `${slug}.video.ts`);
  writeGeneratedVideo(dataFile, video);
  writeRegistry();
  console.log(`\n✓ imported ${cues.length} cues → ${path.relative(ROOT, dataFile)}`);
  console.log(`✓ registry updated → src/data/videos/index.ts`);
}

function parseArgs(argv) {
  const args = { translate: true };
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      positional.push(token);
      continue;
    }
    const key = token.slice(2);
    if (key === 'no-translate') args.translate = false;
    else if (key === 'dry-run') args.dryRun = true;
    else if (key === 'title') args.title = argv[++index];
    else if (key === 'category') args.category = argv[++index];
    else if (key === 'level') args.level = argv[++index];
    else if (key === 'start') args.start = Number(argv[++index]);
    else if (key === 'end') args.end = Number(argv[++index]);
    else if (key === 'max-height') args.maxHeight = Number(argv[++index]);
    else if (key === 'reuse-media') args.reuseMedia = argv[++index];
    else if (key === 'media-start') args.mediaStart = Number(argv[++index]);
    else if (key === 'backfill-zh') args.backfillZh = argv[++index];
    else if (key === 'min-score') args.minScore = Number(argv[++index]);
    else if (key === 'slug') args.slug = argv[++index];
    else throw new Error(`Unknown option: --${key}`);
  }
  args.input = positional[0];
  return args;
}

function extractVideoId(input) {
  const trimmed = input.trim();
  const match = trimmed.match(
    /(?:youtube\.com\/watch\?.*v=|youtu\.be\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/
  );
  if (match) return match[1];
  return /^[A-Za-z0-9_-]{11}$/.test(trimmed) ? trimmed : null;
}

async function fetchMetadata(sourceUrl) {
  const { stdout } = await run(YT_DLP, ['-J', '--no-playlist', sourceUrl], {
    maxBuffer: 64 * 1024 * 1024,
  });
  const data = JSON.parse(stdout);
  return {
    title: data.title,
    channel: data.channel || data.uploader || '',
    duration: data.duration ?? null,
    uploadDate: data.upload_date ?? '',
  };
}

async function fetchSubtitles(sourceUrl, youtubeId) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'climb-subs-'));
  const outTemplate = path.join(tmpDir, youtubeId);
  await run(YT_DLP, [
    '--skip-download',
    '--write-subs',
    '--write-auto-subs',
    '--sub-langs',
    'en.*',
    '--convert-subs',
    'vtt',
    '--no-playlist',
    '-o',
    outTemplate,
    sourceUrl,
  ]);

  const files = fs.readdirSync(tmpDir).filter((file) => file.endsWith('.vtt'));
  if (files.length === 0) return null;

  // Manual subtitles: "video.en.vtt" when it differs from auto; yt-dlp writes
  // auto subs as ".en.vtt" too, so prefer the file that has no word-level
  // rolling duplication (heuristic: smaller file usually = manual).
  const candidates = files
    .map((file) => {
      const full = path.join(tmpDir, file);
      const text = fs.readFileSync(full, 'utf8');
      return {
        file: full,
        kind: /<\d\d:\d\d:\d\d[.,]\d+>/.test(text) ? 'auto' : 'manual',
        size: text.length,
      };
    })
    .sort((first, second) =>
      first.kind === second.kind ? first.size - second.size : first.kind === 'manual' ? -1 : 1
    );

  return candidates[0];
}

async function downloadAndTranscode(sourceUrl, slug, { maxHeight, start, end }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'climb-video-'));
  const rawFile = path.join(tmpDir, 'raw.mp4');
  const args = [
    '-f',
    `bv*[height<=${maxHeight}][ext=mp4]+ba[ext=m4a]/bv*[height<=${maxHeight}]+ba/b[height<=${maxHeight}]`,
    '--merge-output-format',
    'mp4',
    '--no-playlist',
  ];
  if (typeof start === 'number' || typeof end === 'number') {
    args.push('--download-sections', `*${start ?? 0}-${end ?? 'inf'}`);
  }
  args.push('-o', rawFile, sourceUrl);
  await run(YT_DLP, args, { maxBuffer: 64 * 1024 * 1024 });

  const outFile = path.join(MEDIA_DIR, `${slug}.mp4`);
  await run(FFMPEG, [
    '-y',
    '-i',
    rawFile,
    '-c:v',
    'libx264',
    '-preset',
    'fast',
    '-crf',
    '28',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-b:a',
    '96k',
    '-movflags',
    '+faststart',
    outFile,
  ]);
  fs.rmSync(tmpDir, { recursive: true, force: true });
  return `/media/${slug}.mp4`;
}

export function writeRegistry() {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((file) => file.endsWith('.video.ts'))
    .sort();

  // Summaries (metadata without cues) keep the library listing cheap; full cue
  // data is code-split per video and lazy-loaded via dynamic import().
  const videos = files.map((file) => {
    const text = fs.readFileSync(path.join(DATA_DIR, file), 'utf8');
    const match = text.match(/=\s*(\{[\s\S]*\})\s*;?\s*$/);
    if (!match) throw new Error(`Could not parse ${file}`);
    const video = JSON.parse(match[1]);
    const { cues: _cues, ...summary } = video;
    return { file: file.replace(/\.ts$/, ''), summary };
  });

  const loaderLines = videos
    .map(({ file, summary }) => `  '${summary.id}': () => import('./${file}'),`)
    .join('\n');
  const summaryLines = videos.map(({ summary }) => JSON.stringify(summary)).join(',\n  ');

  const content = `// GENERATED by scripts/import-youtube.mjs — do not edit by hand.
import type { VideoEntry, VideoSummary } from '../../types';

const loaders: Record<string, () => Promise<{ video: VideoEntry }>> = {
${loaderLines}
};

export const videoSummaries: VideoSummary[] = [
  ${summaryLines}
];

export async function loadVideo(id: string): Promise<VideoEntry | undefined> {
  const loader = loaders[id];
  if (!loader) return undefined;
  const loaded = await loader();
  return loaded.video;
}
`;
  fs.writeFileSync(path.join(DATA_DIR, 'index.ts'), content);

  // Keep the frontend term dictionary in sync with the pipeline's term bank
  // so cue keywords can be stored as plain strings and expanded at render time.
  const dictionary = Object.fromEntries(
    CLIMBING_TERMS.map(([term, zh, example]) => [term, { zh, example }])
  );
  fs.writeFileSync(
    path.join(DATA_DIR, 'climbing-terms.ts'),
    `// GENERATED by scripts/import-youtube.mjs — do not edit by hand.
export const CLIMBING_TERM_DICT: Record<string, { zh: string; example: string }> = ${JSON.stringify(dictionary, null, 2)};
`
  );
}

function slugify(text) {
  const slug = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72);
  return slug || `video-${Date.now()}`;
}

function fmt(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}
