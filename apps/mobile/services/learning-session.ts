import { apiRequest as baseRequest } from "./api";

/** childId used by the Admin "Preview games" screen; nothing is saved for it. */
export const PREVIEW_CHILD_ID = "preview";

type PreviewAttempt = {
  wordId: string;
  round: string;
  isCorrect: boolean;
  pointsAwarded: number;
};
type PreviewSession = {
  category: { id: string; label: string; emoji: string; code: string };
  attempts: PreviewAttempt[];
  startedAt: number;
};

const previewSessions = new Map<string, PreviewSession>();

const DEFAULT_POINTS: Record<string, number> = { LISTEN: 10, LETTER: 6 };

export function isPreviewChild(childId?: string | string[]) {
  return childId === PREVIEW_CHILD_ID;
}

/**
 * Same as apiRequest, but learning sessions for the preview child are served by the
 * admin preview endpoint and scored on the device, so no progress or points are stored.
 */
export async function apiRequest<T>(
  path: string,
  options: Parameters<typeof baseRequest>[1] = {}
): Promise<T> {
  const body =
    typeof options.body === "string"
      ? (JSON.parse(options.body) as Record<string, unknown>)
      : null;

  if (path === "/learning/sessions" && body?.childId === PREVIEW_CHILD_ID) {
    const { childId: _child, resume: _resume, ...rest } = body;
    const data = await baseRequest<{ sessionId: string; category: PreviewSession["category"] }>(
      "/learning/preview-session",
      { ...options, body: JSON.stringify(rest) }
    );
    previewSessions.set(data.sessionId, {
      category: data.category,
      attempts: [],
      startedAt: Date.now(),
    });
    return data as T;
  }

  const match = path.match(/^\/learning\/sessions\/(preview-[^/]+)\/(attempts|complete)$/);
  const session = match ? previewSessions.get(match[1]) : undefined;
  if (match && session) {
    if (match[2] === "attempts") {
      const round = String(body?.round ?? "");
      const wordId = String(body?.wordId ?? "");
      const isCorrect = Boolean(body?.isCorrect);
      const duplicate =
        isCorrect &&
        session.attempts.some((a) => a.wordId === wordId && a.round === round && a.isCorrect);
      const pointsAwarded = duplicate
        ? 0
        : isCorrect
          ? Number(body?.pointsAwarded ?? DEFAULT_POINTS[round] ?? 8)
          : 0;
      if (!duplicate) session.attempts.push({ wordId, round, isCorrect, pointsAwarded });
      return { attemptId: `${match[1]}-${session.attempts.length}`, pointsAwarded, isCorrect, duplicate } as T;
    }

    const attempts = session.attempts;
    const correct = attempts.filter((a) => a.isCorrect);
    const accuracy = attempts.length ? Math.round((correct.length / attempts.length) * 100) : 0;
    return {
      sessionId: match[1],
      childName: "Admin preview",
      category: session.category,
      questionsAttempted: attempts.length,
      correctAnswers: correct.length,
      listenCorrect: correct.filter((a) => a.round === "LISTEN").length,
      spellCorrect: correct.filter((a) => a.round === "SPELL" || a.round === "LETTER").length,
      points: attempts.reduce((sum, a) => sum + a.pointsAwarded, 0),
      stars: accuracy >= 90 ? 3 : accuracy >= 70 ? 2 : accuracy >= 40 ? 1 : 0,
      accuracy,
      wordsLearned: new Set(correct.map((a) => a.wordId)).size,
      sessionWordsLearned: new Set(correct.map((a) => a.wordId)).size,
      durationSec: Math.round((Date.now() - session.startedAt) / 1000),
      nextCategory: null,
    } as T;
  }

  return baseRequest<T>(path, options);
}
