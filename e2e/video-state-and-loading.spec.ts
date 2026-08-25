import { expect, test, type Page } from '@playwright/test';

const TECHNIQUE_TITLE = 'A COMPLETE Guide to CLIMBING MOVEMENT AND TECHNIQUE';
const TECHNIQUE_ID = 'a-complete-guide-to-climbing-movement-and-technique-gtiggs-y2ny';
const INNSBRUCK_TITLE = "Men's Boulder Final | Innsbruck 2026 智能重切";
const VIDEO_SESSION_KEY = 'climb-english-video-session-v1';
const LEARNING_PROGRESS_KEY = 'climb-english-learning-progress-v2';

async function selectVideo(page: Page, title: string): Promise<void> {
  await page.locator('.video-option').filter({ hasText: title }).click();
}

test('video material and cue survive navigation and reload without changing course progress', async ({
  page,
}) => {
  await page.goto('/');
  const progressBefore = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, LEARNING_PROGRESS_KEY);

  await selectVideo(page, TECHNIQUE_TITLE);
  await expect(page.locator('video.local-video')).toBeAttached();
  await page.waitForFunction(() => {
    const video = document.querySelector<HTMLVideoElement>('video.local-video');
    return Boolean(video && Number.isFinite(video.duration) && video.readyState >= 2);
  });

  await page.locator('[data-cue-index="3"]').click();
  await expect(page.locator('.subtitle-card.active')).toHaveAttribute('data-cue-index', '3');
  await expect
    .poll(() =>
      page.evaluate(
        ({ key, videoId }) => {
          const raw = localStorage.getItem(key);
          if (!raw) return null;
          const state = JSON.parse(raw) as {
            activeVideoId?: string;
            positions?: Record<string, { cueIndex?: number; currentTime?: number }>;
          };
          const position = state.positions?.[videoId];
          return {
            activeVideoId: state.activeVideoId,
            cueIndex: position?.cueIndex,
            currentTime: position?.currentTime,
          };
        },
        { key: VIDEO_SESSION_KEY, videoId: TECHNIQUE_ID }
      )
    )
    .toMatchObject({ activeVideoId: TECHNIQUE_ID, cueIndex: 3 });
  await expect
    .poll(() =>
      page.evaluate(
        ({ key, videoId }) => {
          const raw = localStorage.getItem(key);
          if (!raw) return -1;
          const state = JSON.parse(raw) as {
            positions?: Record<string, { currentTime?: number }>;
          };
          return state.positions?.[videoId]?.currentTime ?? -1;
        },
        { key: VIDEO_SESSION_KEY, videoId: TECHNIQUE_ID }
      )
    )
    .toBeGreaterThan(0);

  await page.getByRole('button', { name: '听力' }).click();
  await expect(page.locator('.video-studio-preserver')).toBeHidden();
  await expect
    .poll(() => page.locator('video.local-video').evaluate((video) => video.paused))
    .toBe(true);

  await page.getByRole('button', { name: '今天' }).click();
  await expect(page.locator('.subtitle-card.active')).toHaveAttribute('data-cue-index', '3');
  await expect(page.getByRole('button', { name: '播放本句' })).toBeVisible();

  const progressAfterNavigation = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, LEARNING_PROGRESS_KEY);
  expect(progressAfterNavigation).toEqual(progressBefore);

  await page.reload();
  await expect(page.locator('.video-option.active')).toContainText(TECHNIQUE_TITLE);
  await expect(page.locator('.subtitle-card.active')).toHaveAttribute('data-cue-index', '3');
  await expect(page.getByRole('button', { name: '播放本句' })).toBeVisible();
  await expect
    .poll(() => page.locator('video.local-video').evaluate((video) => video.currentTime))
    .toBeGreaterThan(0);
  const progressAfterReload = await page.evaluate((key) => {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, LEARNING_PROGRESS_KEY);
  expect(progressAfterReload).toEqual(progressBefore);
});

test('removed cue positions clamp safely and incompatible storage does not jump materials', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(
    ({ key, videoId }) => {
      localStorage.setItem(
        key,
        JSON.stringify({
          version: 1,
          activeVideoId: videoId,
          positions: {
            [videoId]: {
              cueId: 'removed-cue',
              cueIndex: 99_999,
              currentTime: 99_999,
              updatedAt: new Date().toISOString(),
            },
          },
        })
      );
    },
    { key: VIDEO_SESSION_KEY, videoId: TECHNIQUE_ID }
  );
  await page.reload();
  await expect(page.locator('.subtitle-card.active')).toHaveAttribute('data-cue-index', '98');

  await page.evaluate((key) => {
    localStorage.setItem(
      key,
      JSON.stringify({ version: 999, activeVideoId: 'innsbruck-2026-mb-full', positions: {} })
    );
  }, VIDEO_SESSION_KEY);
  await page.reload();
  await expect(page.locator('.video-option.active')).toHaveCount(0);
  await expect(page.locator('section[aria-label="今日练习"]')).toBeVisible();
});

test('failed subtitle chunk shows details and succeeds after retry without a page error', async ({
  page,
}) => {
  let chunkRequests = 0;
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route(/innsbruck-2026-mb-full\.video\.ts(?:\?.*)?$/, async (route) => {
    chunkRequests += 1;
    if (chunkRequests === 1) {
      await route.abort('failed');
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  await selectVideo(page, INNSBRUCK_TITLE);
  const alert = page.getByRole('alert');
  await expect(alert).toContainText('字幕数据加载失败');
  await expect(page.getByTestId('video-load-error-meta')).toContainText('innsbruck-2026-mb-full');
  await expect(page.getByTestId('video-load-error-meta')).toContainText('.video.ts');

  await page.getByRole('button', { name: '重试' }).click();
  await expect(page.locator('section[aria-label="Bilingual subtitle studio"]')).toBeVisible();
  await expect(page.locator('.subtitle-card')).toHaveCount(2242);
  expect(chunkRequests).toBeGreaterThanOrEqual(2);
  expect(pageErrors).toEqual([]);
});

test('switching material clears a previous subtitle chunk error', async ({ page }) => {
  await page.route(/innsbruck-2026-mb-full\.video\.ts(?:\?.*)?$/, (route) => route.abort('failed'));
  await page.goto('/');
  await selectVideo(page, INNSBRUCK_TITLE);
  await expect(page.getByRole('alert')).toContainText('字幕数据加载失败');

  await page.getByRole('button', { name: '返回素材列表' }).click();
  await expect(page.locator('.video-option.active')).toHaveCount(0);
  await expect(page.locator('section[aria-label="听力库"]')).toBeVisible();

  await selectVideo(page, TECHNIQUE_TITLE);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('section[aria-label="Bilingual subtitle studio"]')).toBeVisible();
  await expect(page.locator('.subtitle-card')).toHaveCount(99);
});
