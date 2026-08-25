import { expect, test, type Page, type TestInfo } from '@playwright/test';
import {
  installFaithfulFakeYoutube,
  installPlayerTestHooks,
  readFakeYoutubeState,
  readSurfaceGeometry,
} from './lib/fake-youtube';

// Issue #22 regression flow: the real YouTube IFrame API replaces the host
// element with an <iframe>. The player must (a) never let that iframe escape
// the React-owned host wrapper (residue prewarming), (b) keep the 16:9 parent
// from collapsing, (c) support switching back from YouTube to a preview-window
// cue, and (d) never silently no-op while YouTube is slow/failed/blocked.
//
// Natural media timeline (Innsbruck: mediaStartTime=0,
// previewStartTime=67.23, previewDurationSeconds=20):
//   T=0  -> preview asset start (element time 0, first cue)
//   T=21 -> absolute 88.23, cue c004 (index 3) on YouTube
//   T=35 -> absolute 102.23, cue c010 (index 9) on YouTube
// The test waits the full 35 wall-clock seconds. It never seeks or clicks a cue
// to cross the handoff boundary; only after T=35 does it exercise switch-back.

const INNSBRUCK_TITLE = "Men's Boulder Final | Innsbruck 2026 智能重切";
const T21_CUE_INDEX = 3;
const T35_CUE_INDEX = 9;
const PREVIEW_FIRST_CUE_OFFSET = 0.3;

async function readMobileHealth(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const active = document.querySelector<HTMLElement>('.subtitle-card.active');
    const list = document.querySelector<HTMLElement>('.subtitle-list');
    const activeRect = active?.getBoundingClientRect();
    const listRect = list?.getBoundingClientRect();
    return {
      horizontalOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
      activeCueVisible: Boolean(
        activeRect &&
          listRect &&
          activeRect.bottom > listRect.top &&
          activeRect.top < listRect.bottom
      ),
      subtitleCardCount: document.querySelectorAll('.subtitle-card').length,
    };
  });
}

async function captureEvidence(
  page: Page,
  testInfo: TestInfo,
  name: string
): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(`${testInfo.project.name}-${name}`, {
    path,
    contentType: 'image/png',
  });
}

async function installPreviewSeekProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const targets: number[] = [];
    Object.defineProperty(window, '__previewSeekTargets', { value: targets, configurable: true });
    document.addEventListener(
      'seeking',
      (event) => {
        const target = event.target;
        if (target instanceof HTMLVideoElement && target.classList.contains('preview-video')) {
          targets.push(target.currentTime);
        }
      },
      true
    );
  });
}

