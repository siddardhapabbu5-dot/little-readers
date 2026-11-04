import { Platform } from "react-native";
import { getOrCreateInstallationId, getToken } from "./secure";
import { notifyUnauthorized } from "./session";

const API_URL =
  process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, "") ??
  "http://localhost:4100/api";

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** Device lock headers only on real phones — not Expo web preview. */
function isNativeMobileClient() {
  return Platform.OS === "ios" || Platform.OS === "android";
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string; mobile?: boolean } = {}
): Promise<T> {
  const { token, mobile = isNativeMobileClient(), headers, ...rest } = options;
  const auth = token ?? (await getToken()) ?? undefined;
  const installationId = mobile ? await getOrCreateInstallationId() : undefined;

  const response = await fetch(`${API_URL}${path}`, {
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

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && auth) {
      notifyUnauthorized();
    }
    throw new ApiError(
      body.error ?? "Request failed",
      response.status,
      body.details
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

  const response = await fetch(`${API_URL}${path}`, {
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

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && auth) {
      notifyUnauthorized();
    }
    throw new ApiError(
      body.error ?? "Upload failed",
      response.status,
      body.details
    );
  }
  return body.data as T;
}

export async function healthCheck() {
  const response = await fetch(`${API_URL}/health`);
  if (!response.ok) throw new Error("API health check failed");
  return response.json();
}

export { API_URL };
