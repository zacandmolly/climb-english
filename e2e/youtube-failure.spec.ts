import { expect, test, type Page } from '@playwright/test';
import {
  installFaithfulFakeYoutube,
  installPlayerTestHooks,
  readFakeYoutubeState,
  readSurfaceGeometry,
  setFakeYoutubeMode,
} from './lib/fake-youtube';

const INNSBRUCK_TITLE = "Men's Boulder Final | Innsbruck 2026 智能重切";

async function openInnsbruckPreview(page: Page): Promise<void> {
  await page.setViewportSize({ width: 412, height: 915 });
  await page.goto('/');
  await page.locator('.video-option').filter({ hasText: INNSBRUCK_TITLE }).click();
  await expect(page.locator('.cue-media-surface')).toHaveAttribute('data-media-source', 'preview');
  await page.waitForFunction(() => {
    const preview = document.querySelector<HTMLVideoElement>('video.preview-video');
    return Boolean(preview && Number.isFinite(preview.duration) && preview.readyState >= 2);
  });
}

async function routeInnsbruckMediaAsMissing(page: Page): Promise<void> {
  await page.route('**/media/innsbruck-2026-mb-full.mp4', (route) =>
    route.fulfill({ status: 404, contentType: 'text/plain', body: 'not deployed' })
  );
}

test('slow YouTube ready is not a silent no-op: preview keeps playing and retry recovers', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await installPlayerTestHooks(page, { youtubeSlowTimeoutMs: 800 });
  await installFaithfulFakeYoutube(page, { mode: 'never-ready' });
  await routeInnsbruckMediaAsMissing(page);
  await openInnsbruckPreview(page);

  await page.getByRole('button', { name: '连播' }).click();
  await page.waitForFunction(() => {
    const preview = document.querySelector<HTMLVideoElement>('video.preview-video');
    return Boolean(preview && !preview.paused && preview.currentTime > 0.05);
  });

  await expect(page.locator('.cue-media-surface')).toHaveAttribute('data-youtube-state', 'slow', {
    timeout: 10_000,
  });
  await expect(page.getByRole('button', { name: '重试加载' })).toBeVisible();
  const before = await readSurfaceGeometry(page);
  await page.waitForTimeout(1_200);
  const after = await readSurfaceGeometry(page);
  expect(after.previewCurrentTime).toBeGreaterThan(before.previewCurrentTime);
  expect(after.source).toBe('preview');

  await setFakeYoutubeMode(page, 'ok');
  await page.getByRole('button', { name: '重试加载' }).click();
  await expect(page.locator('.cue-media-surface')).toHaveAttribute('data-youtube-state', 'ready', {
    timeout: 10_000,
  });
  await page.locator('[data-cue-index="4"]').click();
  await expect(page.locator('.cue-media-surface')).toHaveAttribute('data-media-source', 'youtube');
  const state = await readFakeYoutubeState(page);
  expect(state.playing).toBe(true);
});

test('aborted YouTube script is not a silent no-op: preview keeps playing and retry recovers', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await installPlayerTestHooks(page, {
    youtubeSlowTimeoutMs: 800,
    youtubeFailureTimeoutMs: 1_500,
  });
  await installFaithfulFakeYoutube(page, { installYt: false });
  await page.route('**/iframe_api*', (route) => route.abort());
  await routeInnsbruckMediaAsMissing(page);
  await openInnsbruckPreview(page);

  await page.getByRole('button', { name: '连播' }).click();
  await page.waitForFunction(() => {
    const preview = document.querySelector<HTMLVideoElement>('video.preview-video');
    return Boolean(preview && !preview.paused && preview.currentTime > 0.05);
  });

  await expect(page.locator('.cue-media-surface')).toHaveAttribute('data-youtube-state', 'failed', {
    timeout: 10_000,
  });
  await expect(page.getByRole('button', { name: '重试加载' })).toBeVisible();
  const before = await readSurfaceGeometry(page);
  await page.waitForTimeout(1_200);
  const after = await readSurfaceGeometry(page);
  expect(after.previewCurrentTime).toBeGreaterThan(before.previewCurrentTime);
  expect(after.source).toBe('preview');

  await page.unroute('**/iframe_api*');
  await page.route('**/iframe_api*', (route) =>
    route.fulfill({
      contentType: 'text/javascript',
      body: 'window.__installFakeYt?.(); window.onYouTubeIframeAPIReady?.();',
    })
  );
  await page.getByRole('button', { name: '重试加载' }).click();
  await expect(page.locator('.cue-media-surface')).toHaveAttribute('data-youtube-state', 'ready', {
    timeout: 10_000,
  });
  await page.locator('[data-cue-index="4"]').click();
  await expect(page.locator('.cue-media-surface')).toHaveAttribute('data-media-source', 'youtube');
});

