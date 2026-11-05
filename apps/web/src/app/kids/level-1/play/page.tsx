"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Alert, Button } from "@little-readers/ui";
import { apiRequest, ApiClientError } from "@/lib/api";
import { getToken } from "@/lib/auth-storage";
import { getActiveChild } from "@/lib/child-session";
import { playCelebrateTone, prefetchKidVoice, speakWord } from "@/lib/speech";

function displayEmoji(raw?: string | null, fallback = "🔤") {
  const s = (raw ?? "").trim();
  if (!s || s === "?" || s === "□" || s === "�") return fallback;
  let hasEmoji = false;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0xfe0f || cp === 0x200d) continue;
    if (cp >= 0xe000 && cp <= 0xfaff) return fallback;
    if (
      (cp >= 0x1f300 && cp <= 0x1faff) ||
      (cp >= 0x1f000 && cp <= 0x1f2ff) ||
      (cp >= 0x2600 && cp <= 0x27bf) ||
      (cp >= 0x2300 && cp <= 0x23ff) ||
      (cp >= 0x2b00 && cp <= 0x2bff)
    ) {
      hasEmoji = true;
    }
  }
  return hasEmoji ? s : fallback;
}

type Round = "LISTEN" | "LETTER" | "SPELL" | "RESULTS";

interface ListenOption {
  key: "A" | "B" | "C" | "D";
  wordId: string;
  text: string;
  emoji: string;
  isCorrect: boolean;
}

interface Question {
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
  listenOptions: ListenOption[];
}

interface SessionPayload {
  sessionId: string;
  category: {
    id: string;
    label: string;
    emoji: string;
    levelLabel: string;
    groupLabel: string;
  };
  questionsTotal: number;
  questions: Question[];
}

