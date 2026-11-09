"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cheer, sayWord } from "./tv-audio";
import {
  friendlyTvError,
  isNotConnected,
  tvRequest,
  tvRequestWithRetry,
  type TvCategory,
  type TvOption,
  type TvResults,
  type TvSessionPayload,
} from "./tv-api";
import { focusFirst } from "./useRemote";

export type TvGameKind = "LISTEN" | "SPELL" | "MATCH_IT" | "QUIZ_TIME";

const GAME: Record<
  TvGameKind,
  {
    activityMode: "LISTEN_SPELL" | "MATCHING" | "QUIZ";
    questionCount: number;
    round: "LISTEN" | "SPELL" | "MATCHING" | "QUIZ";
    points: number;
  }
> = {
  LISTEN: { activityMode: "LISTEN_SPELL", questionCount: 8, round: "LISTEN", points: 10 },
  SPELL: { activityMode: "LISTEN_SPELL", questionCount: 8, round: "SPELL", points: 8 },
  MATCH_IT: { activityMode: "MATCHING", questionCount: 6, round: "MATCHING", points: 8 },
  QUIZ_TIME: { activityMode: "QUIZ", questionCount: 8, round: "QUIZ", points: 8 },
};

const BURST = ["⭐", "🎉", "🌟", "✨", "🎈", "⭐", "🎊", "🌈"];
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function refocus() {
  window.requestAnimationFrame(() => focusFirst(document.querySelector<HTMLElement>(".tv-root")));
}

function Picture({ imageUrl, emoji, size }: { imageUrl?: string | null; emoji: string; size: "big" | "card" }) {
  const [broken, setBroken] = useState(false);
  if (imageUrl && !broken && /^(https?:|data:image)/.test(imageUrl)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img className={`tv-pic tv-pic-${size}`} src={imageUrl} alt="" onError={() => setBroken(true)} />
    );
  }
  return <span className={`tv-emoji tv-emoji-${size}`}>{emoji || "🖼️"}</span>;
}

