import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import {
  installFaithfulFakeYoutube,
  readFakeYoutubeState,
  readSurfaceGeometry,
} from './lib/fake-youtube';

const INNSBRUCK_TITLE = "Men's Boulder Final | Innsbruck 2026 智能重切";

async function installMobileQaMetrics(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(window, '__CLIMB_ENGLISH_MOBILE_QA__', {
      configurable: true,
      value: { subtitleCommits: [] },
    });
  });
}

async function openInnsbruck(page: Page): Promise<void> {
  await page.route('**/media/innsbruck-2026-mb-full.mp4', (route) =>
    route.fulfill({ status: 404, contentType: 'text/plain', body: 'not deployed' })
  );
  await page.goto('/');
  await page.locator('.video-option').filter({ hasText: INNSBRUCK_TITLE }).click();
  await expect(page.locator('.subtitle-list')).toBeVisible();
  await expect(page.locator('.subtitle-card').first()).toBeVisible();
}

async function mountedCueIndices(page: Page): Promise<number[]> {
  return page
    .locator('.subtitle-card')
    .evaluateAll((cards) => cards.map((card) => Number(card.getAttribute('data-cue-index'))));
}

async function captureViewport(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const path = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(`${testInfo.project.name}-${name}`, {
    path,
    contentType: 'image/png',
  });
}

async function layoutHealth(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const list = document.querySelector<HTMLElement>('.subtitle-list');
    const listRect = list?.getBoundingClientRect();
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.subtitle-card'));
    const activeRect = document
      .querySelector<HTMLElement>('.subtitle-card.active')
      ?.getBoundingClientRect();
    const intersectingCards = listRect
      ? cards.filter((card) => {
          const rect = card.getBoundingClientRect();
          return rect.bottom > listRect.top && rect.top < listRect.bottom;
        }).length
      : 0;
    return {
      horizontalOverflow: Math.max(0, root.scrollWidth - root.clientWidth),
      cardCount: cards.length,
      intersectingCards,
      scrollHeight: list?.scrollHeight ?? 0,
      clientHeight: list?.clientHeight ?? 0,
      activeOffsetFromListTop:
        activeRect && listRect ? Math.round(activeRect.top - listRect.top) : Number.NaN,
    };
  });
}

