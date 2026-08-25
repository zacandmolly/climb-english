import 'dotenv/config';
import express from 'express';
import fs from 'node:fs/promises';
import multer from 'multer';
import OpenAI from 'openai';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, '..');
const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT || 5173);
const allowedOrigins = String(
  process.env.API_ALLOWED_ORIGINS ||
    'https://zacandmolly.github.io,http://127.0.0.1:5173,http://localhost:5173',
)
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const dailyRequestLimit = positiveInteger(process.env.DAILY_REQUEST_LIMIT, 300);
const hourlyRequestLimit = positiveInteger(process.env.HOURLY_REQUEST_LIMIT, 90);
const perIpHourlyRequestLimit = positiveInteger(process.env.PER_IP_HOURLY_LIMIT, 35);
const maxAudioBytes = positiveInteger(process.env.MAX_AUDIO_BYTES, 10 * 1024 * 1024);
const aiProvider = normalizeAiProvider(process.env.AI_PROVIDER);
const usageCounters = new Map();

const app = express();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxAudioBytes,
  },
});

app.set('trust proxy', true);
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(origin && !allowedOrigins.includes(origin) ? 403 : 204).end();
    return;
  }

  if (origin && !allowedOrigins.includes(origin) && req.path.startsWith('/api/')) {
    res.status(403).json({ error: 'Origin is not allowed.' });
    return;
  }

  next();
});

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    provider: aiProvider,
    ai: hasUsableProviderKey(),
    aiStatus: getProviderKeyStatus(),
    limits: {
      daily: dailyRequestLimit,
      hourly: hourlyRequestLimit,
      perIpHourly: perIpHourlyRequestLimit,
      maxAudioBytes,
    },
  });
});

app.get('/api/usage', (req, res) => {
  const expectedToken = process.env.API_ADMIN_TOKEN;
  if (!expectedToken || req.headers.authorization !== `Bearer ${expectedToken}`) {
    res.status(401).json({ error: 'Unauthorized.' });
    return;
  }

  const now = new Date();
  res.json({
    ok: true,
    usage: {
      daily: getCounter(dailyKey(now)),
      hourly: getCounter(hourlyKey(now)),
    },
    limits: {
      daily: dailyRequestLimit,
      hourly: hourlyRequestLimit,
      perIpHourly: perIpHourlyRequestLimit,
      maxAudioBytes,
    },
  });
});

