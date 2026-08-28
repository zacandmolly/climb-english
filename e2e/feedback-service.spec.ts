import { expect, test, type Page } from '@playwright/test';

const coachSelector = '.coach-pane';

async function installSpeechRecognitionProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as typeof window & {
      __speechRecognitionStarts?: number;
      SpeechRecognition?: new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: ((event: unknown) => void) | null;
        onerror: ((event: unknown) => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
      webkitSpeechRecognition?: new () => {
        continuous: boolean;
        interimResults: boolean;
        lang: string;
        onresult: ((event: unknown) => void) | null;
        onerror: ((event: unknown) => void) | null;
        onend: (() => void) | null;
        start: () => void;
        stop: () => void;
      };
    };
    target.__speechRecognitionStarts = 0;

    class FakeSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = '';
      onresult: ((event: unknown) => void) | null = null;
      onerror: ((event: unknown) => void) | null = null;
      onend: (() => void) | null = null;

      start() {
        target.__speechRecognitionStarts = (target.__speechRecognitionStarts ?? 0) + 1;
      }

      stop() {
        this.onend?.();
      }
    }

    for (const property of ['SpeechRecognition', 'webkitSpeechRecognition'] as const) {
      Object.defineProperty(target, property, {
        configurable: true,
        value: FakeSpeechRecognition,
      });
    }
  });
}

async function installRecordingCleanupProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as typeof window & {
      __mediaTrackStops?: number;
      __objectUrlRevocations?: number;
    };
    target.__mediaTrackStops = 0;
    target.__objectUrlRevocations = 0;

    const originalStop = MediaStreamTrack.prototype.stop;
    Object.defineProperty(MediaStreamTrack.prototype, 'stop', {
      configurable: true,
      value(this: MediaStreamTrack) {
        target.__mediaTrackStops = (target.__mediaTrackStops ?? 0) + 1;
        return originalStop.call(this);
      },
    });

    const originalRevokeObjectUrl = URL.revokeObjectURL.bind(URL);
    URL.revokeObjectURL = (url) => {
      target.__objectUrlRevocations = (target.__objectUrlRevocations ?? 0) + 1;
      originalRevokeObjectUrl(url);
    };
  });
}

async function installDelayedAudioResumeProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as typeof window & {
      __releaseFirstAudioResume?: () => void;
      __firstAudioResumeWaiting?: boolean;
    };
    const AudioContextConstructor = window.AudioContext;
    const originalResume = AudioContextConstructor.prototype.resume;
    let releaseFirstResume = () => {};
    const firstResumeGate = new Promise<void>((resolve) => {
      releaseFirstResume = resolve;
    });
    let shouldDelay = true;
    target.__firstAudioResumeWaiting = false;

    AudioContextConstructor.prototype.resume = async function resume() {
      if (shouldDelay) {
        shouldDelay = false;
        target.__firstAudioResumeWaiting = true;
        await firstResumeGate;
        target.__firstAudioResumeWaiting = false;
      }
      return originalResume.call(this);
    };
    target.__releaseFirstAudioResume = releaseFirstResume;
  });
}

async function recordOnce(page: Page) {
  const coach = page.locator(coachSelector);
  await expect(coach).toBeVisible();
  await coach.getByRole('button', { name: '开始录音' }).click();
  const stopButton = coach.getByRole('button', { name: '停止录音' });
  await expect(stopButton).toBeVisible();
  await page.waitForTimeout(1_000);
  await stopButton.click();
  await expect(coach.locator('.recording-status')).toContainText('已录音');
  await expect(coach.locator('audio')).toHaveCount(1);
  return coach;
}

async function openCourseCoach(page: Page): Promise<void> {
  await page.getByRole('button', { name: '返回素材列表' }).click();
  await page.getByRole('button', { name: '今天', exact: true }).click();
  await expect(page.locator('.coach-pane[aria-label="口语教练"]')).toBeVisible();
}

test('shows a truthful unavailable state when health has no AI provider', async ({ page }) => {
  let feedbackRequestCount = 0;
  await installSpeechRecognitionProbe(page);
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, ai: false }),
    });
  });
  await page.route('**/api/speaking-feedback', async (route) => {
    feedbackRequestCount += 1;
    await route.fulfill({ status: 500, body: 'unexpected request' });
  });

  await page.goto('/');

  const notice = page.locator('[data-feedback-service="unavailable"]').first();
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('AI 反馈暂不可用');

  const coach = await recordOnce(page);
  await coach.getByRole('button', { name: '离线反馈' }).click();
  await expect(coach.locator('.feedback-transcript')).toContainText('录音没有上传');
  expect(feedbackRequestCount).toBe(0);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __speechRecognitionStarts?: number }).__speechRecognitionStarts
    )
  ).toBe(0);
});