test('35s natural mobile playback keeps one live surface and preview cues switch back', async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  test.skip(
    testInfo.project.name === 'chromium',
    '35s acceptance gate runs on both mobile engines'
  );
  await page.setViewportSize({ width: 412, height: 915 });
  const runtimeErrors: string[] = [];
  page.on('pageerror', (error) => runtimeErrors.push(`page: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(`console: ${message.text()}`);
  });
  await installPlayerTestHooks(page, { youtubeSlowTimeoutMs: 20_000 });
  await installFaithfulFakeYoutube(page);
  await installPreviewSeekProbe(page);
  await page.route('**/media/innsbruck-2026-mb-full.mp4', (route) =>
    route.fulfill({ status: 404, contentType: 'text/plain', body: 'not deployed' })
  );

  await page.goto('/');
  await page.locator('.video-option').filter({ hasText: INNSBRUCK_TITLE }).click();

  const surface = page.locator('.cue-media-surface');
  await expect(surface).toHaveAttribute('data-media-source', 'preview');
  await page.waitForFunction(() => {
    const preview = document.querySelector<HTMLVideoElement>('video.preview-video');
    return Boolean(preview && Number.isFinite(preview.duration) && preview.readyState >= 2);
  });
  const playbackStartedAt = Date.now();

  await page.getByRole('button', { name: '连播' }).click();
  await page.waitForFunction(() => {
    const preview = document.querySelector<HTMLVideoElement>('video.preview-video');
    return Boolean(preview && !preview.paused && preview.currentTime > 0.05);
  });
  await expect
    .poll(async () => (await readSurfaceGeometry(page)).activeWordIndex)
    .toBeGreaterThanOrEqual(0);

  // T=0: the preview is the live surface. The prewarming iframe exists but is
  // hidden inside the React-owned host wrapper and never blocks the preview.
  const t0 = await readSurfaceGeometry(page);
  expect(t0.source).toBe('preview');
  expect(t0.iframeCount).toBe(1);
  expect(t0.iframeInHost).toBe(true);
  expect(t0.wrapperOpacity).toBe('0');
  expect(t0.wrapperPointerEvents).toBe('none');
  expect(t0.previewHeight).toBeGreaterThan(150);
  expect(t0.previewOpacity).toBe('1');
  expect(t0.centerTarget).toContain('preview-video');
  expect(t0.activeCueIndex).toBe(0);
  expect(t0.activeWordIndex).toBeGreaterThanOrEqual(0);
  expect(t0.previewPaused).toBe(false);
  expect((await readMobileHealth(page)).horizontalOverflow).toBe(0);
  expect((await readFakeYoutubeState(page)).playerVars).toMatchObject({
    controls: 0,
    disablekb: 1,
  });
  await expect(page.locator('video[controls]')).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
  await captureEvidence(page, testInfo, 'youtube-handoff-t0');

  // T=10: still on the preview, with the media clock, cue and source-driven
  // word head advancing. Pause must freeze the clock; 连播 resumes it.
  await page.waitForTimeout(Math.max(0, 10_000 - (Date.now() - playbackStartedAt)));
  const t10 = await readSurfaceGeometry(page);
  expect(t10.source).toBe('preview');
  expect(t10.previewCurrentTime).toBeGreaterThan(8);
  expect(t10.activeCueIndex).toBeGreaterThanOrEqual(0);
  expect(t10.activeWordIndex).toBeGreaterThanOrEqual(0);
  expect(t10.surfaceHeight).toBeGreaterThan(150);
  expect(Math.abs(t10.wrapperHeight / t10.wrapperWidth - 9 / 16)).toBeLessThan(0.06);
  const t10Health = await readMobileHealth(page);
  expect(t10Health.horizontalOverflow).toBe(0);
  expect(t10Health.activeCueVisible).toBe(true);
  expect(runtimeErrors).toEqual([]);
  await captureEvidence(page, testInfo, 'youtube-handoff-t10');

  await page.getByRole('button', { name: '暂停' }).click();
  const pausedAt = (await readSurfaceGeometry(page)).previewCurrentTime;
  await page.waitForTimeout(500);
  expect((await readSurfaceGeometry(page)).previewCurrentTime).toBeCloseTo(pausedAt, 1);
  await page.getByRole('button', { name: '连播' }).click();

  // Do not seek: natural `ended` triggers the handoff to the prewarmed player.
  await page.waitForTimeout(Math.max(0, 21_000 - (Date.now() - playbackStartedAt)));
  await expect(surface).toHaveAttribute('data-media-source', 'youtube', { timeout: 15_000 });

  // T=21 (absolute 88.3): YouTube owns the surface with the replacement
  // iframe nested inside the host wrapper, which keeps the 16:9 geometry.
  await page.waitForFunction(
    (index) => {
      const active = document.querySelector<HTMLElement>('.subtitle-card.active');
      return active?.getAttribute('data-cue-index') === String(index);
    },
    T21_CUE_INDEX,
    { timeout: 10_000 }
  );

  const t21 = await readSurfaceGeometry(page);
  expect(t21.source).toBe('youtube');
  expect(t21.iframeCount).toBe(1);
  expect(t21.iframeInHost).toBe(true);
  expect(t21.wrapperOpacity).toBe('1');
  expect(t21.wrapperPointerEvents).toBe('auto');
  expect(t21.surfaceHeight).toBeGreaterThan(150);
  expect(Math.abs(t21.wrapperHeight / t21.wrapperWidth - 9 / 16)).toBeLessThan(0.06);
  expect(t21.activeCueIndex).toBe(T21_CUE_INDEX);
  expect(t21.activeWordIndex).toBeGreaterThanOrEqual(0);
  expect(t21.youtubePlaying).toBe(true);
  expect(t21.centerTarget).toContain('iframe');
  const t21Health = await readMobileHealth(page);
  expect(t21Health.horizontalOverflow).toBe(0);
  expect(t21Health.activeCueVisible).toBe(true);
  expect(runtimeErrors).toEqual([]);
  await captureEvidence(page, testInfo, 'youtube-handoff-t21');

  // T=35 (absolute 102.3): still one live surface, YouTube visible, the cue
  // highlight follows the fake clock.
  await page.waitForTimeout(Math.max(0, 35_000 - (Date.now() - playbackStartedAt)));
  await page.waitForFunction(
    (index) => {
      const active = document.querySelector<HTMLElement>('.subtitle-card.active');
      return active?.getAttribute('data-cue-index') === String(index);
    },
    T35_CUE_INDEX,
    { timeout: 10_000 }
  );

  const t35 = await readSurfaceGeometry(page);
  expect(t35.source).toBe('youtube');
  expect(t35.iframeCount).toBe(1);
  expect(t35.iframeInHost).toBe(true);
  expect(t35.wrapperOpacity).toBe('1');
  expect(t35.wrapperPointerEvents).toBe('auto');
  expect(t35.activeCueIndex).toBe(T35_CUE_INDEX);
  expect(t35.activeWordIndex).toBeGreaterThanOrEqual(0);
  expect(t35.youtubePlaying).toBe(true);
  expect(t35.surfaceHeight).toBeGreaterThan(150);
  expect(Math.abs(t35.wrapperHeight / t35.wrapperWidth - 9 / 16)).toBeLessThan(0.06);
  const t35Health = await readMobileHealth(page);
  expect(t35Health.horizontalOverflow).toBe(0);
  expect(t35Health.activeCueVisible).toBe(true);
  expect(runtimeErrors).toEqual([]);
  await captureEvidence(page, testInfo, 'youtube-handoff-t35');

  const cueAt35 = t35.activeCueIndex;
  await page.getByRole('button', { name: '下一句' }).click();
  await expect(page.locator('.subtitle-card.active')).toHaveAttribute(
    'data-cue-index',
    String(cueAt35 + 1)
  );
  await page.getByRole('button', { name: '上一句' }).click();
  await expect(page.locator('.subtitle-card.active')).toHaveAttribute(
    'data-cue-index',
    String(cueAt35)
  );
  await page.getByRole('button', { name: '暂停' }).click();
  await page.getByRole('button', { name: '连播' }).click();

  // Bidirectional switch: clicking a preview-window cue must leave YouTube and
  // bring the Git preview back as the live surface with no iframe residue.
  // The 2,242-row list is virtualized, so exercise the real customer gesture:
  // scroll to the start, wait for cue 0 to mount, then select it.
  await page.locator('.subtitle-list').evaluate((list) => list.scrollTo({ top: 0 }));
  const firstCue = page.locator('.subtitle-card[data-cue-index="0"]');
  await expect(firstCue).toBeVisible();
  await firstCue.click();
  await expect(surface).toHaveAttribute('data-media-source', 'preview', { timeout: 10_000 });
  await expect
    .poll(() =>
      page.evaluate((target) => {
        const targets = (window as typeof window & { __previewSeekTargets?: number[] })
          .__previewSeekTargets;
        return Boolean(targets?.some((value) => Math.abs(value - target) < 0.5));
      }, PREVIEW_FIRST_CUE_OFFSET)
    )
    .toBe(true);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const preview = document.querySelector<HTMLVideoElement>('video.preview-video');
        return Boolean(preview && !preview.paused && preview.currentTime >= 0);
      })
    )
    .toBe(true);
  await expect
    .poll(async () => (await readSurfaceGeometry(page)).activeWordIndex)
    .toBeGreaterThanOrEqual(0);

  const back = await readSurfaceGeometry(page);
  expect(back.iframeCount).toBe(1);
  expect(back.iframeInHost).toBe(true);
  expect(back.wrapperOpacity).toBe('0');
  expect(back.centerTarget).toContain('preview-video');
  expect(back.activeCueIndex).toBe(0);
  expect(back.previewPaused).toBe(false);
  const youtubeState = await readFakeYoutubeState(page);
  expect(youtubeState.playing).toBe(false);
  expect(runtimeErrors).toEqual([]);
  await captureEvidence(page, testInfo, 'youtube-handoff-back-to-preview');
});