app.post('/api/speaking-feedback', enforceUsageLimits, upload.single('audio'), async (req, res) => {
  try {
    const targetSentence = String(req.body.targetSentence || '').trim();
    const transcript = String(req.body.transcript || '').trim();
    const keywordText = String(req.body.keywords || '').trim();
    const clipId = String(req.body.clipId || '').trim();
    const browserSpokenText = String(req.body.spokenText || '').trim();

    if (!targetSentence || !clipId) {
      res.status(400).json({ error: 'Missing clipId or targetSentence.' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'No recording received.' });
      return;
    }

    const baseAudioMetrics = analyzeAudioBuffer(req.file.buffer);

    if (!hasUsableProviderKey()) {
      res.json(makeDemoFeedback({ targetSentence, keywordText }));
      return;
    }

    if (aiProvider === 'deepseek') {
      const audioMetrics = addSpeechRate(baseAudioMetrics, browserSpokenText);
      const coaching = await generateDeepSeekCoaching({
        clipId,
        targetSentence,
        transcript,
        keywordText,
        spokenText: browserSpokenText,
        audioMetrics,
      });
      res.json({
        mode: 'ai',
        provider: 'deepseek',
        transcript:
          browserSpokenText ||
          '没有拿到浏览器语音识别文本；本次只根据录音音量、语速和停顿做反馈。',
        keywordHits: Array.isArray(coaching.keywordHits) ? coaching.keywordHits.slice(0, 8) : [],
        closeness: coaching.closeness || '这次先看录音节奏和清晰度，下一遍再把关键词说稳。',
        audioNotes: Array.isArray(coaching.audioNotes)
          ? coaching.audioNotes.slice(0, 4)
          : makeAudioNotes(audioMetrics),
        suggestions: Array.isArray(coaching.suggestions)
          ? coaching.suggestions.slice(0, 2)
          : ['先把关键词说清楚。', '下一遍把句子拆成两段说。'],
        naturalVersion: coaching.naturalVersion || targetSentence,
      });
      return;
    }

    const apiKey = getUsableOpenAiKey();
    const client = new OpenAI({ apiKey });
    const audioFile = new File(
      [req.file.buffer],
      req.file.originalname || 'recording.webm',
      { type: req.file.mimetype || 'audio/webm' },
    );

    const transcription = await client.audio.transcriptions.create({
      file: audioFile,
      model: process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe',
      prompt: `Climbing vocabulary and names that may appear: ${keywordText}`,
      response_format: 'json',
    });

    const spokenText = transcription.text || '';
    const audioMetrics = addSpeechRate(baseAudioMetrics, spokenText);
    const feedback = await client.responses.create({
      model: process.env.OPENAI_FEEDBACK_MODEL || 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content:
            'You are a supportive climbing English speaking coach. Return compact JSON only. Do not grade harshly. Focus on confidence, key climbing words, and one next repetition.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            clipId,
            targetSentence,
            sourceTranscript: transcript,
            keywords: keywordText,
            learnerSpeechTranscript: spokenText,
            audioMetrics,
            expectedShape: {
              mode: 'ai',
              transcript: 'string',
              keywordHits: ['string'],
              closeness: 'string',
              audioNotes: ['string'],
              suggestions: ['string', 'string'],
              naturalVersion: 'string',
            },
          }),
        },
      ],
    });

    const raw = feedback.output_text || '{}';
    const parsed = parseFeedbackJson(raw);
    res.json({
      mode: 'ai',
      provider: 'openai',
      transcript: spokenText,
      keywordHits: Array.isArray(parsed.keywordHits) ? parsed.keywordHits : [],
      closeness: parsed.closeness || 'You got the main shape. Try one slower repeat.',
      audioNotes: Array.isArray(parsed.audioNotes)
        ? parsed.audioNotes.slice(0, 4)
        : makeAudioNotes(audioMetrics),
      suggestions: Array.isArray(parsed.suggestions)
        ? parsed.suggestions.slice(0, 2)
        : ['Keep the climbing keywords clear.', 'Repeat once at a calmer speed.'],
      naturalVersion: parsed.naturalVersion || targetSentence,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: 'AI feedback failed.',
      detail: error instanceof Error ? error.message : String(error),
    });
  }
});

// --- R10: frontend error inbox -------------------------------------------
// Collect errors reported by src/lib/errorReporter.ts and append them to
// docs/error-inbox.jsonl so `npm run errors:report` can cluster + analyse them.
// This endpoint is DEV/local only: in production we refuse to accept (the app
// is served statically there and errors should be reported through a real
// telemetry service instead).
const ERROR_INBOX_PATH = path.join(root, 'docs', 'error-inbox.jsonl');
const errorRateBucket = new Map();

app.post('/api/errors', async (req, res) => {
  try {
    if (isProduction) {
      res.status(403).json({ error: 'Error reporting is disabled in production.' });
      return;
    }

    // Shape validation.
    const body = req.body ?? {};
    const errors = Array.isArray(body.errors) ? body.errors : [];
    if (errors.length === 0) {
      res.status(400).json({ error: 'No errors provided.' });
      return;
    }
    if (errors.length > 50) {
      res.status(400).json({ error: 'Too many errors in one batch; send at most 50.' });
      return;
    }

    // Per-IP rate limit so a runaway page cannot spam the inbox.
    const key = `errors:${hourlyKey(new Date())}:ip:${clientIp(req)}`;
    const count = incrementCounter(key);
    if (count > 60) {
      res.status(429).json({ error: 'Error reporting rate limit reached.' });
      return;
    }

    // Validate + normalise each record, then append as one JSONL line each.
    const lines = [];
    for (const entry of errors) {
      const record = normalizeErrorRecord(entry);
      if (!record) continue;
      lines.push(JSON.stringify(record));
    }
    if (lines.length === 0) {
      res.status(400).json({ error: 'No valid error records.' });
      return;
    }

    // The inbox file lives under docs/ which is gitignored for runtime data but
    // must be created on demand. Append-only so the report can read it back.
    await fs.mkdir(path.dirname(ERROR_INBOX_PATH), { recursive: true });
    await fs.appendFile(ERROR_INBOX_PATH, `${lines.join('\n')}\n`, 'utf8');

    console.log(`[errors] recorded ${lines.length} error(s) to error-inbox.jsonl`);
    res.json({ ok: true, recorded: lines.length });
  } catch (error) {
    console.error('[errors] failed to record errors:', error);
    res.status(500).json({ error: 'Failed to record errors.' });
  }
});

