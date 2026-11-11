import { Platform } from "react-native";
import {
  getOrCreateInstallationId,
  getToken,
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

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string; mobile?: boolean } = {}
): Promise<T> {
  const { token, mobile = isNativeMobileClient(), headers, ...rest } = options;
  const auth = token ?? (await getToken()) ?? undefined;
  const installationId = mobile ? await getOrCreateInstallationId() : undefined;

  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...rest,
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
 */
export async function checkParentSessionAlive(): Promise<
  "ok" | "revoked" | "skip"
> {
  const auth = await getToken();
  if (!auth) return "skip";
  try {
    await apiRequest("/auth/me", { mobile: true });
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
