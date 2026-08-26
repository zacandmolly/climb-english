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