function normalizeErrorRecord(entry) {
  if (!entry || typeof entry !== 'object') return null;
  const message = String(entry.message ?? '').trim();
  const stack = String(entry.stack ?? '').slice(0, 4000);
  if (!message && !stack) return null;
  return {
    id: String(entry.id ?? ''),
    kind: entry.kind === 'unhandledrejection' ? 'unhandledrejection' : 'error',
    message,
    stack,
    componentStack: String(entry.componentStack ?? '').slice(0, 2000) || undefined,
    url: String(entry.url ?? ''),
    route: String(entry.route ?? ''),
    ts: typeof entry.ts === 'string' ? entry.ts : new Date().toISOString(),
    receivedAt: new Date().toISOString(),
  };
}

if (isProduction) {
  const dist = path.join(root, 'dist');
  app.use(express.static(dist));
  app.use(async (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      next();
      return;
    }
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  const vite = await createViteServer({
    root,
    server: { middlewareMode: true },
    appType: 'custom',
  });
  app.use(vite.middlewares);
  app.use(async (req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api')) {
      next();
      return;
    }

    try {
      const template = await fs.readFile(path.join(root, 'index.html'), 'utf-8');
      const html = await vite.transformIndexHtml(req.originalUrl, template);
      res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
    } catch (error) {
      vite.ssrFixStacktrace(error);
      next(error);
    }
  });
}

app.listen(port, '127.0.0.1', () => {
  console.log(`Climb English Studio running at http://127.0.0.1:${port}`);
});

function enforceUsageLimits(req, res, next) {
  const now = new Date();
  const checks = [
    { scope: 'daily', key: dailyKey(now), limit: dailyRequestLimit },
    { scope: 'hourly', key: hourlyKey(now), limit: hourlyRequestLimit },
    {
      scope: 'per-ip-hourly',
      key: `${hourlyKey(now)}:ip:${clientIp(req)}`,
      limit: perIpHourlyRequestLimit,
    },
  ];

  for (const check of checks) {
    const nextCount = incrementCounter(check.key);
    if (nextCount > check.limit) {
      res.status(429).json({
        error: 'Daily practice feedback is temporarily paused because the usage limit was reached.',
        scope: check.scope,
        limit: check.limit,
      });
      return;
    }
  }

  next();
}

function incrementCounter(key) {
  const nextCount = getCounter(key) + 1;
  usageCounters.set(key, nextCount);
  pruneUsageCounters();
  return nextCount;
}

function getCounter(key) {
  return usageCounters.get(key) || 0;
}

function pruneUsageCounters() {
  const now = new Date();
  const currentDaily = dailyKey(now);
  const currentHourly = hourlyKey(now);
  for (const key of usageCounters.keys()) {
    if (!key.includes(currentDaily) && !key.includes(currentHourly)) {
      usageCounters.delete(key);
    }
  }
}

function dailyKey(now) {
  return `usage:${now.toISOString().slice(0, 10)}`;
}

function hourlyKey(now) {
  return `usage:${now.toISOString().slice(0, 13)}`;
}

