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

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, headers, ...rest } = options;
  const response = await fetch(`${API_URL}${path}`, {
    ...rest,
    headers: {
      "Content-Type": "application/json",
      "X-Client-Platform": "web",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
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