test('keeps online upload copy truthful until AI feedback arrives', async ({ page }) => {
  await installSpeechRecognitionProbe(page);
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, ai: true }),
    });
  });

  let releaseResponse = () => {};
  const responseGate = new Promise<void>((resolve) => {
    releaseResponse = resolve;
  });
  let markRequestReceived = () => {};
  const requestReceived = new Promise<void>((resolve) => {
    markRequestReceived = resolve;
  });
  await page.route('**/api/speaking-feedback', async (route) => {
    markRequestReceived();
    await responseGate;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'ai',
        provider: 'openai',
        transcript: 'Trust your feet.',
        keywordHits: ['feet'],
        closeness: '接近原句',
        audioNotes: ['重音清楚'],
        suggestions: ['再慢一点'],
        naturalVersion: 'Trust your feet.',
      }),
    });
  });

  await page.goto('/');

  const notice = page.locator('[data-feedback-service="online"]').first();
  await expect(notice).toBeVisible();
  await expect(notice).toContainText('AI 反馈在线');

  const coach = await recordOnce(page);
  await coach.getByRole('button', { name: 'AI 反馈' }).click();
  await requestReceived;
  await expect(coach.getByRole('button', { name: '分析中' })).toBeDisabled();
  await expect(coach).not.toContainText('录音没有上传');
  releaseResponse();
  await expect(coach.locator('.feedback-mode')).toHaveText('AI 反馈');
  await expect(coach.locator('.feedback-transcript')).toHaveText('Trust your feet.');
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __speechRecognitionStarts?: number }).__speechRecognitionStarts
    )
  ).toBe(1);
});

test('changing the target aborts in-flight feedback without showing a stale result', async ({
  page,
}) => {
  await installSpeechRecognitionProbe(page);
  await page.addInitScript(() => {
    const target = window as typeof window & {
      __releaseStaleFeedback?: () => void;
      __staleFeedbackAborted?: boolean;
      __staleFeedbackDelivered?: boolean;
    };
    const originalFetch = window.fetch.bind(window);
    let releaseStaleFeedback = () => {};
    const responseGate = new Promise<void>((resolve) => {
      releaseStaleFeedback = resolve;
    });
    target.__releaseStaleFeedback = releaseStaleFeedback;
    target.__staleFeedbackAborted = false;
    target.__staleFeedbackDelivered = false;

    window.fetch = async (input, init) => {
      const response = await originalFetch(input, init);
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes('/api/speaking-feedback')) return response;

      const signal = init?.signal;
      if (signal?.aborted) {
        target.__staleFeedbackAborted = true;
      } else {
        signal?.addEventListener(
          'abort',
          () => {
            target.__staleFeedbackAborted = true;
          },
          { once: true }
        );
      }
      await responseGate;
      target.__staleFeedbackDelivered = true;
      return response;
    };
  });
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, ai: true }),
    });
  });

  let markRequestReceived = () => {};
  const requestReceived = new Promise<void>((resolve) => {
    markRequestReceived = resolve;
  });
  await page.route('**/api/speaking-feedback', async (route) => {
    markRequestReceived();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        mode: 'ai',
        provider: 'openai',
        transcript: 'STALE RESULT',
        keywordHits: [],
        closeness: 'stale',
        audioNotes: [],
        suggestions: [],
        naturalVersion: 'STALE RESULT',
      }),
    });
  });

  await page.goto('/');
  await expect(page.locator('[data-feedback-service="online"]').first()).toBeVisible();
  const coach = await recordOnce(page);
  await coach.getByRole('button', { name: 'AI 反馈' }).click();
  await requestReceived;
  await expect(coach.getByRole('button', { name: '分析中' })).toBeDisabled();

  const cueButtons = page.locator('button.subtitle-card');
  expect(await cueButtons.count()).toBeGreaterThan(1);
  await cueButtons.nth(1).click();
  await expect(coach.getByRole('button', { name: 'AI 反馈' })).toBeDisabled();
  await expect(coach.locator('audio')).toHaveCount(0);
  await expect(coach.locator('.feedback-mode')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __staleFeedbackAborted?: boolean }).__staleFeedbackAborted
      )
    )
    .toBe(true);

  await page.evaluate(() => {
    (window as typeof window & { __releaseStaleFeedback?: () => void }).__releaseStaleFeedback?.();
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __staleFeedbackDelivered?: boolean })
            .__staleFeedbackDelivered
      )
    )
    .toBe(true);
  await page.waitForTimeout(0);
  await expect(coach).not.toContainText('STALE RESULT');
  await expect(page.locator('[data-feedback-service="online"]').first()).toBeVisible();
});

