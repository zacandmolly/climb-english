import type { FeedbackServiceState } from '../lib/runtimeServices';

export function FeedbackServiceNotice({ service }: { service: FeedbackServiceState }) {
  return (
    <p
      className={`feedback-service-notice ${service.status}`}
      data-feedback-service={service.status}
      role="status"
    >
      {service.message}
    </p>
  );
}
