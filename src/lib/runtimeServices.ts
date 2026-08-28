export type FeedbackServiceStatus = 'offline' | 'checking' | 'online' | 'unavailable';

export type FeedbackServiceState = {
  status: FeedbackServiceStatus;
  message: string;
};

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const FEEDBACK_MESSAGES: Record<FeedbackServiceStatus, string> = {
  offline: '公开版当前为离线反馈：录音回放和练习建议可用，AI 不会分析本次录音。',
  checking: '正在检查 AI 反馈服务；确认在线前，录音只会保留在当前浏览器。',
  online: 'AI 反馈在线：录音会发送到反馈服务，浏览器语音识别也可能生成文本。',
  unavailable: 'AI 反馈暂不可用：本次只提供录音回放和离线练习建议。',
};

export function normalizeApiBaseUrl(value: unknown): string {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  return trimmed.replace(/\/+$/, '');
}

export function isStaticFeedbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === 'github.io' || normalized.endsWith('.github.io');
}

export function feedbackRequestUrl(apiBase: string): string {
  return `${normalizeApiBaseUrl(apiBase)}/api/speaking-feedback`;
}

export function initialFeedbackServiceState(
  apiBase: string,
  hostname: string
): FeedbackServiceState {
  if (!normalizeApiBaseUrl(apiBase) && isStaticFeedbackHostname(hostname)) {
    return feedbackServiceState('offline');
  }
  return feedbackServiceState('checking');
}

export function feedbackServiceState(status: FeedbackServiceStatus): FeedbackServiceState {
  return { status, message: FEEDBACK_MESSAGES[status] };
}

export async function probeFeedbackService({
  apiBase,
  hostname,
  fetcher = fetch,
  signal,
}: {
  apiBase: string;
  hostname: string;
  fetcher?: Fetcher;
  signal?: AbortSignal;
}): Promise<FeedbackServiceState> {
  const initial = initialFeedbackServiceState(apiBase, hostname);
  if (initial.status === 'offline') return initial;

  try {
    const response = await fetcher(`${normalizeApiBaseUrl(apiBase)}/api/health`, {
      headers: { Accept: 'application/json' },
      signal,
    });
    if (!response.ok) return feedbackServiceState('unavailable');

    const payload = (await response.json()) as { ok?: unknown; ai?: unknown };
    if (payload.ok !== true || payload.ai !== true) {
      return feedbackServiceState('unavailable');
    }
    return feedbackServiceState('online');
  } catch {
    return feedbackServiceState('unavailable');
  }
}

export function resolveErrorReportEndpoint(configured: unknown, isDevelopment: boolean): string {
  const normalized = normalizeApiBaseUrl(configured);
  if (normalized) return normalized;
  return isDevelopment ? '/api/errors' : '';
}

export function isUnsupportedErrorReportStatus(status: number): boolean {
  return [401, 403, 404, 405, 410, 429].includes(status);
}
