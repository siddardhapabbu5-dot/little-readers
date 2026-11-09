import { API_URL, ApiClientError } from "../../lib/api";

const TOKEN_KEY = "lw_tv_token";

/** Phone page the TV QR code points to (Learn Wise app, Connect a TV screen). */
export const TV_CONNECT_URL = (
  process.env.NEXT_PUBLIC_TV_CONNECT_URL ??
  (process.env.NODE_ENV === "production" ? "https://siwiapp.shop/app" : "http://localhost:8081")
).replace(/\/$/, "");

export function getTvToken() {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setTvToken(token: string) {
  try {
    window.localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* private mode: token lives only for this page load */
  }
}

export function clearTvToken() {
  try {
    window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export class TvOfflineError extends Error {}

type TvRequestOptions = { method?: string; body?: unknown; auth?: boolean };

export async function tvRequest<T>(path: string, options: TvRequestOptions = {}): Promise<T> {
  const token = options.auth === false ? null : getTvToken();
  let response: Response;
  try {
    response = await fetch(`${API_URL}/tv${path}`, {
      method: options.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        "X-Client-Platform": "tv",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
  } catch {
    throw new TvOfflineError("No internet connection");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ApiClientError(
      body.error ?? "Something went wrong",
      response.status,
      body.details,
      body.code ?? body.details?.code
    );
  }
  return body.data as T;
}

function waitForRetry(ms: number) {
  return new Promise<void>((resolve) => {
    const done = () => {
      window.clearTimeout(timer);
      window.removeEventListener("online", done);
      resolve();
    };
    const timer = window.setTimeout(done, ms);
    window.addEventListener("online", done);
  });
}

/** Keeps retrying while the TV is offline so answers and results are not lost. */
export async function tvRequestWithRetry<T>(
  path: string,
  options: TvRequestOptions,
  onOffline: (offline: boolean) => void,
  maxTries = 60
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      const result = await tvRequest<T>(path, options);
      onOffline(false);
      return result;
    } catch (err) {
      if (!(err instanceof TvOfflineError) || attempt >= maxTries) throw err;
      onOffline(true);
      await waitForRetry(3000);
    }
  }
}

export function isNotConnected(err: unknown) {
  return err instanceof ApiClientError && err.status === 401;
}

export function friendlyTvError(err: unknown) {
  if (err instanceof TvOfflineError) return "No internet connection. Please check the TV's Wi-Fi.";
  if (err instanceof ApiClientError) {
    if (err.status === 402) {
      return "Learning is not active for this child yet. Ask a parent to open the Learn Wise app.";
    }
    return err.message;
  }
  return "Something went wrong. Please try again.";
}

export type TvActivityCode = "LISTEN" | "SPELL" | "MATCH_IT" | "QUIZ_TIME" | "SURPRISE";

export type TvActivity = {
  code: TvActivityCode;
  title: string;
  emoji: string;
  description: string;
  kind: "learn" | "game";
  mode: "LISTEN_SPELL" | "MATCHING" | "QUIZ" | "REVISION" | null;
  enabled: boolean;
};

export type TvCategory = {
  id: string;
  label: string;
  emoji: string;
  wordCount: number;
  unlocked: boolean;
  progress: { wordsLearned: number; stars: number; completed: boolean } | null;
};

export type TvMe = {
  connectionId: string;
  child: { id: string; displayName: string; avatarUrl: string | null; hasLearningSeat: boolean };
  summary: {
    points: number;
    stars: number;
    wordsLearned: number;
    daily: { wordsLearnedToday: number; target: number; completed: boolean };
  } | null;
};

export type TvOption = { key: string; wordId: string; text: string; emoji: string; isCorrect: boolean };

export type TvQuestion = {
  index: number;
  word: {
    id: string;
    text: string;
    meaning: string;
    emoji: string;
    imageUrl: string | null;
    audioUrl: string | null;
    firstLetter: string;
  };
  listenOptions: TvOption[];
};

export type TvSessionPayload = {
  sessionId: string;
  activityMode: string;
  category: { id: string; label: string; emoji: string };
  questions: TvQuestion[];
};

export type TvResults = {
  points: number;
  stars: number;
  correctAnswers: number;
  questionsAttempted: number;
  accuracy: number;
};
