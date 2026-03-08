/**
 * Lightweight analytics event logger.
 * In dev mode, events are logged to the console.
 * Abstract this to send to a real analytics service in production.
 */

interface TrackPayload {
  [key: string]: string | number | boolean | undefined;
}

export function track(event: string, payload?: TrackPayload): void {
  if (import.meta.env.DEV) {
    console.log(`[analytics] ${event}`, payload ?? "");
  }
  // Future: send to analytics endpoint
  // fetch('/api/analytics', { method: 'POST', body: JSON.stringify({ event, payload, ts: Date.now() }) });
}