test('Pixel 7 virtualizes 2,242 cues and stays responsive under 6x CPU', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'pixel-7-chromium', 'Chromium CDP performance gate');
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 412, height: 915 });
  await installMobileQaMetrics(page);
  await installFaithfulFakeYoutube(page);
  await openInnsbruck(page);

  await expect.poll(async () => (await layoutHealth(page)).cardCount).toBeLessThanOrEqual(36);
  const initialIndices = await mountedCueIndices(page);
  expect(Math.max(...initialIndices)).toBeLessThan(80);

  const activeCard = page.locator('.subtitle-card.active');
  const heightWithZh = await activeCard.evaluate(
    (element) => element.getBoundingClientRect().height
  );
  const scrollHeightWithZh = (await layoutHealth(page)).scrollHeight;
  await page.getByRole('button', { name: '隐藏中文' }).click();
  await expect(activeCard.locator('.subtitle-zh')).toHaveCount(0);
  await expect
    .poll(() => activeCard.evaluate((element) => element.getBoundingClientRect().height))
    .toBeLessThan(heightWithZh);
  const heightWithoutZh = await activeCard.evaluate(
    (element) => element.getBoundingClientRect().height
  );
  const scrollHeightWithoutZh = (await layoutHealth(page)).scrollHeight;
  expect(scrollHeightWithoutZh).toBeLessThan(scrollHeightWithZh);
  await page.getByRole('button', { name: '显示中文' }).click();
  await expect
    .poll(() => activeCard.evaluate((element) => element.getBoundingClientRect().height))
    .toBeGreaterThan(heightWithoutZh);
  await expect
    .poll(async () => (await layoutHealth(page)).scrollHeight)
    .toBeGreaterThan(scrollHeightWithoutZh);

  const list = page.locator('.subtitle-list');
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight * 0.72;
  });
  await expect.poll(async () => Math.min(...(await mountedCueIndices(page)))).toBeGreaterThan(900);
  const distant = await layoutHealth(page);
  expect(distant.cardCount).toBeLessThanOrEqual(36);
  expect(distant.intersectingCards).toBeGreaterThan(0);
  expect(distant.scrollHeight).toBeGreaterThan(distant.clientHeight * 20);

  const filler = page.locator('.subtitle-card.filler').first();
  await expect(filler).toBeVisible();
  const selectedIndex = Number(await filler.getAttribute('data-cue-index'));
  await filler.click();
  await expect(page.locator('.subtitle-card.active')).toHaveAttribute(
    'data-cue-index',
    String(selectedIndex)
  );
  await page.getByRole('button', { name: '暂停' }).click();
  await expect(page.locator('.subtitle-card.active')).toHaveAttribute(
    'data-cue-index',
    String(selectedIndex)
  );
  await expect
    .poll(async () => (await layoutHealth(page)).activeOffsetFromListTop)
    .toBeLessThanOrEqual(24);
  await page.getByRole('button', { name: '只看学习句' }).click();
  await expect(page.locator('.subtitle-card.active')).toHaveAttribute(
    'data-cue-index',
    String(selectedIndex)
  );
  await expect(page.locator('.subtitle-card.active')).toBeVisible();
  await expect
    .poll(async () => (await layoutHealth(page)).activeOffsetFromListTop)
    .toBeLessThanOrEqual(24);

  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
    await page.evaluate(() => {
      const target = window as typeof window & {
        __mobileLongTasks?: number[];
        __mobileLongTaskObserver?: PerformanceObserver;
      };
      target.__mobileLongTasks = [];
      target.__CLIMB_ENGLISH_MOBILE_QA__!.subtitleCommits.length = 0;
      target.__mobileLongTaskObserver?.disconnect();
      target.__mobileLongTaskObserver = new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) target.__mobileLongTasks!.push(entry.duration);
      });
      target.__mobileLongTaskObserver.observe({ entryTypes: ['longtask'] });
    });

    await page.getByRole('button', { name: '连播' }).click();
    await page.waitForTimeout(8_000);
    await page.getByRole('button', { name: '暂停' }).click();

    const metrics = await page.evaluate(() => {
      const target = window as typeof window & { __mobileLongTasks?: number[] };
      const commits = target.__CLIMB_ENGLISH_MOBILE_QA__?.subtitleCommits ?? [];
      const tasks = target.__mobileLongTasks ?? [];
      return {
        longTasks: tasks,
        longTasksOver100Ms: tasks.filter((duration) => duration > 100),
        subtitleCommitCount: commits.length,
        maxSubtitleCommitMs: Math.max(0, ...commits.map((commit) => commit.actualDuration)),
        cardCount: document.querySelectorAll('.subtitle-card').length,
      };
    });
    const metricsPath = testInfo.outputPath('pixel-7-6x-performance.json');
    await writeFile(metricsPath, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');
    await testInfo.attach('pixel-7-6x-performance.json', {
      path: metricsPath,
      contentType: 'application/json',
    });
    expect(metrics.longTasksOver100Ms).toEqual([]);
    expect(metrics.maxSubtitleCommitMs).toBeLessThan(100);
    expect(metrics.subtitleCommitCount).toBeGreaterThan(1);
    expect(metrics.cardCount).toBeLessThanOrEqual(36);
  } finally {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  }

  const afterPlayback = await layoutHealth(page);
  expect(afterPlayback.horizontalOverflow).toBe(0);
  expect(afterPlayback.intersectingCards).toBeGreaterThan(0);
  await captureViewport(page, testInfo, 'mobile-virtualized-pixel7');
});

