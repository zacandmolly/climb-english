import { normalizeApiBaseUrl } from './runtimeServices';

export { makeClientDemoFeedback } from './offlineFeedback';

export const FEEDBACK_API_BASE = normalizeApiBaseUrl(import.meta.env.VITE_FEEDBACK_API_BASE);