test('YouTube player error keeps the last frame and offers preview fallback + retry', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await installPlayerTestHooks(page, { youtubeSlowTimeoutMs: 20_000 });
  await installFaithfulFakeYoutube(page, { mode: 'error-after-ready', failAfterReadyMs: 5_000 });
  await routeInnsbruckMediaAsMissing(page);
  await openInnsbruckPreview(page);

  await expect(page.locator('.cue-media-surface')).toHaveAttribute('data-youtube-state', 'ready', {
    timeout: 10_000,
  });
  await page.locator('[data-cue-index="4"]').click();
  await expect(page.locator('.cue-media-surface')).toHaveAttribute('data-media-source', 'youtube');

  await expect(page.locator('.cue-media-surface')).toHaveAttribute('data-youtube-state', 'failed', {
    timeout: 10_000,
  });
  const failed = await readSurfaceGeometry(page);
  expect(failed.source).toBe('youtube');
  expect(failed.iframeCount).toBe(1);
  expect(failed.iframeInHost).toBe(true);
  expect(failed.surfaceHeight).toBeGreaterThan(150);
  await expect(page.getByRole('button', { name: '重试加载' })).toBeVisible();
  await expect(page.getByRole('button', { name: '重播 20 秒预览' })).toBeVisible();

  await page.getByRole('button', { name: '重播 20 秒预览' }).click();
  await expect(page.locator('.cue-media-surface')).toHaveAttribute('data-media-source', 'preview');
  await page.waitForFunction(() => {
    const preview = document.querySelector<HTMLVideoElement>('video.preview-video');
    return Boolean(
      preview && preview.readyState >= 2 && !preview.paused && preview.currentTime > 0.05
    );
  });
  const back = await readSurfaceGeometry(page);
  expect(back.iframeCount).toBe(1);
  expect(back.iframeInHost).toBe(true);
  expect(back.wrapperOpacity).toBe('0');
  expect(back.previewHeight).toBeGreaterThan(150);

  await setFakeYoutubeMode(page, 'ok');
  await page.getByRole('button', { name: '重试加载' }).click();
  await expect(page.locator('.cue-media-surface')).toHaveAttribute('data-youtube-state', 'ready', {
    timeout: 10_000,
  });
  await page.locator('[data-cue-index="4"]').click();
  await expect(page.locator('.cue-media-surface')).toHaveAttribute('data-media-source', 'youtube');
  const state = await readFakeYoutubeState(page);
  expect(state.playing).toBe(true);
});

test('YouTube constructor failure surfaces a retry instead of a silent empty host', async ({
  page,
}) => {
  test.setTimeout(90_000);
  await installPlayerTestHooks(page, { youtubeSlowTimeoutMs: 20_000 });
  await installFaithfulFakeYoutube(page, { mode: 'constructor-throw' });
  await routeInnsbruckMediaAsMissing(page);
  await openInnsbruckPreview(page);

  await expect(page.locator('.cue-media-surface')).toHaveAttribute('data-youtube-state', 'failed', {
    timeout: 10_000,
  });
  await expect(page.getByRole('button', { name: '重试加载' })).toBeVisible();
  await expect(page.getByRole('link', { name: '在 YouTube 打开原视频' })).toBeVisible();

  await setFakeYoutubeMode(page, 'ok');
  await page.getByRole('button', { name: '重试加载' }).click();
  await expect(page.locator('.cue-media-surface')).toHaveAttribute('data-youtube-state', 'ready', {
    timeout: 10_000,
  });
});

test('YouTube-owned iframe unmounts cleanly when the learner changes videos', async ({ page }) => {
  test.setTimeout(90_000);
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await installFaithfulFakeYoutube(page);
  await routeInnsbruckMediaAsMissing(page);
  await openInnsbruckPreview(page);

  await expect(page.locator('.cue-media-surface')).toHaveAttribute('data-youtube-state', 'ready', {
    timeout: 10_000,
  });
  await page.locator('[data-cue-index="4"]').click();
  await expect(page.locator('.cue-media-surface')).toHaveAttribute('data-media-source', 'youtube');

  await page.locator('.video-option').filter({ hasNotText: INNSBRUCK_TITLE }).first().click();
  await expect(page.locator('.cue-media-surface')).toBeVisible();
  await expect(page.locator('.subtitle-card').first()).toBeVisible();
  expect(pageErrors).toEqual([]);
});