test('portrait and landscape preserve playback state with unobstructed 44px controls', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'chromium', 'mobile browser projects only');
  test.setTimeout(60_000);
  const isMobileWebKit = testInfo.project.name === 'mobile-webkit';
  const portraitViewport = isMobileWebKit
    ? { width: 390, height: 844 }
    : { width: 412, height: 915 };
  const landscapeViewport = isMobileWebKit
    ? { width: 844, height: 390 }
    : { width: 915, height: 412 };
  await page.setViewportSize(portraitViewport);
  await installFaithfulFakeYoutube(page);
  await openInnsbruck(page);
  await page.getByRole('button', { name: '连播' }).click();
  await expect
    .poll(async () => (await readSurfaceGeometry(page)).previewCurrentTime)
    .toBeGreaterThan(1);
  await expect
    .poll(async () => (await readSurfaceGeometry(page)).activeWordIndex)
    .toBeGreaterThanOrEqual(0);
  await page.getByRole('button', { name: '暂停' }).click();

  const list = page.locator('.subtitle-list');
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight * (10 / 2242);
  });
  const cueTen = page.locator('.subtitle-card[data-cue-index="10"]');
  await expect(cueTen).toBeVisible();
  await cueTen.click();
  await expect(page.locator('.subtitle-card.active')).toHaveAttribute('data-cue-index', '10');
  await expect
    .poll(async () => (await readSurfaceGeometry(page)).activeWordIndex)
    .toBeGreaterThanOrEqual(0);
  await page.getByRole('button', { name: '暂停' }).click();

  const portraitState = await readSurfaceGeometry(page);
  const portraitHealth = await layoutHealth(page);
  expect(portraitHealth.horizontalOverflow).toBe(0);
  expect(portraitHealth.intersectingCards).toBeGreaterThan(0);
  expect(portraitHealth.activeOffsetFromListTop).toBeLessThanOrEqual(24);
  expect(await page.locator('video[controls]').count()).toBe(0);
  expect((await readFakeYoutubeState(page)).playerVars).toMatchObject({ controls: 0 });
  await captureViewport(page, testInfo, 'mobile-layout-portrait');

  const lastCoachButton = page.locator('.coach-bottom button').last();
  if ((await lastCoachButton.count()) > 0) {
    await lastCoachButton.scrollIntoViewIfNeeded();
    await page.evaluate(() => window.scrollBy(0, 80));
    const clearance = await page.evaluate(() => {
      const button = Array.from(document.querySelectorAll<HTMLElement>('.coach-bottom button')).at(
        -1
      );
      const nav = document.querySelector<HTMLElement>('.view-nav');
      if (!button || !nav) return -1;
      return nav.getBoundingClientRect().top - button.getBoundingClientRect().bottom;
    });
    expect(clearance).toBeGreaterThanOrEqual(0);
  }
  await page.evaluate(() =>
    window.scrollTo(0, Math.max(240, document.documentElement.scrollHeight / 3))
  );
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);

  await page.setViewportSize(landscapeViewport);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const landscapeState = await readSurfaceGeometry(page);
  expect(landscapeState.source).toBe(portraitState.source);
  expect(landscapeState.previewCurrentTime).toBeCloseTo(portraitState.previewCurrentTime, 1);
  expect(landscapeState.activeCueIndex).toBe(portraitState.activeCueIndex);
  expect(landscapeState.activeWordIndex).toBe(portraitState.activeWordIndex);
  await expect
    .poll(async () => (await layoutHealth(page)).activeOffsetFromListTop)
    .toBeLessThanOrEqual(24);

  const landscape = await page.evaluate(() => {
    const video = document.querySelector<HTMLElement>('.cue-media-surface');
    const controls = document.querySelector<HTMLElement>('.bilingual-controls');
    const activeEnglish = document.querySelector<HTMLElement>('.subtitle-card.active .subtitle-en');
    const nav = document.querySelector<HTMLElement>('.view-nav');
    const visible = (element: HTMLElement | null) => {
      if (!element) return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0;
    };
    const overlaps = (left: DOMRect, right: DOMRect) =>
      left.left < right.right &&
      left.right > right.left &&
      left.top < right.bottom &&
      left.bottom > right.top;
    const navRect = nav?.getBoundingClientRect();
    const contentRects = [video, controls, activeEnglish]
      .filter((element): element is HTMLElement => Boolean(element))
      .map((element) => element.getBoundingClientRect());
    const touchTargets = Array.from(
      document.querySelectorAll<HTMLElement>(
        '.bilingual-controls button, .course-option, .view-tab, .source-link'
      )
    )
      .filter(visible)
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          label: element.getAttribute('aria-label') || element.textContent?.trim(),
          width: rect.width,
          height: rect.height,
        };
      });
    return {
      horizontalOverflow: Math.max(0, document.documentElement.scrollWidth - innerWidth),
      videoVisible: visible(video),
      videoHeight: video?.getBoundingClientRect().height ?? 0,
      controlsVisible: visible(controls),
      activeEnglishVisible: visible(activeEnglish),
      navOverlap: navRect ? contentRects.some((rect) => overlaps(rect, navRect)) : true,
      touchTargets,
    };
  });
  expect(landscape.horizontalOverflow).toBe(0);
  expect(landscape.videoVisible).toBe(true);
  expect(landscape.videoHeight).toBeGreaterThan(140);
  expect(landscape.controlsVisible).toBe(true);
  expect(landscape.activeEnglishVisible).toBe(true);
  expect(landscape.navOverlap).toBe(false);
  expect(landscape.touchTargets.length).toBeGreaterThan(8);
  for (const target of landscape.touchTargets) {
    expect.soft(target.width, `${target.label} width`).toBeGreaterThanOrEqual(44);
    expect.soft(target.height, `${target.label} height`).toBeGreaterThanOrEqual(44);
  }
  await captureViewport(page, testInfo, 'mobile-layout-landscape');

  await page.evaluate(() => window.scrollTo(0, 180));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await page.setViewportSize(portraitViewport);
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
  const portraitAgain = await readSurfaceGeometry(page);
  expect(portraitAgain.source).toBe(portraitState.source);
  expect(portraitAgain.previewCurrentTime).toBeCloseTo(portraitState.previewCurrentTime, 1);
  expect(portraitAgain.activeCueIndex).toBe(portraitState.activeCueIndex);
  expect(portraitAgain.activeWordIndex).toBe(portraitState.activeWordIndex);
  await expect
    .poll(async () => (await layoutHealth(page)).activeOffsetFromListTop)
    .toBeLessThanOrEqual(24);
  await captureViewport(page, testInfo, 'mobile-layout-portrait-again');

  // The preserved studio stays mounted while another tab is active. Rotation
  // must not let that hidden component reset the visible tab's page position.
  await page.getByRole('button', { name: '听力', exact: true }).click();
  await expect(page.locator('.video-studio-preserver')).toBeHidden();
  await page.evaluate(() => {
    document.body.style.minHeight = '2200px';
    window.scrollTo(0, 360);
  });
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await page.setViewportSize(landscapeViewport);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);

  // Active wide/short layouts that do not enter the compact landscape grid
  // must also retain their outer scroll position.
  await page.setViewportSize(portraitViewport);
  await page.getByRole('button', { name: '今天', exact: true }).click();
  await expect(page.locator('.subtitle-list')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 360));
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
  await page.setViewportSize({ width: landscapeViewport.width, height: 600 });
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
      )
  );
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100);
});

