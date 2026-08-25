import { expect, test, type CDPSession, type Page } from '@playwright/test';

// R5 karaoke-playback walkthrough.
//
// Goal: prove the karaoke studio really plays a local mp4 and that the active
// subtitle highlight follows the playback head. We use the CDP session to read
// the *real* <video> element state (currentTime / paused / readyState) rather
// than React state, so the assertion is about the media element itself.

const TECHNIQUE_TITLE = 'A COMPLETE Guide to CLIMBING MOVEMENT AND TECHNIQUE';
const INNSBRUCK_TITLE = "Men's Boulder Final | Innsbruck 2026 智能重切";
const INNSBRUCK_FIRST_CUE_PREVIEW_OFFSET = 0.3;
const INNSBRUCK_HANDOFF_CUE_INDEX = 4;
const INNSBRUCK_HANDOFF_CUE_START = 88.97;

type PreviewMediaEvents = {
  canplay: number;
  seeking: number;
  seeked: number;
  waiting: number;
  seekTargets: number[];
};

type FakeYoutubeState = {
  currentTime: number;
  playing: boolean;
  seekTargets: number[];
};

async function installPreviewMediaEventProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const events = { canplay: 0, seeking: 0, seeked: 0, waiting: 0, seekTargets: [] as number[] };
    Object.defineProperty(window, '__previewMediaEvents', {
      value: events,
      configurable: true,
    });

    (['canplay', 'seeking', 'seeked', 'waiting'] as const).forEach((eventName) => {
      document.addEventListener(
        eventName,
        (event) => {
          const target = event.target;
          if (target instanceof HTMLVideoElement && target.classList.contains('preview-video')) {
            events[eventName] += 1;
            if (eventName === 'seeking') events.seekTargets.push(target.currentTime);
          }
        },
        true
      );
    });
  });
}

async function readPreviewMediaEvents(page: Page): Promise<PreviewMediaEvents> {
  return page.evaluate(() => {
    return (
      window as typeof window & {
        __previewMediaEvents: PreviewMediaEvents;
      }
    ).__previewMediaEvents;
  });
}

async function readFakeYoutubeState(page: Page): Promise<FakeYoutubeState> {
  return page.evaluate(() => {
    return (
      (
        window as typeof window & {
          __fakeYoutubeState?: FakeYoutubeState;
        }
      ).__fakeYoutubeState ?? { currentTime: 0, playing: false, seekTargets: [] }
    );
  });
}

async function installFakeYoutubeApi(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = {
      currentTime: 0,
      playbackRate: 1,
      playing: false,
      seekTargets: [] as number[],
    };
    Object.defineProperty(window, '__fakeYoutubeState', { value: state, configurable: true });

    class FakeYoutubePlayer {
      private readonly events: Record<string, (event?: { data: number }) => void>;
      private timer: number | null = null;

      constructor(_element: HTMLElement, config: Record<string, unknown>) {
        this.events = (config.events ?? {}) as Record<string, (event?: { data: number }) => void>;
        window.setTimeout(() => this.events.onReady?.(), 0);
      }

      seekTo(seconds: number) {
        state.currentTime = seconds;
        state.seekTargets.push(seconds);
      }

      playVideo() {
        state.playing = true;
        this.events.onStateChange?.({ data: 1 });
        if (this.timer === null) {
          this.timer = window.setInterval(() => {
            if (state.playing) state.currentTime += 0.25 * state.playbackRate;
          }, 250);
        }
      }

      pauseVideo() {
        state.playing = false;
        this.events.onStateChange?.({ data: 2 });
      }

      setPlaybackRate(rate: number) {
        state.playbackRate = rate;
      }

      getCurrentTime() {
        return state.currentTime;
      }

      destroy() {
        if (this.timer !== null) window.clearInterval(this.timer);
        this.timer = null;
        state.playing = false;
      }
    }

    Object.defineProperty(window, 'YT', {
      value: {
        Player: FakeYoutubePlayer,
        PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0 },
      },
      configurable: true,
    });
  });
}

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
  await page.waitForFunction((target) => {
    const video = document.querySelector<HTMLVideoElement>('video.local-video');
    if (!video) return false;
    video.currentTime = target;
    return true;
  }, targetSeconds);
}

test('karaoke playback advances the head and the highlight follows it', async ({ page }) => {
  await page.goto('/');

  // Enter the 素材栏 (material bar) and pick the local technique mp4 instead of
  // a YouTube iframe — the technique clip is the smallest tracked media file,
  // so it loads fast and never depends on the proxied YouTube embed.
  await page
    .locator('.video-option')
    .filter({ hasText: 'CLIMBING MOVEMENT AND TECHNIQUE' })
    .click();

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
    { timeout: 15_000 }
  );
  const t2 = await readPlayer(cdp);
  expect(t2.activeCueIndex).toBeGreaterThan(t1.activeCueIndex);

  // Keep rolling so the clip is exercised for ≥10s in total, then a final
  // fixed-time screenshot after the highlight has advanced.
  await page.waitForTimeout(4000);
  await page.screenshot({ path: 'test-results/karaoke-advanced.png', fullPage: true });
});

