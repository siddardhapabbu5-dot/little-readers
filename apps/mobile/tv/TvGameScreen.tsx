import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Text, View } from "react-native";
import { sayWord } from "./tv-audio";
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
import { Pill, TvButton, TvPicture, tvColors, useTvScale } from "./ui";

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

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function TvGameScreen({
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
  const s = useTvScale();
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
  const pop = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    if (phase !== "play" || !question) return;
    setFeedback(null);
    setWrong(new Set());
    setEarned(0);
    setNotice(null);
    setFilled(Array.from(question.word.text.toUpperCase(), (ch) => !ALPHABET.includes(ch)));
    if (kind === "LISTEN" || kind === "SPELL") sayWord(question.word.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qIndex, phase, session]);

  useEffect(() => {
    if (feedback !== "ok") return;
    pop.setValue(0);
    Animated.spring(pop, { toValue: 1, friction: 5, useNativeDriver: true }).start();
  }, [feedback, pop]);

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
    if (isCorrect) {
      locked.current.add(lockKey);
      setBusy(true);
    }
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
        setScore((v) => v + points);
        setFeedback("ok");
        sayWord(`Great job! ${question.word.text}`);
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
    if (busy || feedback === "ok" || !question || wrong.has(option.key)) return;
    if (option.isCorrect) {
      void submit(true, kind === "LISTEN" ? option.key : option.text);
      return;
    }
    setFeedback("try");
    setWrong((w) => new Set(w).add(option.key));
    sayWord(kind === "LISTEN" ? question.word.text : option.text);
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
      setTimeout(() => setFeedback((f) => (f === "try" ? null : f)), 1200);
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
      sayWord("Well done!");
    } catch (err) {
      if (isNotConnected(err)) return onDisconnected();
      setError(friendlyTvError(err));
      setPhase("error");
    }
  }

  function hear() {
    if (!question) return;
    sayWord(kind === "QUIZ_TIME" ? question.word.meaning : question.word.text);
  }

  const big = { fontSize: s(26), fontWeight: "900" as const, color: tvColors.ink, textAlign: "center" as const };
  const lead = { fontSize: s(22), fontWeight: "800" as const, color: tvColors.ink, textAlign: "center" as const };

  const header = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s(16) }}>
      <TvButton label="◀ Activities" onPress={onExit} textStyle={{ fontSize: s(16) }} />
      <Text style={{ flex: 1, fontSize: s(28), fontWeight: "900", color: tvColors.ink }} numberOfLines={1}>
        {emoji} {title}
        <Text style={{ fontSize: s(18), color: tvColors.muted }}>
          {"  "}
          {category.emoji} {category.label}
        </Text>
      </Text>
      {phase === "play" ? (
        <View style={{ flexDirection: "row", gap: s(10) }}>
          <Pill text={`${qIndex + 1} / ${total}`} />
          <Pill text={`⭐ ${score}`} star />
        </View>
      ) : null}
    </View>
  );

  if (phase === "loading" || phase === "saving") {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: s(16) }}>
          <ActivityIndicator size="large" color={tvColors.blue} />
          <Text style={lead}>{phase === "saving" ? "Saving your stars…" : "Getting ready…"}</Text>
        </View>
      </View>
    );
  }

  if (phase === "error") {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: s(18) }}>
          <Text style={{ fontSize: s(70) }}>🙈</Text>
          <Text style={lead}>{error}</Text>
          <View style={{ flexDirection: "row", gap: s(20) }}>
            <TvButton label="🔄 Try again" tone="primary" preferred onPress={() => void start()} />
            <TvButton label="🏠 Activities" onPress={onExit} />
          </View>
        </View>
      </View>
    );
  }

  if (phase === "results" && results) {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: s(14) }}>
          <Text style={{ fontSize: s(44), fontWeight: "900", color: tvColors.blue }}>🏆 Well done!</Text>
          <Text style={{ fontSize: s(70), letterSpacing: s(8) }}>
            {[0, 1, 2].map((i) => (
              <Text key={i} style={{ color: i < results.stars ? "#FACC15" : "rgba(255,255,255,0.85)" }}>
                ★
              </Text>
            ))}
          </Text>
          <Text style={lead}>
            +{results.points} points · {results.correctAnswers} right answers
          </Text>
          <View style={{ flexDirection: "row", gap: s(20) }}>
            <TvButton label="▶ Play again" tone="primary" preferred onPress={() => void start()} />
            <TvButton label="🏠 Activities" onPress={onExit} />
          </View>
        </View>
      </View>
    );
  }

  if (!question) return null;

  const options = question.listenOptions;
  const nextLabel = qIndex + 1 < total ? "Next ▶" : "Finish 🏁";
  const tileSize = tiles.length > 10 ? s(54) : s(62);

  return (
    <View style={{ flex: 1 }}>
      {header}
      <View key={qIndex} style={{ flex: 1, alignItems: "center", justifyContent: "space-evenly" }}>
        {kind === "LISTEN" ? (
          <View style={{ alignItems: "center", gap: s(10) }}>
            <Text style={big}>Listen and find the picture</Text>
            <TvButton label="🔊 Hear the word" tone="primary" onPress={hear} textStyle={{ fontSize: s(24) }} />
          </View>
        ) : null}

        {kind === "SPELL" ? (
          <View style={{ alignItems: "center", gap: s(10) }}>
            <TvPicture imageUrl={question.word.imageUrl} emoji={question.word.emoji} size={s(120)} />
            <View style={{ flexDirection: "row", gap: s(6) }}>
              {Array.from(target).map((ch, i) => (
                <View
                  key={i}
                  style={{
                    width: s(42),
                    height: s(50),
                    borderRadius: s(8),
                    backgroundColor: ch === " " ? "transparent" : filled[i] ? "#fff" : "rgba(255,255,255,0.7)",
                    borderBottomWidth: ch === " " ? 0 : s(4),
                    borderBottomColor: tvColors.blue,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ fontSize: s(30), fontWeight: "900", color: tvColors.green }}>
                    {filled[i] && ch !== " " ? ch : ""}
                  </Text>
                </View>
              ))}
            </View>
            <TvButton label="🔊 Hear again" tone="primary" onPress={hear} textStyle={{ fontSize: s(16) }} />
          </View>
        ) : null}

        {kind === "MATCH_IT" ? (
          <View style={{ alignItems: "center", gap: s(10) }}>
            <TvPicture imageUrl={question.word.imageUrl} emoji={question.word.emoji} size={s(150)} />
            <Text style={big}>Which word matches the picture?</Text>
          </View>
        ) : null}

        {kind === "QUIZ_TIME" ? (
          <View style={{ alignItems: "center", gap: s(10), maxWidth: s(760) }}>
            <Text style={big}>Which word matches this clue?</Text>
            <View style={{ backgroundColor: "#fff", borderRadius: s(16), paddingVertical: s(10), paddingHorizontal: s(20) }}>
              <Text style={{ ...big, fontSize: s(30) }}>“{question.word.meaning}”</Text>
            </View>
            <TvButton label="🔊 Read the clue" tone="primary" onPress={hear} textStyle={{ fontSize: s(16) }} />
          </View>
        ) : null}

        {feedback === "ok" ? (
          <Animated.View
            style={{
              alignItems: "center",
              gap: s(14),
              transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }],
              opacity: pop,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: s(14) }}>
              <Text style={{ fontSize: s(34), fontWeight: "900", color: tvColors.green }}>
                🎉 Great job! {question.word.text}
              </Text>
              {earned > 0 ? <Pill text={`+${earned} ⭐`} star /> : null}
            </View>
            <TvButton
              label={nextLabel}
              tone="go"
              preferred
              onPress={() => void next()}
              textStyle={{ fontSize: s(26) }}
              style={{ paddingHorizontal: s(36) }}
            />
          </Animated.View>
        ) : kind === "SPELL" ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: s(10), maxWidth: s(900) }}>
            {tiles.map((letter, i) => (
              <TvButton
                key={`${qIndex}-${letter}-${i}`}
                label={letter}
                preferred={i === 0}
                disabled={busy}
                onPress={() => pickLetter(letter)}
                style={{ width: tileSize, height: tileSize, paddingHorizontal: 0, paddingVertical: 0 }}
                textStyle={{ fontSize: s(28) }}
              />
            ))}
          </View>
        ) : (
          <View style={{ flexDirection: "row", gap: s(16), width: "100%" }}>
            {options.map((option, i) => {
              const isWrong = wrong.has(option.key);
              return (
                <TvButton
                  key={`${qIndex}-${option.key}`}
                  preferred={i === 0}
                  disabled={busy}
                  dimmed={isWrong}
                  onPress={() => pickOption(option)}
                  accessibilityLabel={option.text}
                  style={{
                    flex: 1,
                    minHeight: kind === "LISTEN" ? s(150) : s(90),
                    backgroundColor: isWrong ? "#FEE2E2" : "#fff",
                  }}
                >
                  {kind === "LISTEN" ? (
                    <View style={{ alignItems: "center", gap: s(4) }}>
                      <Text style={{ fontSize: s(64) }}>{option.emoji || "🖼️"}</Text>
                      <Text style={{ fontSize: s(20), fontWeight: "900", color: tvColors.ink }}>{option.text}</Text>
                    </View>
                  ) : (
                    <Text style={{ fontSize: s(30), fontWeight: "900", color: tvColors.ink }}>{option.text}</Text>
                  )}
                </TvButton>
              );
            })}
          </View>
        )}

        <Text
          style={{
            fontSize: s(20),
            fontWeight: "900",
            color: feedback === "try" ? tvColors.orange : tvColors.muted,
            minHeight: s(26),
          }}
        >
          {feedback === "try" ? "Not quite — try again! 💪" : notice ?? " "}
        </Text>
      </View>
    </View>
  );
}
