const DEFAULT_ALLOWED_ORIGINS = [
  'https://zacandmolly.github.io',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];

const DEFAULT_DAILY_LIMIT = 300;
const DEFAULT_HOURLY_LIMIT = 90;
const DEFAULT_PER_IP_HOURLY_LIMIT = 35;
const DEFAULT_MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const ONE_HOUR_SECONDS = 60 * 60;
const ONE_DAY_SECONDS = 24 * ONE_HOUR_SECONDS;

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);

      if (request.method === 'OPTIONS') {
        return withCors(new Response(null, { status: 204 }), request, env);
      }

      if (url.pathname === '/api/health' && request.method === 'GET') {
        return jsonResponse(
          {
            ok: true,
            ai: hasUsableOpenAiKey(env),
            aiStatus: getOpenAiKeyStatus(env),
            usageStore: Boolean(env.FEEDBACK_USAGE),
          },
          200,
          request,
          env,
        );
      }

      if (url.pathname === '/api/usage' && request.method === 'GET') {
        return handleUsage(request, env);
      }

      if (url.pathname === '/api/speaking-feedback' && request.method === 'POST') {
        return handleSpeakingFeedback(request, env);
      }

      return jsonResponse({ error: 'Not found.' }, 404, request, env);
    } catch (error) {
      console.error(error);
      return jsonResponse({ error: 'Feedback API failed.' }, 500, request, env);
    }
  },
};

async function handleSpeakingFeedback(request, env) {
  if (!isAllowedOrigin(request, env)) {
    return jsonResponse({ error: 'Origin is not allowed.' }, 403, request, env);
  }

  if (!hasUsableOpenAiKey(env)) {
    return jsonResponse(
      {
        error: 'OPENAI_API_KEY is not configured.',
        aiStatus: getOpenAiKeyStatus(env),
      },
      503,
      request,
      env,
    );
  }

  const limits = getLimits(env);
  const limitResult = await applyUsageLimits(request, env, limits);
  if (!limitResult.allowed) {
    return jsonResponse(
      {
        error: 'Daily practice feedback is temporarily paused because the usage limit was reached.',
        limit: limitResult.limit,
        scope: limitResult.scope,
      },
      429,
      request,
      env,
    );
  }

  const formData = await request.formData();
  const audio = formData.get('audio');
  const targetSentence = String(formData.get('targetSentence') || '').trim();
  const transcript = String(formData.get('transcript') || '').trim();
  const keywords = String(formData.get('keywords') || '').trim();
  const clipId = String(formData.get('clipId') || '').trim();
  const durationSeconds = Number(formData.get('durationSeconds') || 0);

  if (!targetSentence || !clipId) {
    return jsonResponse({ error: 'Missing clipId or targetSentence.' }, 400, request, env);
  }

  if (!isFileLike(audio)) {
    return jsonResponse({ error: 'No recording received.' }, 400, request, env);
  }

  if (audio.size > limits.maxAudioBytes) {
    return jsonResponse({ error: 'Recording is too large.' }, 413, request, env);
  }

  const spokenText = await transcribeAudio({ audio, keywords, durationSeconds, env });
  const coaching = await generateCoaching({
    clipId,
    targetSentence,
    transcript,
    keywords,
    spokenText,
    env,
  });

  return jsonResponse(
    {
      mode: 'ai',
      transcript: spokenText,
      keywordHits: Array.isArray(coaching.keywordHits) ? coaching.keywordHits.slice(0, 8) : [],
      closeness: coaching.closeness || 'You got the main shape. Try one slower repeat.',
      suggestions: Array.isArray(coaching.suggestions)
        ? coaching.suggestions.slice(0, 2)
        : ['Keep the climbing keywords clear.', 'Repeat once at a calmer speed.'],
      naturalVersion: coaching.naturalVersion || targetSentence,
    },
    200,
    request,
    env,
  );
}

async function transcribeAudio({ audio, keywords, durationSeconds, env }) {
  const audioForm = new FormData();
  audioForm.append('file', audio, audio.name || 'shadowing.wav');
  audioForm.append('model', env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe');
  audioForm.append('response_format', 'json');
  audioForm.append(
    'prompt',
    [
      'This is a short climbing English shadowing recording.',
      `Expected climbing vocabulary and names: ${keywords}`,
      durationSeconds > 0 ? `Approximate recording duration: ${durationSeconds}s.` : '',
    ]
      .filter(Boolean)
      .join(' '),
  );

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
    body: audioForm,
  });

  if (!response.ok) {
    throw new Error(await compactOpenAIError(response));
  }

  const payload = await response.json();
  return String(payload.text || '').trim();
}

async function generateCoaching({ clipId, targetSentence, transcript, keywords, spokenText, env }) {
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.OPENAI_FEEDBACK_MODEL || 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content:
            'You are a supportive climbing English speaking coach for a young learner. Return compact JSON only. Do not grade harshly. Focus on confidence, climbing words, and one next repeat.',
        },
        {
          role: 'user',
          content: JSON.stringify({
            clipId,
            targetSentence,
            sourceTranscript: transcript || targetSentence,
            keywords,
            learnerSpeechTranscript: spokenText,
            outputLanguage: 'zh-CN',
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
  });

  if (!response.ok) {
    throw new Error(await compactOpenAIError(response));
  }

  const payload = await response.json();
  return parseFeedbackJson(extractOutputText(payload));
}