interface ResultsPayload {
  childName: string;
  category: { label: string; emoji: string; id: string };
  questionsAttempted: number;
  correctAnswers: number;
  points: number;
  stars: number;
  accuracy: number;
  wordsLearned: number;
  nextCategory: { id: string; label: string; emoji: string } | null;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function PlayInner() {
  const router = useRouter();
  const params = useSearchParams();
  const categoryId = params.get("categoryId") ?? "";
  const lessonId = params.get("lessonId") ?? "";

  const [session, setSession] = useState<SessionPayload | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [round, setRound] = useState<Round>("LISTEN");
  const [score, setScore] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState<"ok" | "try" | null>(null);
  const [starsFlash, setStarsFlash] = useState(0);
  const [pointsFlash, setPointsFlash] = useState(0);
  const [clue, setClue] = useState<string | null>(null);
  const [usedClue, setUsedClue] = useState(false);
  const [highlightCorrect, setHighlightCorrect] = useState(false);
  const [spellValue, setSpellValue] = useState("");
  const [autoNext, setAutoNext] = useState(true);
  const [results, setResults] = useState<ResultsPayload | null>(null);
  const [startedAt] = useState(() => Date.now());
  const [confetti, setConfetti] = useState(false);

  const question = session?.questions[qIndex] ?? null;

  useEffect(() => {
    prefetchKidVoice();
  }, []);

  useEffect(() => {
    const token = getToken();
    const child = getActiveChild();
    if (!token || !child || (!categoryId && !lessonId)) {
      router.replace(lessonId ? "/kids/lessons" : "/kids/level-1");
      return;
    }

    void apiRequest<SessionPayload>("/learning/sessions", {
      method: "POST",
      token,
      body: JSON.stringify({
        childId: child.id,
        ...(lessonId
          ? { lessonId, resume: true }
          : { categoryId }),
      }),
    })
      .then((data) => {
        const questions = data.questions.map((q) => ({
          ...q,
          word: { ...q.word, emoji: displayEmoji(q.word.emoji) },
          listenOptions: q.listenOptions.map((o) => ({
            ...o,
            emoji: displayEmoji(o.emoji),
          })),
        }));
        setSession({ ...data, questions });
        speakWord(questions[0]?.word.text ?? "", { profile: "kid" });
      })
      .catch((err) => {
        setError(
          err instanceof ApiClientError ? err.message : "Could not start game"
        );
      })
      .finally(() => setLoading(false));
  }, [categoryId, lessonId, router]);

  const submitAttempt = useCallback(
    async (payload: {
      wordId: string;
      round: "LISTEN" | "SPELL" | "LETTER";
      isCorrect: boolean;
      answerGiven?: string;
      usedClue?: boolean;
      pointsAwarded?: number;
    }) => {
      const token = getToken();
      if (!token || !session) return { pointsAwarded: 0 };
      return apiRequest<{ pointsAwarded: number }>(
        `/learning/sessions/${session.sessionId}/attempts`,
        {
          method: "POST",
          token,
          body: JSON.stringify(payload),
        }
      );
    },
    [session]
  );

  const celebrate = useCallback((points: number) => {
    setFeedback("ok");
    setConfetti(true);
    setStarsFlash(points >= 10 ? 3 : points >= 5 ? 2 : 1);
    setPointsFlash(points);
    setScore((s) => s + points);
    playCelebrateTone();
    window.setTimeout(() => setConfetti(false), 1600);
  }, []);

  const goNextAfterListen = useCallback(() => {
    setFeedback(null);
    setClue(null);
    setUsedClue(false);
    setHighlightCorrect(false);
    setSpellValue("");
    setRound("LETTER");
  }, []);

  const goNextQuestion = useCallback(async () => {
    if (!session) return;
    setFeedback(null);
    setClue(null);
    setUsedClue(false);
    setHighlightCorrect(false);
    setSpellValue("");

    if (qIndex + 1 >= session.questions.length) {
      const token = getToken();
      if (!token) return;
      try {
        const data = await apiRequest<ResultsPayload>(
          `/learning/sessions/${session.sessionId}/complete`,
          {
            method: "POST",
            token,
            body: JSON.stringify({
              durationSec: Math.round((Date.now() - startedAt) / 1000),
            }),
          }
        );
        setResults(data);
        setRound("RESULTS");
      } catch (err) {
        setError(
          err instanceof ApiClientError ? err.message : "Could not save results"
        );
      }
      return;
    }

    const next = qIndex + 1;
    setQIndex(next);
    setRound("LISTEN");
    speakWord(session.questions[next].word.text);
  }, [qIndex, session, startedAt]);

  useEffect(() => {
    if (!autoNext || feedback !== "ok") return;
    const t = window.setTimeout(() => {
      if (round === "LISTEN") goNextAfterListen();
      else if (round === "LETTER" || round === "SPELL") void goNextQuestion();
    }, 1800);
    return () => window.clearTimeout(t);
  }, [autoNext, feedback, goNextAfterListen, goNextQuestion, round]);

  async function onListenPick(option: ListenOption) {
    if (!question || feedback === "ok") return;
    if (option.isCorrect) {
      try {
        const res = await submitAttempt({
          wordId: question.word.id,
          round: "LISTEN",
          isCorrect: true,
          answerGiven: option.key,
          usedClue,
          pointsAwarded: usedClue ? 5 : 10,
        });
        celebrate(res.pointsAwarded);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    } else {
      setFeedback("try");
      speakWord(question.word.text);
    }
  }

  async function onLetterPick(letter: string) {
    if (!question || feedback === "ok") return;
    const ok = letter.toUpperCase() === question.word.firstLetter;
    if (ok) {
      try {
        const res = await submitAttempt({
          wordId: question.word.id,
          round: "LETTER",
          isCorrect: true,
          answerGiven: letter,
          usedClue,
          pointsAwarded: usedClue ? 3 : 6,
        });
        celebrate(res.pointsAwarded);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
      }
    } else {
      setFeedback("try");
    }
  }

  async function onSpellSubmit() {
    if (!question || !spellValue.trim()) return;
    const ok =
      spellValue.trim().toLowerCase() === question.word.text.toLowerCase();
    try {
      const res = await submitAttempt({
        wordId: question.word.id,
        round: "SPELL",
        isCorrect: ok,
        answerGiven: spellValue.trim(),
        usedClue,
        pointsAwarded: ok ? (usedClue ? 4 : 8) : 0,
      });
      if (ok) celebrate(res.pointsAwarded);
      else {
        setFeedback("try");
        // Gentle: no penalty — offer skip to next
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
    }
  }

  function showClue() {
    if (!question) return;
    setUsedClue(true);
    if (round === "LISTEN") {
      setHighlightCorrect(true);
      setClue(`Picture tip: look for ${question.word.emoji}`);
      speakWord(question.word.text);
    } else if (round === "LETTER") {
      setClue(`Starts with “${question.word.firstLetter}”`);
      speakWord(question.word.firstLetter);
    } else {
      setClue(`Starts with “${question.word.firstLetter}” · ${question.word.meaning}`);
      speakWord(question.word.text);
    }
  }

  const letterChoices = useMemo(() => {
    if (!question) return [];
    const correct = question.word.firstLetter;
    const pool = LETTERS.filter((l) => l !== correct);
    const picks = [correct];
    while (picks.length < 4) {
      const n = pool[Math.floor(Math.random() * pool.length)];
      if (!picks.includes(n)) picks.push(n);
    }
    return picks.sort(() => Math.random() - 0.5);
  }, [question, qIndex]);

  if (loading) {
    return (
      <div className="kids-shell l1-shell">
        <div className="kids-card">Starting game…</div>
      </div>
    );
  }

  if (error && !session) {
    return (
      <div className="kids-shell l1-shell">
        <div className="kids-card">
          <Alert tone="error">{error}</Alert>
          <Button onClick={() => router.push("/kids/level-1")}>Back</Button>
        </div>
      </div>
    );
  }

  if (round === "RESULTS" && results) {
    return (
      <div className="kids-shell l1-shell">
        <div className="l1-results kids-card">
          <div className="l1-mascot" aria-hidden>
            🦊
          </div>
          <h1>Great job, {results.childName}!</h1>
          <p>
            {results.category.emoji} {results.category.label} finished
          </p>
          <div className="l1-stats">
            <div>
              <strong>{results.questionsAttempted}</strong>
              <span>Questions</span>
            </div>
            <div>
              <strong>{results.correctAnswers}</strong>
              <span>Correct</span>
            </div>
            <div>
              <strong>{results.points}</strong>
              <span>Points</span>
            </div>
            <div>
              <strong>{"★".repeat(results.stars) || "☆"}</strong>
              <span>Stars</span>
            </div>
            <div>
              <strong>{results.accuracy}%</strong>
              <span>Accuracy</span>
            </div>
            <div>
              <strong>{results.wordsLearned}</strong>
              <span>Words</span>
            </div>
          </div>
          <div className="l1-actions">
            <Button
              onClick={() =>
                router.push(
                  `/kids/level-1/play?categoryId=${encodeURIComponent(categoryId)}`
                )
              }
            >
              Replay
            </Button>
            <Button
              variant="secondary"
              onClick={() => router.push("/kids/level-1")}
            >
              Categories
            </Button>
            {results.nextCategory ? (
              <Button
                onClick={() =>
                  router.push(
                    `/kids/level-1/play?categoryId=${encodeURIComponent(
                      results.nextCategory!.id
                    )}`
                  )
                }
              >
                Next: {results.nextCategory.emoji} {results.nextCategory.label}
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (!session || !question) return null;

  return (
    <div className="kids-shell l1-shell">
      {confetti ? <div className="l1-confetti" aria-hidden /> : null}
      <div className="l1-play">
        <div className="l1-play-top">
          <Button variant="secondary" onClick={() => router.push("/kids/level-1")}>
            ← Back
          </Button>
          <div className="l1-scoreboard">
            <span>
              {session.category.emoji} {session.category.label}
            </span>
            <span>
              Word {question.index}/{session.questionsTotal}
            </span>
            <span>Score {score}</span>
          </div>
          <label className="l1-auto">
            <input
              type="checkbox"
              checked={autoNext}
              onChange={(e) => setAutoNext(e.target.checked)}
            />
            Auto next
          </label>
        </div>

        {error ? <Alert tone="error">{error}</Alert> : null}

        <div className="l1-stage">
          <p className="l1-round-label">
            {round === "LISTEN"
              ? "Round 1 – Listen"
              : round === "LETTER"
                ? "Letter fun"
                : "Round 2 – Spell (optional)"}
          </p>

          <div className="l1-word-art" aria-hidden>
            {round === "LISTEN" ? "👂" : question.word.emoji}
          </div>
          {round === "LISTEN" ? (
            <p className="l1-meaning">Listen carefully, then pick the matching picture.</p>
          ) : (
            <>
              <h1 className="l1-word">{question.word.text}</h1>
              <p className="l1-meaning">{question.word.meaning}</p>
            </>
          )}

          <div className="l1-audio-row">
            <button
              type="button"
              className="l1-speaker"
              onClick={() => speakWord(question.word.text)}
              aria-label="Play word"
            >
              🔊 Play
            </button>
            <button
              type="button"
              className="l1-speaker soft"
              onClick={() => speakWord(question.word.text)}
            >
              Listen again
            </button>
            <button type="button" className="l1-clue" onClick={showClue}>
              Clue
            </button>
          </div>

          {clue ? <p className="l1-clue-text">{clue}</p> : null}

          {round === "LISTEN" ? (
            <div className="l1-abcd">
              {question.listenOptions.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={`l1-choice ${
                    highlightCorrect && opt.isCorrect ? "is-hint" : ""
                  }`}
                  onClick={() => {
                    speakWord(opt.text);
                    void onListenPick(opt);
                  }}
                >
                  <span className="l1-choice-key">{opt.key}</span>
                  <span className="l1-choice-emoji">{opt.emoji}</span>
                  <span>Pick {opt.key}</span>
                </button>
              ))}
            </div>
          ) : null}

          {round === "LETTER" ? (
            <div className="l1-letter-panel">
              <p>Tap the first letter</p>
              <div className="l1-abcd">
                {letterChoices.map((letter) => (
                  <button
                    key={letter}
                    type="button"
                    className="l1-choice"
                    onClick={() => void onLetterPick(letter)}
                  >
                    <span className="l1-choice-key">{letter}</span>
                  </button>
                ))}
              </div>
              <Button
                variant="secondary"
                onClick={() => {
                  setFeedback(null);
                  setRound("SPELL");
                  speakWord(question.word.text);
                }}
              >
                Try spelling with a grown-up →
              </Button>
            </div>
          ) : null}

          {round === "SPELL" ? (
            <div className="l1-spell">
              <p className="muted">
                Optional with a parent — wrong answers are okay!
              </p>
              <input
                className="l1-spell-input"
                value={spellValue}
                onChange={(e) => setSpellValue(e.target.value.toUpperCase())}
                aria-label="Spelling answer"
                autoComplete="off"
              />
              <div className="l1-keyboard">
                {LETTERS.map((letter) => (
                  <button
                    key={letter}
                    type="button"
                    onClick={() => setSpellValue((v) => v + letter)}
                  >
                    {letter}
                  </button>
                ))}
              </div>
              <div className="l1-actions">
                <Button
                  variant="secondary"
                  onClick={() => setSpellValue((v) => v.slice(0, -1))}
                >
                  ⌫
                </Button>
                <Button variant="secondary" onClick={() => setSpellValue("")}>
                  Clear
                </Button>
                <Button onClick={() => void onSpellSubmit()}>Okay &gt;</Button>
                <Button variant="secondary" onClick={() => void goNextQuestion()}>
                  Skip spelling
                </Button>
              </div>
            </div>
          ) : null}

          {feedback === "ok" ? (
            <div className="l1-celebrate">
              <div className="l1-mascot">🌟</div>
              <h2>Good Job!</h2>
              <p>
                {"★".repeat(starsFlash)} · +{pointsFlash} points
              </p>
              <Button
                onClick={() => {
                  if (round === "LISTEN") goNextAfterListen();
                  else void goNextQuestion();
                }}
              >
                Next
              </Button>
            </div>
          ) : null}

          {feedback === "try" ? (
            <div className="l1-encourage">
              <p>Nice try! Listen again and have another go.</p>
              <Button
                variant="secondary"
                onClick={() => {
                  setFeedback(null);
                  speakWord(question.word.text);
                }}
              >
                Try again
              </Button>
              {round === "SPELL" || round === "LETTER" ? (
                <Button variant="secondary" onClick={() => void goNextQuestion()}>
                  Next word
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function Level1PlayPage() {
  return (
    <Suspense
      fallback={
        <div className="kids-shell l1-shell">
          <div className="kids-card">Loading…</div>
        </div>
      }
    >
      <PlayInner />
    </Suspense>
  );
}
