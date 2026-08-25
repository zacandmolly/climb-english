import type { Page } from '@playwright/test';

// A deterministic fake of the YouTube IFrame API that is FAITHFUL to the one
// behavior the real API cannot be tested against offline: the player
// constructor REPLACES the host element in the DOM with an <iframe> (the
// original element is removed, not wrapped). Any player code that assumes the
// host div still exists, or that lets the iframe escape its React-owned
// wrapper, reproduces here as residue iframes, a collapsed parent, or an
// iframe that blocks the preview video.
//
// Modes:
//   ok                  - ready on the next macrotask, no errors
//   never-ready         - player is created but onReady never fires (slow/hung)
//   slow-ready          - onReady fires after slowReadyMs
//   error-after-ready   - onReady, then onError after failAfterReadyMs
//   constructor-throw   - the Player constructor throws synchronously

export type FakeYoutubeMode =
  'ok' | 'never-ready' | 'slow-ready' | 'error-after-ready' | 'constructor-throw';

export type FakeYoutubeInstallOptions = {
  installYt?: boolean;
  mode?: FakeYoutubeMode;
  slowReadyMs?: number;
  failAfterReadyMs?: number;
};

export type FakeYoutubeState = {
  currentTime: number;
  playbackRate: number;
  playing: boolean;
  ready: boolean;
  failed: boolean;
  seekTargets: number[];
  constructCount: number;
  destroyCount: number;
  iframeCount: number;
  playerVars: Record<string, unknown> | null;
};

export type SurfaceGeometry = {
  source: string | null;
  youtubeState: string | null;
  iframeCount: number;
  iframeInHost: boolean;
  wrapperOpacity: string | null;
  wrapperPointerEvents: string | null;
  wrapperWidth: number;
  wrapperHeight: number;
  surfaceHeight: number;
  previewHeight: number;
  previewOpacity: string | null;
  centerTarget: string;
  activeCueIndex: number;
  activeWordIndex: number;
  youtubePlaying: boolean;
  youtubeCurrentTime: number;
  previewCurrentTime: number;
  previewPaused: boolean;
};

export async function installFaithfulFakeYoutube(
  page: Page,
  options: FakeYoutubeInstallOptions = {}
): Promise<void> {
  const { installYt = true, mode = 'ok', slowReadyMs = 3_000, failAfterReadyMs = 1_500 } = options;
  await page.addInitScript(
    (args) => {
      const state: FakeYoutubeState = {
        currentTime: 0,
        playbackRate: 1,
        playing: false,
        ready: false,
        failed: false,
        seekTargets: [],
        constructCount: 0,
        destroyCount: 0,
        iframeCount: 0,
        playerVars: null,
      };
      Object.defineProperty(window, '__fakeYoutubeState', { value: state, configurable: true });

      const config = {
        mode: args.mode,
        slowReadyMs: args.slowReadyMs,
        failAfterReadyMs: args.failAfterReadyMs,
      };
      Object.defineProperty(window, '__fakeYoutubeConfig', { value: config, configurable: true });

      class FakeYoutubePlayer {
        private readonly iframe: HTMLIFrameElement;
        private readonly events: Record<string, (event?: { data: number }) => void>;
        private timer: number | null = null;

        constructor(element: HTMLElement, playerConfig: Record<string, unknown>) {
          if (config.mode === 'constructor-throw') {
            throw new Error('fake YouTube constructor failure');
          }
          const parent = element.parentElement;
          if (!parent) throw new Error('fake YouTube player needs a parent host');

          // Faithful to the real IFrame API: the host element is REPLACED by
          // the iframe (removed from the DOM), never wrapped.
          const iframe = document.createElement('iframe');
          iframe.setAttribute('data-fake-youtube', '1');
          iframe.title = 'YouTube video player';
          iframe.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
          iframe.style.position = 'absolute';
          iframe.style.inset = '0';
          iframe.style.width = '100%';
          iframe.style.height = '100%';
          iframe.style.border = '0';
          parent.replaceChild(iframe, element);
          element.remove();

          this.iframe = iframe;
          state.playerVars = (playerConfig.playerVars ?? null) as Record<string, unknown> | null;
          this.events = (playerConfig.events ?? {}) as Record<
            string,
            (event?: { data: number }) => void
          >;
          state.constructCount += 1;
          state.iframeCount = document.querySelectorAll('iframe[data-fake-youtube]').length;

          if (config.mode === 'never-ready') return;
          const readyDelay = config.mode === 'slow-ready' ? config.slowReadyMs : 0;
          window.setTimeout(() => {
            state.ready = true;
            this.events.onReady?.();
          }, readyDelay);
          if (config.mode === 'error-after-ready') {
            window.setTimeout(() => {
              state.failed = true;
              this.events.onError?.();
            }, config.failAfterReadyMs);
          }
        }

        seekTo(seconds: number): void {
          state.currentTime = seconds;
          state.seekTargets.push(seconds);
        }

        playVideo(): void {
          state.playing = true;
          this.events.onStateChange?.({ data: 1 });
          if (this.timer === null) {
            this.timer = window.setInterval(() => {
              if (state.playing) state.currentTime += 0.25 * state.playbackRate;
            }, 250);
          }
        }

        pauseVideo(): void {
          state.playing = false;
          this.events.onStateChange?.({ data: 2 });
        }

        setPlaybackRate(rate: number): void {
          state.playbackRate = rate;
        }

        getCurrentTime(): number {
          return state.currentTime;
        }

        destroy(): void {
          if (this.iframe?.isConnected) this.iframe.remove();
          if (this.timer !== null) window.clearInterval(this.timer);
          this.timer = null;
          state.playing = false;
          state.destroyCount += 1;
          state.iframeCount = document.querySelectorAll('iframe[data-fake-youtube]').length;
        }
      }

      Object.defineProperty(window, '__FakeYoutubePlayer', {
        value: FakeYoutubePlayer,
        configurable: true,
      });
      Object.defineProperty(window, '__installFakeYt', {
        value: () => {
          Object.defineProperty(window, 'YT', {
            value: {
              Player: FakeYoutubePlayer,
              PlayerState: { PLAYING: 1, PAUSED: 2, ENDED: 0 },
            },
            configurable: true,
          });
        },
        configurable: true,
      });

      if (args.installYt) {
        const installFakeYt = (window as unknown as { __installFakeYt: () => void })
          .__installFakeYt;
        installFakeYt();
      }
    },
    { installYt, mode, slowReadyMs, failAfterReadyMs }
  );
}