function clientIp(req) {
  return (
    String(req.headers['cf-connecting-ip'] || '') ||
    String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    req.ip ||
    'unknown'
  );
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function normalizeAiProvider(value) {
  return String(value || 'openai').trim().toLowerCase() === 'deepseek' ? 'deepseek' : 'openai';
}

function hasUsableProviderKey() {
  return getProviderKeyStatus() === 'configured';
}

function getProviderKeyStatus() {
  return aiProvider === 'deepseek' ? getDeepSeekKeyStatus() : getOpenAiKeyStatus();
}

function getUsableOpenAiKey() {
  return hasUsableOpenAiKey() ? String(process.env.OPENAI_API_KEY).trim() : '';
}

function hasUsableOpenAiKey() {
  return getOpenAiKeyStatus() === 'configured';
}

function getOpenAiKeyStatus() {
  const value = String(process.env.OPENAI_API_KEY || '').trim();
  if (!value) return 'missing';
  if (value === 'SET' || value === 'placeholder' || value.startsWith('dummy')) {
    return 'placeholder';
  }
  if (!value.startsWith('sk-') || value.length < 40 || /\s/.test(value)) {
    return 'unknown_format';
  }
  return 'configured';
}

function getUsableDeepSeekKey() {
  return getDeepSeekKeyStatus() === 'configured' ? String(process.env.DEEPSEEK_API_KEY).trim() : '';
}

function getDeepSeekKeyStatus() {
  const value = String(process.env.DEEPSEEK_API_KEY || '').trim();
  if (!value) return 'missing';
  if (value === 'SET' || value === 'placeholder' || value.startsWith('dummy')) {
    return 'placeholder';
  }
  if (!value.startsWith('sk-') || value.length < 30 || /\s/.test(value)) {
    return 'unknown_format';
  }
  return 'configured';
}

async function generateDeepSeekCoaching({
  clipId,
  targetSentence,
  transcript,
  keywordText,
  spokenText,
  audioMetrics,
}) {
  const response = await fetch(
    `${String(process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com').replace(/\/+$/, '')}/chat/completions`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getUsableDeepSeekKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
        temperature: 0.3,
        thinking: { type: 'disabled' },
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content:
              'You are a supportive climbing English speaking coach for a young learner. Return compact JSON only. Use zh-CN for closeness, audioNotes, and suggestions. Do not grade harshly. Use audioMetrics to comment on pace, pauses, volume, pitch movement, and rhythm. Infer pronunciation or spelling issues only from transcript mismatch; do not claim to hear exact phonemes, word stress, or intonation beyond the provided metrics.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              clipId,
              targetSentence,
              sourceTranscript: transcript || targetSentence,
              keywords: keywordText,
              learnerSpeechTranscript: spokenText,
              transcriptSource: spokenText ? 'browser speech recognition' : 'none',
              audioMetrics,
              expectedShape: {
                keywordHits: ['string'],
                closeness: 'string',
                audioNotes: ['string', 'string'],
                suggestions: ['string', 'string'],
                naturalVersion: 'string',
              },
            }),
          },
        ],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await compactApiError(response, 'DeepSeek API'));
  }

  const payload = await response.json();
  return parseFeedbackJson(payload.choices?.[0]?.message?.content || '{}');
}

async function compactApiError(response, label) {
  const text = await response.text();
  return `${label} error ${response.status}: ${text.slice(0, 500)}`;
}

function makeDemoFeedback({ targetSentence, keywordText, transcript, closeness }) {
  const keywords = keywordText
    .split(',')
    .map((word) => word.trim())
    .filter(Boolean)
    .slice(0, 4);

  return {
    mode: 'demo',
    provider: 'server-demo',
    transcript: transcript || 'Demo mode: configure an AI provider key to analyze this recording.',
    keywordHits: keywords,
    closeness: closeness ||
      'Prototype feedback is active. The recording flow works; real speech analysis starts after the API key is configured.',
    audioNotes: ['Demo mode does not evaluate pronunciation, pace, pauses, stress, or intonation.'],
    suggestions: [
      'Say the sentence in two chunks, then connect it on the second repeat.',
      'Keep the climbing nouns clear first; speed can come later.',
    ],
    naturalVersion: targetSentence,
  };
}