test('Innsbruck plays the Git preview while YouTube prewarms, then keeps the cue timeline', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await installFakeYoutubeApi(page);
  await installPreviewMediaEventProbe(page);
  await page.route('**/media/innsbruck-2026-mb-full.mp4', async (route) => {
    await route.fulfill({ status: 404, contentType: 'text/plain', body: 'not deployed' });
  });

  await page.goto('/');
  await page.locator('.video-option').filter({ hasText: INNSBRUCK_TITLE }).click();

  const media = page.locator('.cue-media-surface');
  await expect(media).toHaveAttribute('data-media-source', 'preview');
  await expect(page.getByRole('status')).toContainText('20 秒快速预览');
  await page.waitForFunction(() => {
    const preview = document.querySelector<HTMLVideoElement>('video.preview-video');
    return Boolean(preview && Number.isFinite(preview.duration) && preview.readyState >= 2);
  });

  // Loading metadata may require one initial seek, but readiness must never
  // feed back into thousands of currentTime writes while the player is idle.
  await page.waitForTimeout(500);
  const idleEvents = await readPreviewMediaEvents(page);
  expect(idleEvents.seeking).toBeLessThanOrEqual(2);
  expect(idleEvents.canplay).toBeLessThanOrEqual(4);

  await page.getByRole('button', { name: '播放本句' }).click();
  await page.waitForFunction((target) => {
    const preview = document.querySelector<HTMLVideoElement>('video.preview-video');
    return Boolean(preview && !preview.paused && preview.currentTime >= target);
  }, INNSBRUCK_FIRST_CUE_PREVIEW_OFFSET);
  await expect(page.locator('.subtitle-card.active')).toHaveAttribute('data-cue-index', '0');
  const playbackStart = await page
    .locator('video.preview-video')
    .evaluate((video) => video.currentTime);
  const eventsAtPlaybackStart = await readPreviewMediaEvents(page);
  expect(
    eventsAtPlaybackStart.seekTargets.some(
      (target) => Math.abs(target - INNSBRUCK_FIRST_CUE_PREVIEW_OFFSET) < 0.05
    )
  ).toBe(true);
  // On slower CI runners the single-cue range can reach its end and loop back
  // while a full-page screenshot is being encoded. Both forward movement and
  // a wrap to the cue start prove that the media clock is live.
  await page.waitForFunction(
    (start) => {
      const preview = document.querySelector<HTMLVideoElement>('video.preview-video');
      return Boolean(
        preview &&
        !preview.paused &&
        (preview.currentTime > start + 0.5 || preview.currentTime < start - 0.5)
      );
    },
    playbackStart,
    { timeout: 5_000 }
  );
  const eventsAtPlaybackEnd = await readPreviewMediaEvents(page);
  expect(eventsAtPlaybackEnd.seeking - eventsAtPlaybackStart.seeking).toBeLessThanOrEqual(1);
  // Word karaoke is lit during preview playback and never exposes ">>".
  await expect
    .poll(async () => page.locator('.subtitle-card.active [data-word-state="current"]').count())
    .toBeGreaterThan(0);
  await expect(page.locator('.subtitle-panel')).not.toContainText('>>');
  await page.screenshot({ path: 'test-results/innsbruck-preview-cue0.png', fullPage: true });

  await page.getByRole('button', { name: '下一句' }).click();
  await expect(page.locator('.subtitle-card.active')).toHaveAttribute('data-cue-index', '1');
  await page.waitForFunction(() => {
    const preview = document.querySelector<HTMLVideoElement>('video.preview-video');
    return Boolean(preview && preview.currentTime >= 4.1);
  });

  // Cue 5 begins beyond the 20-second preview window. The already-ready fake
  // YouTube player must take over at the exact cue start, without reviving the
  // removed runtime pre-roll or moving the active highlight off cue 5.
  const youtubeSeeksBeforeHandoff = (await readFakeYoutubeState(page)).seekTargets.length;
  await page.locator(`[data-cue-index="${INNSBRUCK_HANDOFF_CUE_INDEX}"]`).click();
  await expect(media).toHaveAttribute('data-media-source', 'youtube');
  await expect.poll(async () => (await readFakeYoutubeState(page)).playing).toBe(true);
  const youtubeState = await readFakeYoutubeState(page);
  const handoffSeeks = youtubeState.seekTargets.slice(youtubeSeeksBeforeHandoff);
  expect(handoffSeeks.length).toBeGreaterThan(0);
  expect(handoffSeeks.at(-1)).toBeCloseTo(INNSBRUCK_HANDOFF_CUE_START, 2);
  await page.waitForTimeout(500);
  await expect(page.locator('.subtitle-card.active')).toHaveAttribute(
    'data-cue-index',
    String(INNSBRUCK_HANDOFF_CUE_INDEX)
  );
  // The preview → YouTube handoff must not flash the word head back to the
  // sentence start: the active cue still has a lit word.
  await expect
    .poll(async () => page.locator('.subtitle-card.active [data-word-state="current"]').count())
    .toBeGreaterThan(0);
  await page.screenshot({
    path: 'test-results/innsbruck-youtube-handoff-cue4.png',
    fullPage: true,
  });
});