export function TvGame({
  kind,
  surprise,
  title,
  emoji,
  category,
  onExit,
  onOffline,
  onDisconnected,
}: {
  kind: TvGameKind;
  surprise: boolean;
  title: string;
  emoji: string;
  category: TvCategory;
  onExit: () => void;
  onOffline: (offline: boolean) => void;
  onDisconnected: () => void;
}) {
  const game = GAME[kind];
  const [phase, setPhase] = useState<"loading" | "play" | "saving" | "results" | "error">("loading");
  const [session, setSession] = useState<TvSessionPayload | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [feedback, setFeedback] = useState<"ok" | "try" | null>(null);
  const [wrong, setWrong] = useState<Set<string>>(new Set());
  const [earned, setEarned] = useState(0);
  const [score, setScore] = useState(0);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TvResults | null>(null);
  const [filled, setFilled] = useState<boolean[]>([]);
  const locked = useRef(new Set<string>());
  const startedAt = useRef(Date.now());

  const question = session?.questions[qIndex] ?? null;
  const total = session?.questions.length ?? 0;
  const target = question ? question.word.text.toUpperCase() : "";

  const start = useCallback(async () => {
    setPhase("loading");
    setError(null);
    setResults(null);
    setScore(0);
    setQIndex(0);
    locked.current = new Set();
    try {
      const data = await tvRequest<TvSessionPayload>("/sessions", {
        method: "POST",
        body: {
          categoryId: category.id,
          activityMode: game.activityMode,
          questionCount: game.questionCount,
          surprise,
        },
      });
      if (!data.questions.length) throw new Error("This topic has no words yet.");
      setSession(data);
      startedAt.current = Date.now();
      setPhase("play");
    } catch (err) {
      if (isNotConnected(err)) return onDisconnected();
      setError(err instanceof Error && !("status" in err) ? err.message : friendlyTvError(err));
      setPhase("error");
    }
  }, [category.id, game.activityMode, game.questionCount, surprise, onDisconnected]);

  useEffect(() => {
    void start();
  }, [start]);

  // New question: reset state and read the word aloud where the activity is about listening.
  useEffect(() => {
    if (phase !== "play" || !question) return;
    setFeedback(null);
    setWrong(new Set());
    setEarned(0);
    setNotice(null);
    setFilled(Array.from(question.word.text.toUpperCase(), (ch) => !ALPHABET.includes(ch)));
    if (kind === "LISTEN" || kind === "SPELL") sayWord(question.word.text, question.word.audioUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIndex, phase, session]);

  const answered = feedback === "ok";
  useEffect(() => {
    refocus();
  }, [qIndex, phase, answered, wrong.size]);

  const tiles = useMemo(() => {
    if (kind !== "SPELL" || !question) return [];
    const letters = [...new Set(Array.from(target).filter((ch) => ALPHABET.includes(ch)))];
    const extras = shuffle(Array.from(ALPHABET).filter((ch) => !letters.includes(ch))).slice(
      0,
      Math.max(3, Math.min(10, letters.length + 3) - letters.length)
    );
    return shuffle([...letters, ...extras]);
  }, [kind, question, target]);

  async function submit(isCorrect: boolean, answerGiven: string) {
    if (!session || !question) return;
    const lockKey = `${question.word.id}:${game.round}`;
    if (isCorrect && locked.current.has(lockKey)) {
      setFeedback("ok");
      return;
    }
    if (isCorrect) locked.current.add(lockKey);
    if (isCorrect) setBusy(true);
    try {
      const res = await tvRequestWithRetry<{ pointsAwarded: number; duplicate?: boolean }>(
        `/sessions/${session.sessionId}/attempts`,
        {
          method: "POST",
          body: {
            wordId: question.word.id,
            round: game.round,
            isCorrect,
            answerGiven: answerGiven.slice(0, 100),
            pointsAwarded: isCorrect ? game.points : 0,
          },
        },
        onOffline
      );
      if (isCorrect) {
        const points = res.duplicate ? 0 : res.pointsAwarded;
        setEarned(points);
        setScore((s) => s + points);
        setFeedback("ok");
        cheer();
        sayWord(question.word.text, question.word.audioUrl);
      }
    } catch (err) {
      if (isCorrect) locked.current.delete(lockKey);
      if (isNotConnected(err)) return onDisconnected();
      setNotice(friendlyTvError(err));
    } finally {
      if (isCorrect) setBusy(false);
    }
  }

  function pickOption(option: TvOption) {
    if (busy || feedback === "ok" || !question) return;
    if (option.isCorrect) {
      void submit(true, kind === "LISTEN" ? option.key : option.text);
      return;
    }
    setFeedback("try");
    setWrong((w) => new Set(w).add(option.key));
    if (kind === "LISTEN") sayWord(question.word.text, question.word.audioUrl);
    else sayWord(option.text);
    // Listen only records correct picks (same as the phone app); games record misses too.
    if (kind !== "LISTEN") void submit(false, option.text);
  }

  function pickLetter(letter: string) {
    if (busy || feedback === "ok" || !question) return;
    const next = filled.findIndex((f) => !f);
    if (next < 0) return;
    if (target[next] !== letter) {
      setFeedback("try");
      sayWord(letter);
      window.setTimeout(() => setFeedback((f) => (f === "try" ? null : f)), 1200);
      return;
    }
    const after = filled.map((f, i) => (i === next ? true : f));
    setFilled(after);
    setFeedback(null);
    if (after.every(Boolean)) void submit(true, question.word.text);
    else sayWord(letter);
  }

  async function next() {
    if (!session || busy) return;
    if (qIndex + 1 < total) {
      setQIndex((i) => i + 1);
      return;
    }
    setPhase("saving");
    try {
      const data = await tvRequestWithRetry<TvResults>(
        `/sessions/${session.sessionId}/complete`,
        { method: "POST", body: { durationSec: Math.round((Date.now() - startedAt.current) / 1000) } },
        onOffline
      );
      setResults(data);
      setPhase("results");
      cheer();
    } catch (err) {
      if (isNotConnected(err)) return onDisconnected();
      setError(friendlyTvError(err));
      setPhase("error");
    }
  }

  function hear() {
    if (!question) return;
    if (kind === "QUIZ_TIME") sayWord(question.word.meaning);
    else sayWord(question.word.text, question.word.audioUrl);
  }

  const header = (
    <header className="tv-game-head">
      <button type="button" className="tv-btn tv-btn-soft tv-btn-small" data-tv onClick={onExit}>
        ◀ Activities
      </button>
      <h1 className="tv-game-title">
        <span aria-hidden>{emoji}</span> {title}
        <span className="tv-game-topic">
          {category.emoji} {category.label}
        </span>
      </h1>
      {phase === "play" ? (
        <div className="tv-game-stats">
          <span className="tv-pill">
            {qIndex + 1} / {total}
          </span>
          <span className="tv-pill tv-pill-star">⭐ {score}</span>
        </div>
      ) : (
        <div className="tv-game-stats" />
      )}
    </header>
  );

  if (phase === "loading" || phase === "saving") {
    return (
      <div className="tv-game">
        {header}
        <div className="tv-center">
          <div className="tv-spinner" />
          <p className="tv-lead">{phase === "saving" ? "Saving your stars…" : "Getting ready…"}</p>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="tv-game">
        {header}
        <div className="tv-center">
          <p className="tv-big-emoji">🙈</p>
          <p className="tv-lead">{error}</p>
          <div className="tv-row">
            <button type="button" className="tv-btn" data-tv data-tv-autofocus onClick={() => void start()}>
              🔄 Try again
            </button>
            <button type="button" className="tv-btn tv-btn-soft" data-tv onClick={onExit}>
              🏠 Activities
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "results" && results) {
    return (
      <div className="tv-game">
        {header}
        <div className="tv-center tv-enter">
          <p className="tv-results-title">🏆 Well done!</p>
          <p className="tv-results-stars" aria-label={`${results.stars} of 3 stars`}>
            {[0, 1, 2].map((i) => (
              <span key={i} className={i < results.stars ? "tv-star-on" : "tv-star-off"}>
                ★
              </span>
            ))}
          </p>
          <p className="tv-lead">
            +{results.points} points · {results.correctAnswers} right answers
          </p>
          <div className="tv-row">
            <button type="button" className="tv-btn" data-tv data-tv-autofocus onClick={() => void start()}>
              ▶ Play again
            </button>
            <button type="button" className="tv-btn tv-btn-soft" data-tv onClick={onExit}>
              🏠 Activities
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!question) return null;

  const options = question.listenOptions;
  const nextLabel = qIndex + 1 < total ? "Next ▶" : "Finish 🏁";

  return (
    <div className="tv-game">
      {header}
      <div className={`tv-play ${kind === "SPELL" ? "tv-play-spell" : ""}`} key={qIndex}>
        <div className="tv-prompt tv-enter">
          {kind === "LISTEN" ? (
            <>
              <p className="tv-ask">Listen and find the picture</p>
              <button type="button" className="tv-btn tv-hear" data-tv onClick={hear}>
                🔊 Hear the word
              </button>
            </>
          ) : null}

          {kind === "SPELL" ? (
            <>
              <Picture imageUrl={question.word.imageUrl} emoji={question.word.emoji} size="big" />
              <div className="tv-slots" aria-label="Spelling">
                {Array.from(target).map((ch, i) => (
                  <span key={i} className={`tv-slot ${filled[i] ? "tv-slot-on" : ""} ${ch === " " ? "tv-slot-gap" : ""}`}>
                    {filled[i] ? ch : ""}
                  </span>
                ))}
              </div>
              <button type="button" className="tv-btn tv-hear tv-btn-small" data-tv onClick={hear}>
                🔊 Hear again
              </button>
            </>
          ) : null}

          {kind === "MATCH_IT" ? (
            <>
              <Picture imageUrl={question.word.imageUrl} emoji={question.word.emoji} size="big" />
              <p className="tv-ask">Which word matches the picture?</p>
            </>
          ) : null}

          {kind === "QUIZ_TIME" ? (
            <>
              <p className="tv-ask">Which word matches this clue?</p>
              <p className="tv-clue">“{question.word.meaning}”</p>
              <button type="button" className="tv-btn tv-hear tv-btn-small" data-tv onClick={hear}>
                🔊 Read the clue
              </button>
            </>
          ) : null}
        </div>

        {feedback === "ok" ? (
          <div className="tv-feedback tv-feedback-ok">
            <div className="tv-burst" aria-hidden>
              {BURST.map((b, i) => (
                <span key={i} style={{ ["--i" as string]: i }}>
                  {b}
                </span>
              ))}
            </div>
            <p className="tv-feedback-text">
              🎉 Great job! <b>{question.word.text}</b>
              {earned > 0 ? <span className="tv-pill tv-pill-star">+{earned} ⭐</span> : null}
            </p>
            <button type="button" className="tv-btn tv-btn-go" data-tv data-tv-autofocus onClick={() => void next()}>
              {nextLabel}
            </button>
          </div>
        ) : kind === "SPELL" ? (
          <div className="tv-letters">
            {tiles.map((letter, i) => (
              <button
                key={`${letter}-${i}`}
                type="button"
                className="tv-btn tv-letter"
                data-tv
                data-tv-autofocus={i === 0 ? "" : undefined}
                disabled={busy}
                onClick={() => pickLetter(letter)}
              >
                {letter}
              </button>
            ))}
          </div>
        ) : (
          <div className={`tv-options ${kind === "LISTEN" ? "tv-options-pics" : "tv-options-words"}`}>
            {options.map((option, i) => (
              <button
                key={option.key}
                type="button"
                className={`tv-btn tv-option ${wrong.has(option.key) ? "tv-option-wrong" : ""}`}
                data-tv
                data-tv-autofocus={i === 0 ? "" : undefined}
                disabled={busy || wrong.has(option.key)}
                onClick={() => pickOption(option)}
              >
                {kind === "LISTEN" ? (
                  <>
                    <span className="tv-emoji tv-emoji-card">{option.emoji || "🖼️"}</span>
                    <span className="tv-option-label">{option.text}</span>
                  </>
                ) : (
                  <span className="tv-option-word">{option.text}</span>
                )}
              </button>
            ))}
          </div>
        )}

        <p className={`tv-hint ${feedback === "try" ? "tv-hint-try" : ""}`} role="status">
          {feedback === "try" ? "Not quite — try again! 💪" : notice ?? "\u00a0"}
        </p>
      </div>
    </div>
  );
}