async function handleUsage(request, env) {
  if (!env.API_ADMIN_TOKEN || request.headers.get('authorization') !== `Bearer ${env.API_ADMIN_TOKEN}`) {
    return jsonResponse({ error: 'Unauthorized.' }, 401, request, env);
  }

  const now = new Date();
  const limits = getLimits(env);
  const dailyKey = getDailyKey(now);
  const hourlyKey = getHourlyKey(now);

  return jsonResponse(
    {
      ok: true,
      date: dailyKey,
      hour: hourlyKey,
      usage: {
        daily: await readCounter(env, dailyKey),
        hourly: await readCounter(env, hourlyKey),
      },
      limits: {
        daily: limits.daily,
        hourly: limits.hourly,
        perIpHourly: limits.perIpHourly,
        maxAudioBytes: limits.maxAudioBytes,
      },
    },
    200,
    request,
    env,
  );
}

async function applyUsageLimits(request, env, limits) {
  const now = new Date();
  const clientIp = getClientIp(request);
  const checks = [
    { scope: 'daily', key: getDailyKey(now), limit: limits.daily, ttl: ONE_DAY_SECONDS * 2 },
    { scope: 'hourly', key: getHourlyKey(now), limit: limits.hourly, ttl: ONE_DAY_SECONDS },
    {
      scope: 'per-ip-hourly',
      key: `${getHourlyKey(now)}:ip:${clientIp}`,
      limit: limits.perIpHourly,
      ttl: ONE_DAY_SECONDS,
    },
  ];

  for (const check of checks) {
    const result = await incrementCounter(env, check.key, check.limit, check.ttl);
    if (!result.allowed) return { allowed: false, scope: check.scope, limit: check.limit };
  }

  return { allowed: true };
}

async function incrementCounter(env, key, limit, ttl) {
  if (!env.FEEDBACK_USAGE) return { allowed: true, value: 0 };

  const current = Number((await env.FEEDBACK_USAGE.get(key)) || 0);
  if (current >= limit) return { allowed: false, value: current };

  const next = current + 1;
  await env.FEEDBACK_USAGE.put(key, String(next), { expirationTtl: ttl });
  return { allowed: true, value: next };
}

async function readCounter(env, key) {
  if (!env.FEEDBACK_USAGE) return null;
  return Number((await env.FEEDBACK_USAGE.get(key)) || 0);
}

function getLimits(env) {
  return {
    daily: getPositiveInteger(env.DAILY_REQUEST_LIMIT, DEFAULT_DAILY_LIMIT),
    hourly: getPositiveInteger(env.HOURLY_REQUEST_LIMIT, DEFAULT_HOURLY_LIMIT),
    perIpHourly: getPositiveInteger(env.PER_IP_HOURLY_LIMIT, DEFAULT_PER_IP_HOURLY_LIMIT),
    maxAudioBytes: getPositiveInteger(env.MAX_AUDIO_BYTES, DEFAULT_MAX_AUDIO_BYTES),
  };
}

function getDailyKey(now) {
  return `usage:${now.toISOString().slice(0, 10)}`;
}

function getHourlyKey(now) {
  return `usage:${now.toISOString().slice(0, 13)}`;
}

function getClientIp(request) {
  return (
    request.headers.get('cf-connecting-ip') ||
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    'unknown'
  );
}

function getPositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function hasUsableOpenAiKey(env) {
  return getOpenAiKeyStatus(env) === 'configured';
}

function getOpenAiKeyStatus(env) {
  const value = String(env.OPENAI_API_KEY || '').trim();
  if (!value) return 'missing';
  if (value === 'SET' || value === 'placeholder' || value.startsWith('dummy')) {
    return 'placeholder';
  }
  if (!value.startsWith('sk-') || value.length < 40 || /\s/.test(value)) {
    return 'unknown_format';
  }
  return 'configured';
}

function isAllowedOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  return getAllowedOrigins(env).includes(origin);
}

function getAllowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

function withCors(response, request, env) {
  const origin = request.headers.get('origin');
  const allowedOrigin = origin && getAllowedOrigins(env).includes(origin) ? origin : getAllowedOrigins(env)[0];
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', allowedOrigin);
  headers.set('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization,Content-Type');
  headers.set('Vary', 'Origin');
  return new Response(response.body, { status: response.status, headers });
}

function jsonResponse(body, status, request, env) {
  return withCors(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }),
    request,
    env,
  );
}

function isFileLike(value) {
  return value && typeof value === 'object' && typeof value.arrayBuffer === 'function' && Number.isFinite(value.size);
}

async function compactOpenAIError(response) {
  const text = await response.text();
  return `OpenAI API error ${response.status}: ${text.slice(0, 500)}`;
}

function extractOutputText(payload) {
  if (typeof payload.output_text === 'string') return payload.output_text;

  const parts = [];
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === 'string') parts.push(content.text);
    }
  }
  return parts.join('\n');
}

function parseFeedbackJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    const match = String(raw).match(/\{[\s\S]*\}/);
    if (!match) return {};
    try {
      return JSON.parse(match[0]);
    } catch {
      return {};
    }
  }
}
