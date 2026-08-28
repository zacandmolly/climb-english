import { useCallback, useEffect, useState } from 'react';
import { FEEDBACK_API_BASE } from '../lib/feedback';
import {
  feedbackServiceState,
  initialFeedbackServiceState,
  probeFeedbackService,
  type FeedbackServiceState,
} from '../lib/runtimeServices';

const HEALTH_TIMEOUT_MS = 5_000;

function currentHostname(): string {
  return typeof window === 'undefined' ? '' : window.location.hostname;
}

export function useFeedbackService(): {
  service: FeedbackServiceState;
  canUseAiFeedback: boolean;
  markUnavailable: () => void;
} {
  const [service, setService] = useState<FeedbackServiceState>(() =>
    initialFeedbackServiceState(FEEDBACK_API_BASE, currentHostname())
  );

  useEffect(() => {
    if (initialFeedbackServiceState(FEEDBACK_API_BASE, currentHostname()).status === 'offline') {
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
    let active = true;

    void probeFeedbackService({
      apiBase: FEEDBACK_API_BASE,
      hostname: currentHostname(),
      signal: controller.signal,
    })
      .then((nextService) => {
        if (active) setService(nextService);
      })
      .finally(() => window.clearTimeout(timeout));

    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, []);

  const markUnavailable = useCallback(() => {
    setService(feedbackServiceState('unavailable'));
  }, []);

  return {
    service,
    canUseAiFeedback: service.status === 'online',
    markUnavailable,
  };
}