test('mobile tab round trip keeps top and distant active cues mounted', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'chromium', 'mobile browser projects only');
  await page.setViewportSize(
    testInfo.project.name === 'mobile-webkit'
      ? { width: 390, height: 844 }
      : { width: 412, height: 915 }
  );
  await installFaithfulFakeYoutube(page);
  await openInnsbruck(page);

  const list = page.locator('.subtitle-list');
  await list.evaluate((element) => {
    element.scrollTop = element.scrollHeight * 0.55;
  });
  await expect.poll(async () => Math.min(...(await mountedCueIndices(page)))).toBeGreaterThan(600);
  const distantCue = page.locator('.subtitle-card.filler').first();
  const distantCueIndex = await distantCue.getAttribute('data-cue-index');
  expect(distantCueIndex).not.toBeNull();
  await distantCue.click();
  await expect(page.locator('.subtitle-card.active')).toHaveAttribute(
    'data-cue-index',
    distantCueIndex!
  );

  const preserver = page.locator('.video-studio-preserver');
  await preserver.evaluate((element) => element.setAttribute('data-mobile-instance', 'same'));
  await page.getByRole('button', { name: '听力', exact: true }).click();
  await expect(preserver).toBeHidden();
  await expect(page.locator('section[aria-label="听力库"]')).toBeVisible();

  await page.getByRole('button', { name: '今天', exact: true }).click();
  await expect(preserver).toBeVisible();
  await expect(preserver).toHaveAttribute('data-mobile-instance', 'same');
  await expect(page.locator('.subtitle-card.active')).toHaveAttribute(
    'data-cue-index',
    distantCueIndex!
  );
  await expect(page.locator('.subtitle-card.active')).toBeVisible();

  await list.evaluate((element) => {
    element.scrollTop = 0;
  });
  await expect(page.locator('.subtitle-card[data-cue-index="0"]')).toBeVisible();
  const firstCue = page.locator('.subtitle-card[data-cue-index="0"]');
  await firstCue.click();
  await expect(page.locator('.subtitle-card.active')).toHaveAttribute('data-cue-index', '0');

  await page.getByRole('button', { name: '听力', exact: true }).click();
  await expect(preserver).toBeHidden();
  await expect(page.locator('section[aria-label="听力库"]')).toBeVisible();

  await page.getByRole('button', { name: '今天', exact: true }).click();
  await expect(preserver).toBeVisible();
  await expect(preserver).toHaveAttribute('data-mobile-instance', 'same');
  await expect(page.locator('.subtitle-card.active')).toHaveAttribute('data-cue-index', '0');
  await expect(page.locator('.subtitle-card.active')).toBeVisible();
  await expect
    .poll(async () => (await layoutHealth(page)).activeOffsetFromListTop)
    .toBeLessThan(24);
});
