let loaderPromise: Promise<void> | null = null;
let loaderScript: HTMLScriptElement | null = null;
let loaderReady: (() => void) | null = null;
let loaderError: (() => void) | null = null;
let loaderPreviousReady: (() => void) | undefined;
let loaderReject: ((reason: Error) => void) | null = null;

function clearLoader(removeScript: boolean) {
  if (loaderScript && loaderError) loaderScript.removeEventListener('error', loaderError);
  if (window.onYouTubeIframeAPIReady === loaderReady) {
    window.onYouTubeIframeAPIReady = loaderPreviousReady;
  }
  if (removeScript && loaderScript?.isConnected) loaderScript.remove();
  loaderPromise = null;
  loaderScript = null;
  loaderReady = null;
  loaderError = null;
  loaderPreviousReady = undefined;
  loaderReject = null;
}

export function resetYoutubeIframeApiLoader() {
  if (window.YT?.Player) return;
  const reject = loaderReject;
  clearLoader(true);
  document.querySelector<HTMLScriptElement>('script[data-youtube-iframe-api]')?.remove();
  reject?.(new Error('YouTube IFrame API load restarted'));
}

export function loadYoutubeIframeApi({ retry = false } = {}): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (retry) resetYoutubeIframeApiLoader();
  if (loaderPromise) return loaderPromise;

  const existing = document.querySelector<HTMLScriptElement>('script[data-youtube-iframe-api]');
  const script = existing ?? document.createElement('script');
  if (!existing) {
    script.src = 'https://www.youtube.com/iframe_api';
    script.dataset.youtubeIframeApi = 'true';
    script.async = true;
  }

  let resolvePromise: () => void = () => undefined;
  let rejectPromise: (reason: Error) => void = () => undefined;
  const promise = new Promise<void>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  const previousReady = window.onYouTubeIframeAPIReady;
  const handleReady = () => {
    if (loaderReady !== handleReady) return;
    try {
      previousReady?.();
    } finally {
      clearLoader(false);
      resolvePromise();
    }
  };
  const handleError = () => {
    if (loaderError !== handleError) return;
    clearLoader(true);
    rejectPromise(new Error('YouTube IFrame API failed to load'));
  };

  loaderPromise = promise;
  loaderScript = script;
  loaderReady = handleReady;
  loaderError = handleError;
  loaderPreviousReady = previousReady;
  loaderReject = rejectPromise;
  window.onYouTubeIframeAPIReady = handleReady;
  script.addEventListener('error', handleError, { once: true });
  if (!existing) document.head.appendChild(script);
  return promise;
}

export function ensureYoutubeMount(wrapper: HTMLDivElement | null): HTMLDivElement | null {
  if (!wrapper) return null;
  let mount = wrapper.querySelector<HTMLDivElement>(':scope > .youtube-player-mount');
  if (!mount?.isConnected) {
    clearYoutubeMount(wrapper);
    mount = document.createElement('div');
    mount.className = 'youtube-player-mount';
    wrapper.appendChild(mount);
  }
  return mount;
}

export function clearYoutubeMount(wrapper: HTMLDivElement | null) {
  wrapper?.querySelectorAll('iframe, .youtube-player-mount').forEach((node) => node.remove());
}
