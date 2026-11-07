/**
 * Lightweight online/offline signalling for LEARN WISE.
 *
 * Offline learning / background sync is NOT supported.
 * When offline, learning attempts must not be queued locally —
 * progress is only persisted after a successful API response.
 * Server-side attempt idempotency prevents duplicate rewards on retry.
 */

type Listener = (online: boolean) => void;

let online = true;
const listeners = new Set<Listener>();

export function isOnline(): boolean {
  return online;
}

export function subscribeNetwork(listener: Listener): () => void {
  listeners.add(listener);
  listener(online);
  return () => {
    listeners.delete(listener);
  };
}

function setOnline(next: boolean) {
  if (online === next) return;
  online = next;
  listeners.forEach((l) => l(online));
}

export function markNetworkReachable() {
  setOnline(true);
}

export function markNetworkUnreachable() {
  setOnline(false);
}

/** Best-effort probe — does not claim sync or queue work. */
export async function probeApiReachable(
  healthUrl: string
): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(healthUrl, {
      method: "GET",
      signal: controller.signal,
    });
    clearTimeout(timer);
    const ok = res.ok;
    setOnline(ok);
    return ok;
  } catch {
    setOnline(false);
    return false;
  }
}

export function networkErrorMessage(err: unknown): string | null {
  if (!(err instanceof Error)) return null;
  if (
    /failed to fetch|network request failed|networkerror|aborted|timed out|timeout/i.test(
      err.message
    )
  ) {
    return "You appear to be offline. Connect to the internet to continue learning — progress is saved only when online.";
  }
  return null;
}