export async function installPlayerTestHooks(
  page: Page,
  hooks: { youtubeSlowTimeoutMs: number; youtubeFailureTimeoutMs?: number }
): Promise<void> {
  await page.addInitScript((timeouts) => {
    Object.defineProperty(window, '__CLIMB_ENGLISH_PLAYER_HOOKS__', {
      value: timeouts,
      configurable: true,
    });
  }, hooks);
}

export async function readFakeYoutubeState(page: Page): Promise<FakeYoutubeState> {
  return page.evaluate(() => {
    return (window as unknown as { __fakeYoutubeState: FakeYoutubeState }).__fakeYoutubeState;
  });
}

export async function setFakeYoutubeMode(page: Page, mode: FakeYoutubeMode): Promise<void> {
  await page.evaluate((nextMode) => {
    const config = (window as unknown as { __fakeYoutubeConfig?: { mode: string } })
      .__fakeYoutubeConfig;
    if (config) config.mode = nextMode;
  }, mode);
}

export async function readSurfaceGeometry(page: Page): Promise<SurfaceGeometry> {
  return page.evaluate(() => {
    const surface = document.querySelector<HTMLElement>('.cue-media-surface');
    const wrapper = document.querySelector<HTMLElement>('.youtube-player-host');
    const preview = document.querySelector<HTMLVideoElement>('video.preview-video');
    const iframe = document.querySelector<HTMLElement>('iframe[data-fake-youtube]');
    const active = document.querySelector<HTMLElement>('.subtitle-card.active');
    const activeWords = active?.querySelector<HTMLElement>('.karaoke-words');
    const fake = (window as unknown as { __fakeYoutubeState?: FakeYoutubeState })
      .__fakeYoutubeState;

    let centerTarget = '';
    if (surface) {
      const rect = surface.getBoundingClientRect();
      const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
      centerTarget = hit
        ? `${hit.tagName.toLowerCase()}${hit.classList ? `.${Array.from(hit.classList).join('.')}` : ''}`
        : '';
    }
    const wrapperRect = wrapper?.getBoundingClientRect();
    const previewRect = preview?.getBoundingClientRect();

    return {
      source: surface?.getAttribute('data-media-source') ?? null,
      youtubeState: surface?.getAttribute('data-youtube-state') ?? null,
      iframeCount: document.querySelectorAll('iframe[data-fake-youtube]').length,
      iframeInHost: iframe ? Boolean(iframe.closest('.youtube-player-host')) : false,
      wrapperOpacity: wrapper ? getComputedStyle(wrapper).opacity : null,
      wrapperPointerEvents: wrapper ? getComputedStyle(wrapper).pointerEvents : null,
      wrapperWidth: wrapperRect ? Math.round(wrapperRect.width) : 0,
      wrapperHeight: wrapperRect ? Math.round(wrapperRect.height) : 0,
      surfaceHeight: surface ? Math.round(surface.getBoundingClientRect().height) : 0,
      previewHeight: previewRect ? Math.round(previewRect.height) : 0,
      previewOpacity: preview ? getComputedStyle(preview).opacity : null,
      centerTarget,
      activeCueIndex: active ? Number(active.getAttribute('data-cue-index')) : -1,
      activeWordIndex: activeWords ? Number(activeWords.getAttribute('data-current-word')) : -1,
      youtubePlaying: fake?.playing ?? false,
      youtubeCurrentTime: fake?.currentTime ?? 0,
      previewCurrentTime: preview?.currentTime ?? -1,
      previewPaused: preview?.paused ?? true,
    };
  });
}