function analyzeAudioBuffer(buffer) {
  const fallback = {
    durationSeconds: null,
    activeSpeechSeconds: null,
    rmsPercent: null,
    peakPercent: null,
    silenceRatio: null,
    pauseCount: null,
    longestPauseSeconds: null,
    estimatedWpm: null,
    loudnessVariationPercent: null,
    pitchMeanHz: null,
    pitchRangeHz: null,
    pitchVariationHz: null,
    pitchSampleCount: 0,
  };

  const parsed = parseWavPcm(buffer);
  if (!parsed) return fallback;

  const { samples, sampleRate } = parsed;
  if (!samples.length || !sampleRate) return fallback;

  let sumSquares = 0;
  let peak = 0;
  for (const sample of samples) {
    const abs = Math.abs(sample);
    peak = Math.max(peak, abs);
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / samples.length);
  const windowSize = Math.max(1, Math.floor(sampleRate * 0.05));
  const windows = [];
  for (let start = 0; start < samples.length; start += windowSize) {
    let windowSquares = 0;
    const end = Math.min(samples.length, start + windowSize);
    for (let index = start; index < end; index += 1) {
      windowSquares += samples[index] * samples[index];
    }
    windows.push({
      rms: Math.sqrt(windowSquares / Math.max(1, end - start)),
      start,
      end,
    });
  }

  const silenceThreshold = Math.max(0.012, rms * 0.35);
  const windowRmsValues = windows.map((window) => window.rms);
  const voiced = windowRmsValues.map((value) => value >= silenceThreshold);
  const firstVoice = voiced.findIndex(Boolean);
  const lastVoice = voiced.length - 1 - [...voiced].reverse().findIndex(Boolean);
  const analysisStart = firstVoice >= 0 ? firstVoice : 0;
  const analysisEnd = lastVoice >= analysisStart ? lastVoice : voiced.length - 1;
  const scoped = voiced.slice(analysisStart, analysisEnd + 1);
  const scopedRmsValues = windowRmsValues.slice(analysisStart, analysisEnd + 1);
  const silentWindows = scoped.filter((value) => !value).length;

  let pauseCount = 0;
  let longestPauseWindows = 0;
  let currentPauseWindows = 0;
  for (const isVoiced of scoped) {
    if (!isVoiced) {
      currentPauseWindows += 1;
      continue;
    }
    if (currentPauseWindows * 0.05 >= 0.25) pauseCount += 1;
    longestPauseWindows = Math.max(longestPauseWindows, currentPauseWindows);
    currentPauseWindows = 0;
  }
  if (currentPauseWindows * 0.05 >= 0.25) pauseCount += 1;
  longestPauseWindows = Math.max(longestPauseWindows, currentPauseWindows);

  const durationSeconds = samples.length / sampleRate;
  const activeSpeechSeconds = Math.max(0, scoped.length * 0.05 - silentWindows * 0.05);
  const voicedRmsValues = scopedRmsValues.filter((_value, index) => scoped[index]);
  const pitchValues = [];
  for (let scopedIndex = 0; scopedIndex < scoped.length; scopedIndex += 2) {
    if (!scoped[scopedIndex]) continue;
    const window = windows[analysisStart + scopedIndex];
    const pitchHz = estimatePitchHz(samples, sampleRate, window.start, window.end);
    if (pitchHz) pitchValues.push(pitchHz);
  }
  const pitchStats = calculatePitchStats(pitchValues);

  return {
    durationSeconds: roundMetric(durationSeconds),
    activeSpeechSeconds: roundMetric(activeSpeechSeconds),
    rmsPercent: Math.round(rms * 100),
    peakPercent: Math.round(peak * 100),
    silenceRatio: scoped.length > 0 ? roundMetric(silentWindows / scoped.length) : null,
    pauseCount,
    longestPauseSeconds: roundMetric(longestPauseWindows * 0.05),
    estimatedWpm: null,
    loudnessVariationPercent: calculateVariationPercent(voicedRmsValues),
    pitchMeanHz: pitchStats.mean,
    pitchRangeHz: pitchStats.range,
    pitchVariationHz: pitchStats.variation,
    pitchSampleCount: pitchStats.count,
  };
}

function parseWavPcm(buffer) {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF') return null;

  let offset = 12;
  let fmt = null;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;

    if (chunkId === 'fmt ') {
      fmt = {
        audioFormat: buffer.readUInt16LE(chunkStart),
        channels: buffer.readUInt16LE(chunkStart + 2),
        sampleRate: buffer.readUInt32LE(chunkStart + 4),
        bitsPerSample: buffer.readUInt16LE(chunkStart + 14),
      };
    } else if (chunkId === 'data') {
      dataOffset = chunkStart;
      dataSize = chunkSize;
      break;
    }

    offset = chunkStart + chunkSize + (chunkSize % 2);
  }

  if (!fmt || fmt.audioFormat !== 1 || fmt.bitsPerSample !== 16 || dataOffset < 0) {
    return null;
  }

  const blockAlign = fmt.channels * 2;
  const frameCount = Math.floor(dataSize / blockAlign);
  const samples = new Float32Array(frameCount);
  for (let frame = 0; frame < frameCount; frame += 1) {
    let sampleSum = 0;
    const frameOffset = dataOffset + frame * blockAlign;
    for (let channel = 0; channel < fmt.channels; channel += 1) {
      sampleSum += buffer.readInt16LE(frameOffset + channel * 2) / 32768;
    }
    samples[frame] = sampleSum / fmt.channels;
  }

  return { samples, sampleRate: fmt.sampleRate };
}

