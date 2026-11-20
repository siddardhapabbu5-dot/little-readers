import { Platform } from "react-native";
import {
  getOrCreateInstallationId,
  getToken,
  getUser,
  saveSessionRevokedMessage,
} from "./secure";
import {
  markNetworkReachable,
  markNetworkUnreachable,
} from "./network";
import { notifyUnauthorized } from "./session";

const API_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ??
  // Release/EAS builds must set EXPO_PUBLIC_API_URL; live default avoids localhost APKs.
  "https://api.siwiapp.shop/api";

export class ApiError extends Error {
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

/** Device lock headers only on real phones — not Expo web preview. */
function isNativeMobileClient() {
  return Platform.OS === "ios" || Platform.OS === "android";
}

function errorCode(body: { code?: string; details?: { code?: string } }) {
  return body.code ?? body.details?.code;
}

function handleAuthFailure(
  status: number,
  auth: string | undefined,
  body: { error?: string; code?: string; details?: { code?: string } }
) {
  if (status !== 401 || !auth) return;
  const code = errorCode(body);
  // A wrong Parent PIN is not a dead session; logging out would leave the PIN screen.
  if (code === "PIN_INVALID") return;
  if (code === "SESSION_REVOKED") {
    void saveSessionRevokedMessage(
      body.error ||
        "You've been logged out because your account was opened on another device."
    );
  }
  notifyUnauthorized();
}

export const LOGIN_REQUEST_TIMEOUT_MS = 25_000;

/** Fetch rejects plain objects as body (becomes "[object Object]"). Stringify them. */
function serializeRequestBody(
  body: BodyInit | Record<string, unknown> | unknown[] | null | undefined
): BodyInit | undefined {
  if (body == null) return undefined;
  if (typeof body === "string") return body;
  if (typeof Blob !== "undefined" && body instanceof Blob) return body;
  if (typeof FormData !== "undefined" && body instanceof FormData) return body;
  if (typeof URLSearchParams !== "undefined" && body instanceof URLSearchParams) {
    return body;
  }
  if (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) return body;
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView(body)) {
    return body as BodyInit;
  }
  if (typeof body === "object") return JSON.stringify(body);
  return body as BodyInit;
}

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
  options: Omit<RequestInit, "body"> & {
    token?: string;
    mobile?: boolean;
    /** Client-side request timeout in ms (login uses ~25s). No automatic retries. */
    timeoutMs?: number;
    /** Plain objects are JSON-stringified; FormData/Blob/string pass through. */
    body?: BodyInit | Record<string, unknown> | unknown[] | null;
  } = {}
): Promise<T> {
  const {
    token,
    mobile = isNativeMobileClient(),
    headers,
    timeoutMs,
    signal: externalSignal,
    body: requestBody,
    ...rest
  } = options;
  const auth = token ?? (await getToken()) ?? undefined;
  const installationId = mobile ? await getOrCreateInstallationId() : undefined;
  const { signal, clear } = mergeAbortSignals(externalSignal, timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...rest,
      body: serializeRequestBody(requestBody),
      signal,
      headers: {
        "Content-Type": "application/json",
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        // Always send real platform (web|ios|android). Never map web → android.
        "X-Client-Platform": Platform.OS,
        ...(mobile && installationId
          ? { "X-Installation-Id": installationId }
          : {}),
        ...headers,
      },
    });
  } catch (err) {
    clear();
    markNetworkUnreachable();
    const aborted =
      (err instanceof Error && err.name === "AbortError") ||
      (typeof DOMException !== "undefined" && err instanceof DOMException && err.name === "AbortError");
    throw new ApiError(
      aborted
        ? "The sign-in request timed out. Please try again."
        : "We couldn't reach Learn Wise. Check your connection and try again.",
      0,
      undefined,
      aborted ? "REQUEST_TIMEOUT" : "NETWORK_UNAVAILABLE"
    );
  } finally {
    clear();
  }

  markNetworkReachable();
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    handleAuthFailure(response.status, auth, body);
    throw new ApiError(
      body.error ?? "Request failed",
      response.status,
      body.details,
      errorCode(body)
    );
  }
  return body.data as T;
}

/** Multipart upload — do not set Content-Type (browser/RN sets boundary). */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  options: { token?: string; mobile?: boolean } = {}
): Promise<T> {
  const mobile = options.mobile ?? isNativeMobileClient();
  const auth = options.token ?? (await getToken()) ?? undefined;
  const installationId = mobile ? await getOrCreateInstallationId() : undefined;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      method: "POST",
      headers: {
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
        "X-Client-Platform": Platform.OS,
        ...(mobile && installationId
          ? { "X-Installation-Id": installationId }
          : {}),
      },
      body: formData,
    });
  } catch {
    markNetworkUnreachable();
    throw new ApiError(
      "We couldn't reach Learn Wise. Check your connection and try again.",
      0,
      undefined,
      "NETWORK_UNAVAILABLE"
    );
  }

  markNetworkReachable();
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    handleAuthFailure(response.status, auth, body);
    throw new ApiError(
      body.error ?? "Upload failed",
      response.status,
      body.details,
      errorCode(body)
    );
  }
  return body.data as T;
}

export async function healthCheck() {
  try {
    const response = await fetch(`${API_URL}/health`);
    if (!response.ok) {
      markNetworkUnreachable();
      throw new Error("API health check failed");
    }
    markNetworkReachable();
    return response.json();
  } catch (err) {
    markNetworkUnreachable();
    throw err;
  }
}

/** Authenticated CSV (or other text) download — returns raw body text. */
export async function apiDownloadText(
  path: string,
  options: { token?: string } = {}
): Promise<string> {
  const auth = options.token ?? (await getToken()) ?? undefined;
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      "X-Client-Platform": Platform.OS,
    },
  });
  const text = await response.text();
  if (!response.ok) {
    let message = "Download failed";
    let code: string | undefined;
    let details: unknown;
    try {
      const parsed = JSON.parse(text);
      message = parsed.error ?? message;
      code = parsed.code ?? parsed.details?.code;
      details = parsed.details;
    } catch {
      /* keep default */
    }
    handleAuthFailure(response.status, auth, { error: message, code });
    throw new ApiError(message, response.status, details, code);
  }
  return text;
}

/** Authenticated binary download (e.g. .xlsx) — returns a Blob. */
export async function apiDownloadBlob(
  path: string,
  options: { token?: string } = {}
): Promise<Blob> {
  const auth = options.token ?? (await getToken()) ?? undefined;
  const response = await fetch(`${API_URL}${path}`, {
    headers: {
      ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      "X-Client-Platform": Platform.OS,
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    handleAuthFailure(response.status, auth, body);
    throw new ApiError(body.error ?? "Download failed", response.status, body.details, errorCode(body));
  }
  return response.blob();
}

/**
 * Lightweight session check on app resume.
 * /auth/me runs requireAuth — OTP parents with sid get SESSION_REVOKED if replaced.
 * Student sessions must use /student/auth/me; /auth/me 401 must not look like a revoke.
 */
export async function checkParentSessionAlive(): Promise<
  "ok" | "revoked" | "skip"
> {
  const auth = await getToken();
  if (!auth) return "skip";
  const cached = await getUser<{ role?: string }>();
  const path =
    cached?.role === "STUDENT" ? "/student/auth/me" : "/auth/me";
  try {
    await apiRequest(path, { mobile: true });
    return "ok";
  } catch (err) {
    if (err instanceof ApiError && err.code === "SESSION_REVOKED") {
      return "revoked";
    }
    if (err instanceof ApiError && err.status === 401) {
      return "revoked";
    }
    return "skip";
  }
}

export { API_URL };
