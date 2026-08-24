import { expect, test, type CDPSession, type Page } from '@playwright/test';

// R5 karaoke-playback walkthrough.
//
// Goal: prove the karaoke studio really plays a local mp4 and that the active
// subtitle highlight follows the playback head. We use the CDP session to read
// the *real* <video> element state (currentTime / paused / readyState) rather
// than React state, so the assertion is about the media element itself.

const TECHNIQUE_TITLE = 'A COMPLETE Guide to CLIMBING MOVEMENT AND TECHNIQUE';

// Read the player's true state through CDP Runtime.evaluate (returnByValue).
// `activeCueIndex` is derived from the DOM: the subtitle card that currently
// carries the `.active` class.
async function readPlayer(cdp: CDPSession): Promise<{
  currentTime: number;
  paused: boolean;
  readyState: number;
  activeCueIndex: number;
}> {
  const result = await cdp.send('Runtime.evaluate', {
    expression: `(() => {
      const video = document.querySelector('video.local-video');
      const active = document.querySelector('.subtitle-card.active');
      return {
        currentTime: video ? video.currentTime : -1,
        paused: video ? video.paused : true,
        readyState: video ? video.readyState : 0,
        activeCueIndex: active ? Number(active.getAttribute('data-cue-index')) : -1,
      };
    })()`,
    returnByValue: true,
  });
  return result.result.value;
}

// Seek the video element to a target position and wait for a `timeupdate`.
// Playback is continuous here (no active range), so the next timeupdate will
// recompute the active cue from the new head position.
async function seekTo(page: Page, targetSeconds: number): Promise<void> {
  await page.waitForFunction(
    (target) => {
      const video = document.querySelector<HTMLVideoElement>('video.local-video');
      if (!video) return false;
      video.currentTime = target;
      return true;
    },
    targetSeconds,
  );
}

test('karaoke playback advances the head and the highlight follows it', async ({ page }) => {
  await page.goto('/');

  // Enter the 素材栏 (material bar) and pick the local technique mp4 instead of
  // a YouTube iframe — the technique clip is the smallest tracked media file,
  // so it loads fast and never depends on the proxied YouTube embed.
  await page.locator('.video-option').filter({ hasText: 'CLIMBING MOVEMENT AND TECHNIQUE' }).click();

  const video = page.locator('video.local-video');
  await video.waitFor({ state: 'attached' });

  // Wait until the element has metadata AND at least current-frame data so the
  // play() call below can actually start advancing.
  await page.waitForFunction(() => {
    const el = document.querySelector<HTMLVideoElement>('video.local-video');
    return Boolean(el && Number.isFinite(el.duration) && el.duration > 0 && el.readyState >= 2);
  });

  const cdp = await page.context().newCDPSession(page);

  // Continuous (karaoke) playback: `连播` keeps the video rolling while the
  // subtitle highlight follows the head.
  await page.getByRole('button', { name: '连播' }).click();
  await page.waitForFunction(() => {
    const el = document.querySelector<HTMLVideoElement>('video.local-video');
    return Boolean(el && !el.paused && el.currentTime > 0.5);
  });

  const t0 = await readPlayer(cdp);
  expect(t0.currentTime).toBeGreaterThan(0.5);
  expect(t0.paused).toBe(false);

  // Fixed-time screenshot during early playback.
  await page.screenshot({ path: 'test-results/karaoke-playing.png', fullPage: true });

  // Playback head must advance over a ~6s window.
  await page.waitForTimeout(6000);
  const t1 = await readPlayer(cdp);
  expect(t1.currentTime).toBeGreaterThan(t0.currentTime + 4);

  // Highlight follows the head: jump ~40s forward (the technique clip has its
  // first cue at ~24s, then one every ~7s), and the active cue index must move
  // off the initial cue as the next timeupdate recomputes it.
  await seekTo(page, t1.currentTime + 40);
  await page.waitForFunction(
    (prev) => {
      const active = document.querySelector('.subtitle-card.active');
      return Boolean(active && Number(active.getAttribute('data-cue-index')) > prev);
    },
    t1.activeCueIndex,
    { timeout: 15_000 },
  );
  const t2 = await readPlayer(cdp);
  expect(t2.activeCueIndex).toBeGreaterThan(t1.activeCueIndex);

  // Keep rolling so the clip is exercised for ≥10s in total, then a final
  // fixed-time screenshot after the highlight has advanced.
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test-results/karaoke-advanced.png', fullPage: true });
});
