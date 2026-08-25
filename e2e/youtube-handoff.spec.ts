import { expect, test, type Page } from '@playwright/test';
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
  expect(t0.previewPaused).toBe(false);
  await page.screenshot({ path: 'test-results/youtube-handoff-t0.png', fullPage: true });

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
  await page.screenshot({ path: 'test-results/youtube-handoff-t21.png', fullPage: true });

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
  await page.screenshot({ path: 'test-results/youtube-handoff-t35.png', fullPage: true });

  // Bidirectional switch: clicking a preview-window cue must leave YouTube and
  // bring the Git preview back as the live surface with no iframe residue.
  await page.locator('[data-cue-index="0"]').click();
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
  expect(back.activeWordIndex).toBeGreaterThanOrEqual(0);
  expect(back.previewPaused).toBe(false);
  const youtubeState = await readFakeYoutubeState(page);
  expect(youtubeState.playing).toBe(false);
  await page.screenshot({
    path: 'test-results/youtube-handoff-back-to-preview.png',
    fullPage: true,
  });
});