test('distinguishes a failed upload from recording that never left the browser', async ({
  page,
}) => {
  await installSpeechRecognitionProbe(page);
  await page.route(/bern-2025-wb-rescut\.video\.ts(?:\?.*)?$/, (route) => route.abort('failed'));
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, ai: true }),
    });
  });
  let feedbackRequestCount = 0;
  await page.route('**/api/speaking-feedback', async (route) => {
    feedbackRequestCount += 1;
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'temporarily unavailable' }),
    });
  });

  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('字幕数据加载失败');
  await openCourseCoach(page);
  await expect(page.locator('[data-feedback-service="online"]').first()).toBeVisible();
  const coach = await recordOnce(page);
  await coach.getByRole('button', { name: 'AI 反馈' }).click();

  await expect(coach.locator('.feedback-transcript')).toContainText(
    '无法确认服务端是否已经接收或处理'
  );
  await expect(page.locator('[data-feedback-service="unavailable"]').first()).toBeVisible();
  expect(feedbackRequestCount).toBe(1);
  expect(
    await page.evaluate(
      () =>
        (window as typeof window & { __speechRecognitionStarts?: number }).__speechRecognitionStarts
    )
  ).toBe(1);

  await coach.getByRole('button', { name: '离线反馈' }).click();
  await expect(coach.locator('.feedback-transcript')).toContainText(
    '无法确认服务端是否已经接收或处理'
  );
  await expect(coach.locator('.feedback-transcript')).not.toContainText('录音没有上传');
  expect(feedbackRequestCount).toBe(1);
});

test('changing the coach target stops capture and clears the previous recording', async ({
  page,
}) => {
  await installRecordingCleanupProbe(page);
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, ai: false }),
    });
  });

  await page.goto('/');
  const coach = page.locator('.coach-pane[aria-label="Speaking coach"]');
  await expect(coach).toBeVisible();
  const cueButtons = page.locator('button.subtitle-card');
  expect(await cueButtons.count()).toBeGreaterThan(1);

  await coach.getByRole('button', { name: '开始录音' }).click();
  await expect(coach.getByRole('button', { name: '停止录音' })).toBeVisible();
  await cueButtons.nth(1).click();
  await expect(coach.getByRole('button', { name: '开始录音' })).toBeVisible();
  await expect(coach.locator('.recording-status')).toHaveCount(0);
  await expect(coach.locator('audio')).toHaveCount(0);
  expect(
    await page.evaluate(
      () => (window as typeof window & { __mediaTrackStops?: number }).__mediaTrackStops
    )
  ).toBeGreaterThan(0);

  await recordOnce(page);
  await cueButtons.first().click();
  await expect(coach.locator('audio')).toHaveCount(0);
  await expect(coach.locator('.recording-status')).toHaveCount(0);
  await expect(coach.getByRole('button', { name: '离线反馈' })).toBeDisabled();
  expect(
    await page.evaluate(
      () => (window as typeof window & { __objectUrlRevocations?: number }).__objectUrlRevocations
    )
  ).toBeGreaterThan(0);
});

test('a delayed old recorder startup cannot stop or overwrite the next recording', async ({
  page,
}) => {
  await installRecordingCleanupProbe(page);
  await installDelayedAudioResumeProbe(page);
  await page.route('**/api/health', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ ok: true, ai: false }),
    });
  });

  await page.goto('/');
  const coach = page.locator('.coach-pane[aria-label="Speaking coach"]');
  const cueButtons = page.locator('button.subtitle-card');
  await coach.getByRole('button', { name: '开始录音' }).click();
  await expect(coach.getByRole('button', { name: '连接麦克风' })).toBeDisabled();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as typeof window & { __firstAudioResumeWaiting?: boolean })
            .__firstAudioResumeWaiting ?? false
      )
    )
    .toBe(true);

  await cueButtons.nth(1).click();
  await expect(coach.getByRole('button', { name: '开始录音' })).toBeVisible();
  const stopsAfterTargetChange = await page.evaluate(
    () => (window as typeof window & { __mediaTrackStops?: number }).__mediaTrackStops ?? 0
  );
  expect(stopsAfterTargetChange).toBeGreaterThan(0);

  await coach.getByRole('button', { name: '开始录音' }).click();
  await expect(coach.getByRole('button', { name: '停止录音' })).toBeVisible();
  const stopsWithNextRecordingActive = await page.evaluate(
    () => (window as typeof window & { __mediaTrackStops?: number }).__mediaTrackStops ?? 0
  );

  await page.evaluate(() => {
    (
      window as typeof window & { __releaseFirstAudioResume?: () => void }
    ).__releaseFirstAudioResume?.();
  });
  await page.waitForTimeout(100);
  await expect(coach.getByRole('button', { name: '停止录音' })).toBeVisible();
  expect(
    await page.evaluate(
      () => (window as typeof window & { __mediaTrackStops?: number }).__mediaTrackStops ?? 0
    )
  ).toBe(stopsWithNextRecordingActive);

  await coach.getByRole('button', { name: '停止录音' }).click();
  await expect(coach.locator('audio')).toBeVisible();
});
