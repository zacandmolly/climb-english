export type VideoLoadFailure = {
  materialId: string;
  chunkUrl: string;
  message: string;
  error: Error;
};

export function describeVideoLoadFailure(materialId: string, cause: unknown): VideoLoadFailure {
  const originalMessage = cause instanceof Error ? cause.message : String(cause);
  const chunkUrl = extractModuleUrl(originalMessage) ?? `video-module:${materialId}`;
  const message = `字幕数据加载失败：${materialId}（${chunkUrl}）`;
  const error = new Error(`${message}: ${originalMessage}`);
  if (cause instanceof Error && cause.stack)
    error.stack = `${error.stack}\nCaused by: ${cause.stack}`;
  return { materialId, chunkUrl, message, error };
}

function extractModuleUrl(message: string): string | null {
  const match = message.match(/(?:https?:\/\/[^\s)]+|\/(?:assets|src)\/[^\s)]+)/u);
  return match?.[0]?.replace(/[),.;]+$/u, '') ?? null;
}