function addSpeechRate(audioMetrics, spokenText) {
  const words = String(spokenText || '').trim().match(/[A-Za-z']+/g) || [];
  const activeSeconds = audioMetrics.activeSpeechSeconds || audioMetrics.durationSeconds || 0;
  return {
    ...audioMetrics,
    estimatedWpm:
      words.length > 0 && activeSeconds > 0
        ? Math.round((words.length / activeSeconds) * 60)
        : null,
  };
}

function makeAudioNotes(audioMetrics) {
  const notes = [];
  if (typeof audioMetrics.estimatedWpm === 'number') {
    notes.push(`估算语速约 ${audioMetrics.estimatedWpm} WPM。`);
  }
  if (typeof audioMetrics.longestPauseSeconds === 'number') {
    notes.push(`最长停顿约 ${audioMetrics.longestPauseSeconds}s。`);
  }
  if (typeof audioMetrics.pitchRangeHz === 'number' && audioMetrics.pitchSampleCount > 2) {
    notes.push(`语调起伏约 ${audioMetrics.pitchRangeHz}Hz。`);
  }
  if (typeof audioMetrics.loudnessVariationPercent === 'number') {
    notes.push(`响度变化约 ${audioMetrics.loudnessVariationPercent}%，可用来观察重音是否稳定。`);
  }
  if (typeof audioMetrics.peakPercent === 'number' && notes.length < 4) {
    notes.push(`峰值音量约 ${audioMetrics.peakPercent}%。`);
  }
  return notes;
}

function estimatePitchHz(samples, sampleRate, start, end) {
  const minHz = 75;
  const maxHz = 500;
  const minLag = Math.floor(sampleRate / maxHz);
  const maxLag = Math.floor(sampleRate / minHz);
  const analysisEnd = Math.min(end, start + 2048);
  const length = analysisEnd - start;
  if (length <= maxLag + 2) return null;

  const stride = length > 1500 ? 2 : 1;
  let mean = 0;
  let count = 0;
  for (let index = start; index < analysisEnd; index += stride) {
    mean += samples[index];
    count += 1;
  }
  mean /= Math.max(1, count);

  let bestLag = 0;
  let bestScore = 0;
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let correlation = 0;
    let energyA = 0;
    let energyB = 0;
    for (let index = start; index < analysisEnd - lag; index += stride) {
      const a = samples[index] - mean;
      const b = samples[index + lag] - mean;
      correlation += a * b;
      energyA += a * a;
      energyB += b * b;
    }
    const score = correlation / Math.sqrt(Math.max(Number.EPSILON, energyA * energyB));
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }

  return bestScore >= 0.35 && bestLag > 0 ? Math.round(sampleRate / bestLag) : null;
}

function calculatePitchStats(values) {
  const cleanValues = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!cleanValues.length) {
    return {
      mean: null,
      range: null,
      variation: null,
      count: 0,
    };
  }

  const mean = cleanValues.reduce((total, value) => total + value, 0) / cleanValues.length;
  const variation = Math.sqrt(
    cleanValues.reduce((total, value) => total + (value - mean) ** 2, 0) / cleanValues.length,
  );
  const range = percentile(cleanValues, 0.9) - percentile(cleanValues, 0.1);

  return {
    mean: Math.round(mean),
    range: Math.round(range),
    variation: Math.round(variation),
    count: cleanValues.length,
  };
}

function calculateVariationPercent(values) {
  const cleanValues = values.filter((value) => Number.isFinite(value) && value > 0);
  if (cleanValues.length < 2) return null;

  const mean = cleanValues.reduce((total, value) => total + value, 0) / cleanValues.length;
  if (mean <= 0) return null;

  const variation = Math.sqrt(
    cleanValues.reduce((total, value) => total + (value - mean) ** 2, 0) / cleanValues.length,
  );
  return Math.round((variation / mean) * 100);
}

function percentile(sortedValues, ratio) {
  if (!sortedValues.length) return 0;
  const index = (sortedValues.length - 1) * ratio;
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return sortedValues[lower] + (sortedValues[upper] - sortedValues[lower]) * (index - lower);
}

function roundMetric(value) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

function parseFeedbackJson(raw) {
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
