import { expect, test, type Page } from '@playwright/test';

// Word-level karaoke on a mobile viewport (Issues #23/#29).
//
// Covers the acceptance behaviors that are pure derivations of media time:
//   - only the ACTIVE cue splits into words;
//   - past/current/future states follow the playback head;
//   - pause freezes the word head;
//   - seeking re-syncs the word head immediately;
//   - 0.75x and single-cue loop keep the same word timeline;
//   - raw ">>" speaker markers never reach customer-facing text.

const TECHNIQUE_TITLE = 'A COMPLETE Guide to CLIMBING MOVEMENT AND TECHNIQUE';

async function installDeterministicMediaClock(page: Page): Promise<void> {
  await page.addInitScript(() => {
    type MediaClock = {
      currentTime: number;
      paused: boolean;
      playbackRate: number;
      timer?: number;
    };

    const clocks = new WeakMap<HTMLMediaElement, MediaClock>();
    const clockFor = (media: HTMLMediaElement) => {
      let clock = clocks.get(media);
      if (!clock) {
        clock = { currentTime: 0, paused: true, playbackRate: 1 };
        clocks.set(media, clock);
      }
      return clock;
    };
    const emit = (media: HTMLMediaElement, event: string) =>
      media.dispatchEvent(new Event(event));

    Object.defineProperties(HTMLMediaElement.prototype, {
      currentTime: {
        configurable: true,
        get() {
          return clockFor(this as HTMLMediaElement).currentTime;
        },
        set(value: number) {
          const media = this as HTMLMediaElement;
          clockFor(media).currentTime = Number.isFinite(value) ? Math.max(0, value) : 0;
          emit(media, 'seeking');
          emit(media, 'timeupdate');
          emit(media, 'seeked');
        },
      },
      duration: { configurable: true, get: () => 600 },
      readyState: { configurable: true, get: () => 4 },
      paused: {
        configurable: true,
        get() {
          return clockFor(this as HTMLMediaElement).paused;
        },
      },
      ended: { configurable: true, get: () => false },
      playbackRate: {
        configurable: true,
        get() {
          return clockFor(this as HTMLMediaElement).playbackRate;
        },
        set(value: number) {
          const media = this as HTMLMediaElement;
          clockFor(media).playbackRate = value;
          emit(media, 'ratechange');
        },
      },
    });

    HTMLMediaElement.prototype.play = function play() {
      const media = this;
      const clock = clockFor(media);
      clock.paused = false;
      emit(media, 'play');
      emit(media, 'playing');
      if (!clock.timer) {
        clock.timer = window.setInterval(() => {
          if (clock.paused) return;
          clock.currentTime += 0.1 * clock.playbackRate;
          emit(media, 'timeupdate');
        }, 100);
      }
      return Promise.resolve();
    };

    HTMLMediaElement.prototype.pause = function pause() {
      const media = this;
      const clock = clockFor(media);
      if (clock.paused) return;
      clock.paused = true;
      emit(media, 'pause');
    };

    // Linux Playwright WebKit intentionally ships without every proprietary
    // codec. Keep that infrastructure limitation from invoking the product's
    // media-error fallback; Chromium and the Android AVD cover real decoding.
    window.addEventListener(
      'error',
      (event) => {
        if (event.target instanceof HTMLMediaElement) event.stopImmediatePropagation();
      },
      true
    );
  });
}

async function openTechniqueVideo(page: Page) {
  await page.goto('/');
  await page
    .locator('.video-option')
    .filter({ hasText: TECHNIQUE_TITLE })
    .click();
  const video = page.locator('video.local-video');
  await video.waitFor({ state: 'attached' });
  await page.waitForFunction(() => {
    const el = document.querySelector<HTMLVideoElement>('video.local-video');
    return Boolean(el && Number.isFinite(el.duration) && el.duration > 0 && el.readyState >= 2);
  });
  return video;
}

async function seekTo(page: Page, targetSeconds: number): Promise<void> {
  await page.waitForFunction((target) => {
    const video = document.querySelector<HTMLVideoElement>('video.local-video');
    if (!video) return false;
    video.currentTime = target;
    return true;
  }, targetSeconds);
  // Wait until the timeupdate has propagated into React state.
  await page.waitForTimeout(250);
}

async function currentWordIndex(page: Page): Promise<number> {
  const value = await page
    .locator('.subtitle-card.active .karaoke-words')
    .getAttribute('data-current-word');
  return Number(value ?? '-1');
}

test.beforeEach(async ({ page }) => {
  await installDeterministicMediaClock(page);
  await page.setViewportSize({ width: 390, height: 844 });
});

test('mobile word karaoke: active-cue splitting, pause freeze, seek sync', async ({ page }) => {
  await openTechniqueVideo(page);

  // Jump inside the first cue (24.09–30.87s) so words are already lit.
  await seekTo(page, 26);
  await page.getByRole('button', { name: '连播' }).click();

  const activeCard = page.locator('.subtitle-card.active');
  await expect(activeCard.locator('.karaoke-word').first()).toBeVisible();
  await expect
    .poll(async () => activeCard.locator('[data-word-state="current"]').count())
    .toBeGreaterThan(0);

  // Only the active cue is split into words.
  expect(await page.locator('.subtitle-card:not(.active) .karaoke-word').count()).toBe(0);

  const runningIndex = await currentWordIndex(page);
  expect(runningIndex).toBeGreaterThan(0);

  // Pause freezes the word head.
  await page.getByRole('button', { name: '暂停' }).click();
  const pausedIndex = await currentWordIndex(page);
  await page.waitForTimeout(1200);
  expect(await currentWordIndex(page)).toBe(pausedIndex);

  // Continuous playback resumes from the same position and the head advances.
  await page.getByRole('button', { name: '连播' }).click();
  await expect.poll(async () => currentWordIndex(page), { timeout: 20_000 }).toBeGreaterThan(pausedIndex);

  // Seek far forward: the active cue changes and its word head re-syncs.
  await seekTo(page, 36);
  await expect(page.locator('.subtitle-card.active')).toHaveAttribute('data-cue-index', '1');
  await expect
    .poll(async () => activeCard.locator('[data-word-state="current"]').count())
    .toBeGreaterThan(0);
  expect(await currentWordIndex(page)).toBeGreaterThan(-1);

  // Customer UI never shows the raw speaker symbols.
  await expect(page.locator('.subtitle-panel')).not.toContainText('>>');
});

test('mobile word karaoke: 0.75x and single-cue loop stay consistent', async ({ page }) => {
  const video = await openTechniqueVideo(page);

  // 0.75x: the same media-time derivation, just slower wall-clock advance.
  await seekTo(page, 25);
  await page.getByRole('button', { name: '慢速' }).click();
  await page.getByRole('button', { name: '连播' }).click();
  await expect
    .poll(async () => video.evaluate((el) => (el as HTMLVideoElement).playbackRate))
    .toBe(0.75);
  const slowStart = await currentWordIndex(page);
  await expect.poll(async () => currentWordIndex(page), { timeout: 15_000 }).toBeGreaterThan(slowStart);

  // Single-cue loop: the word head restarts with the media head instead of
  // drifting toward the end of the sentence.
  await page.getByRole('button', { name: '暂停' }).click();
  await page.getByRole('button', { name: '单句循环' }).click();
  await page.getByRole('button', { name: '播放本句' }).click();
  await expect
    .poll(async () => currentWordIndex(page), { timeout: 15_000 })
    .toBeGreaterThanOrEqual(2);
  await expect
    .poll(async () => currentWordIndex(page), { timeout: 30_000 })
    .toBeLessThanOrEqual(1);
});
