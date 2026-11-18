const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ??
  (process.env.NODE_ENV === "production"
    ? "https://api.siwiapp.shop/api"
    : "http://localhost:4100/api");

export class ApiClientError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(
    message: string,
    status: number,
    details?: unknown,
    code?: string
  ) {
    super(message);
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

function errorCode(body: { code?: string; details?: { code?: string } }) {
  return body.code ?? body.details?.code;
}

function sessionMessage(status: number, code?: string, fallback?: string) {
  if (code === "SESSION_REVOKED") {
    return (
      fallback ||
      "You've been logged out because your account was opened on another device."
    );
  }
  if (status === 401) {
    return fallback || "Your session has expired. Please sign in again.";
  }
  if (status === 403) {
    return fallback || "You do not have permission for this action.";
  }
  return fallback || "Request failed";
}

export const LOGIN_REQUEST_TIMEOUT_MS = 25_000;

function mergeAbortSignals(
  external: AbortSignal | null | undefined,
  timeoutMs: number | undefined
): { signal?: AbortSignal; clear: () => void } {
  if (!timeoutMs || timeoutMs <= 0) {
    return { signal: external ?? undefined, clear: () => undefined };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onExternalAbort = () => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", onExternalAbort, { once: true });
  }
  return {
    signal: controller.signal,
    clear: () => {
      clearTimeout(timer);
      external?.removeEventListener("abort", onExternalAbort);
    },
  };
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & {
    token?: string;
    /** Client-side request timeout in ms. Login uses ~25s. No automatic retries. */
    timeoutMs?: number;
  } = {}
): Promise<T> {
  const { token, headers, timeoutMs, signal: externalSignal, ...rest } = options;
  const { signal, clear } = mergeAbortSignals(externalSignal, timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...rest,
      signal,
      headers: {
        "Content-Type": "application/json",
        "X-Client-Platform": "web",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch (err) {
    clear();
    const aborted =
      (err instanceof Error && err.name === "AbortError") ||
      (typeof DOMException !== "undefined" &&
        err instanceof DOMException &&
        err.name === "AbortError");
    throw new ApiClientError(
      aborted
        ? "The sign-in request timed out. Please try again."
        : "Unable to connect. Please check your internet connection and try again.",
      0,
      undefined,
      aborted ? "REQUEST_TIMEOUT" : "NETWORK_UNAVAILABLE"
    );
  } finally {
    clear();
  }

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = errorCode(body);
    throw new ApiClientError(
      sessionMessage(response.status, code, body.error),
      response.status,
      body.details,
      code
    );
  }

  return body.data as T;
}

export async function apiUpload<T>(
  path: string,
  formData: FormData,
  token?: string
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: {
      "X-Client-Platform": "web",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: formData,
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = errorCode(body);
    throw new ApiClientError(
      sessionMessage(response.status, code, body.error),
      response.status,
      body.details,
      code
    );
  }

  return body.data as T;
}

export { API_URL };
