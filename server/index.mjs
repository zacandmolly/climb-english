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

    if (!hasUsableProviderKey()) {
      res.json(makeDemoFeedback({ targetSentence, keywordText }));
      return;
    }

    if (aiProvider === 'deepseek') {
      if (!browserSpokenText) {
        res.json(
          makeDemoFeedback({
            targetSentence,
            keywordText,
            transcript:
              'Demo mode: DeepSeek can coach text, but this browser did not provide a speech transcript.',
            closeness:
              'DeepSeek is configured for feedback. Start recording in Chrome and allow speech recognition so the browser can send spoken text to the M1 API.',
          }),
        );
        return;
      }

      const coaching = await generateDeepSeekCoaching({
        clipId,
        targetSentence,
        transcript,
        keywordText,
        spokenText: browserSpokenText,
      });
      res.json({
        mode: 'ai',
        provider: 'deepseek',
        transcript: browserSpokenText,
        keywordHits: Array.isArray(coaching.keywordHits) ? coaching.keywordHits.slice(0, 8) : [],
        closeness: coaching.closeness || '你已经说出了主要意思，下一遍放慢一点会更清楚。',
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
            expectedShape: {
              mode: 'ai',
              transcript: 'string',
              keywordHits: ['string'],
              closeness: 'string',
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
              'You are a supportive climbing English speaking coach for a young learner. Return compact JSON only. Do not grade harshly. Use zh-CN for closeness and suggestions. Focus on confidence, climbing words, and one next repeat.',
          },
          {
            role: 'user',
            content: JSON.stringify({
              clipId,
              targetSentence,
              sourceTranscript: transcript || targetSentence,
              keywords: keywordText,
              learnerSpeechTranscript: spokenText,
              expectedShape: {
                keywordHits: ['string'],
                closeness: 'string',
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
    suggestions: [
      'Say the sentence in two chunks, then connect it on the second repeat.',
      'Keep the climbing nouns clear first; speed can come later.',
    ],
    naturalVersion: targetSentence,
  };
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
