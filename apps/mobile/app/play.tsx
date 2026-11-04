import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import {
  AvatarBubble,
  Card,
  ErrorText,
  SoftButton,
  Title,
} from "../components/ui";
import { IconButton, KidsHeader } from "../components/kids";
import { AuthGate } from "../components/AuthGate";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { speakWord } from "../services/speech";
import { colors, radii, shadow } from "../theme";

type Round = "LISTEN" | "LETTER" | "SPELL" | "RESULTS";

interface ListenOption {
  key: "A" | "B" | "C" | "D";
  wordId?: string;
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
    imageUrl?: string | null;
    audioUrl?: string | null;
    firstLetter: string;
  };
  listenOptions: ListenOption[];
}

interface SessionPayload {
  sessionId: string;
  category: { id?: string; label: string; emoji: string };
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

export default function PlayScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    categoryId?: string;
    lessonId?: string;
    childId: string;
    title?: string;
  }>();

  const [session, setSession] = useState<SessionPayload | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [round, setRound] = useState<Round>("LISTEN");
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<"ok" | "try" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [clue, setClue] = useState<string | null>(null);
  const [usedClue, setUsedClue] = useState(false);
  const [highlightCorrect, setHighlightCorrect] = useState(false);
  const [spellValue, setSpellValue] = useState("");
  const [results, setResults] = useState<ResultsPayload | null>(null);
  const [starsFlash, setStarsFlash] = useState(0);
  const [pointsFlash, setPointsFlash] = useState(0);
  const [confetti, setConfetti] = useState(false);
  const startedAt = useRef(Date.now());
  const confettiAnim = useRef(new Animated.Value(0)).current;
  /** Prevents duplicate client submits for wordId+round while awaiting network. */
  const lockedKeys = useRef(new Set<string>());

  const question = session?.questions[qIndex] ?? null;

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        if (!params.childId || (!params.categoryId && !params.lessonId)) {
          throw new Error("Missing child or lesson/category");
        }
        const data = await apiRequest<SessionPayload>("/learning/sessions", {
          method: "POST",
          body: JSON.stringify({
            childId: params.childId,
            ...(params.lessonId
              ? { lessonId: params.lessonId, resume: true }
              : { categoryId: params.categoryId, questionCount: 8 }),
          }),
        });
        setSession(data);
        startedAt.current = Date.now();
        if (data.questions[0]) void speakWord(data.questions[0].word.text);
      } catch (err) {
        if (err instanceof ApiError && err.status === 402) {
          const code =
            err.details &&
            typeof err.details === "object" &&
            "code" in err.details
              ? String((err.details as { code?: string }).code)
              : "";
          if (code === "SEAT_REQUIRED" || code === "NO_SEAT_AVAILABLE" || code === "SUBSCRIPTION_REQUIRED") {
            router.replace("/subscription");
            return;
          }
        }
        setError(err instanceof ApiError ? err.message : "Could not start game");
      } finally {
        setLoading(false);
      }
    })();
  }, [params.categoryId, params.lessonId, params.childId]);

  const letterChoices = useMemo(() => {
    if (!question) return [];
    const correct = question.word.firstLetter.toUpperCase();
    const pool = LETTERS.filter((l) => l !== correct);
    const picks = [correct];
    while (picks.length < 4) {
      const n = pool[Math.floor(Math.random() * pool.length)];
      if (!picks.includes(n)) picks.push(n);
    }
    return picks.sort(() => Math.random() - 0.5);
  }, [question, qIndex]);

  const celebrate = useCallback(
    (points: number) => {
      setFeedback("ok");
      setConfetti(true);
      setStarsFlash(points >= 10 ? 3 : points >= 5 ? 2 : 1);
      setPointsFlash(points);
      setScore((s) => s + points);
      confettiAnim.setValue(0);
      Animated.timing(confettiAnim, {
        toValue: 1,
        duration: 1200,
        useNativeDriver: true,
      }).start(() => setConfetti(false));
    },
    [confettiAnim]
  );

  const submitAttempt = useCallback(
    async (payload: {
      wordId: string;
      round: "LISTEN" | "SPELL" | "LETTER";
      isCorrect: boolean;
      answerGiven?: string;
      usedClue?: boolean;
      pointsAwarded?: number;
    }) => {
      if (!session) return { pointsAwarded: 0, duplicate: false };
      const lockKey = `${payload.wordId}:${payload.round}`;
      if (payload.isCorrect && lockedKeys.current.has(lockKey)) {
        return { pointsAwarded: 0, duplicate: true };
      }
      if (payload.isCorrect) lockedKeys.current.add(lockKey);

      const res = await apiRequest<{ pointsAwarded: number; duplicate?: boolean }>(
        `/learning/sessions/${session.sessionId}/attempts`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        }
      );
      return res;
    },
    [session]
  );

  const goNextAfterListen = useCallback(() => {
    setFeedback(null);
    setClue(null);
    setUsedClue(false);
    setHighlightCorrect(false);
    setSpellValue("");
    setRound("LETTER");
    if (question) void speakWord(question.word.text);
  }, [question]);

  const goNextQuestion = useCallback(async () => {
    if (!session) return;
    setFeedback(null);
    setClue(null);
    setUsedClue(false);
    setHighlightCorrect(false);
    setSpellValue("");
    setSaving(true);

    if (qIndex + 1 >= session.questions.length) {
      try {
        const data = await apiRequest<ResultsPayload>(
          `/learning/sessions/${session.sessionId}/complete`,
          {
            method: "POST",
            body: JSON.stringify({
              durationSec: Math.round((Date.now() - startedAt.current) / 1000),
            }),
          }
        );
        setResults(data);
        setRound("RESULTS");
        setConfetti(true);
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not save results");
      } finally {
        setSaving(false);
      }
      return;
    }

    const next = qIndex + 1;
    setQIndex(next);
    setRound("LISTEN");
    setSaving(false);
    void speakWord(session.questions[next].word.text);
  }, [qIndex, session]);

  async function onListenPick(option: ListenOption) {
    if (!question || feedback === "ok" || saving) return;
    void speakWord(option.text);
    if (option.isCorrect) {
      try {
        setSaving(true);
        const res = await submitAttempt({
          wordId: question.word.id,
          round: "LISTEN",
          isCorrect: true,
          answerGiven: option.key,
          usedClue,
          pointsAwarded: usedClue ? 5 : 10,
        });
        if (!res.duplicate) celebrate(res.pointsAwarded);
        else setFeedback("ok");
      } catch (err) {
        lockedKeys.current.delete(`${question.word.id}:LISTEN`);
        setError(err instanceof ApiError ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
    } else {
      setFeedback("try");
      void speakWord(question.word.text);
    }
  }

  async function onLetterPick(letter: string) {
    if (!question || feedback === "ok" || saving) return;
    void speakWord(letter);
    const ok = letter.toUpperCase() === question.word.firstLetter.toUpperCase();
    if (ok) {
      try {
        setSaving(true);
        const res = await submitAttempt({
          wordId: question.word.id,
          round: "LETTER",
          isCorrect: true,
          answerGiven: letter,
          usedClue,
          pointsAwarded: usedClue ? 3 : 6,
        });
        if (!res.duplicate) celebrate(res.pointsAwarded);
        else setFeedback("ok");
      } catch (err) {
        lockedKeys.current.delete(`${question.word.id}:LETTER`);
        setError(err instanceof ApiError ? err.message : "Save failed");
      } finally {
        setSaving(false);
      }
    } else {
      setFeedback("try");
    }
  }

  async function onSpellSubmit() {
    if (!question || !spellValue.trim() || feedback === "ok" || saving) return;
    const ok =
      spellValue.trim().toLowerCase() === question.word.text.toLowerCase();
    try {
      setSaving(true);
      const res = await submitAttempt({
        wordId: question.word.id,
        round: "SPELL",
        isCorrect: ok,
        answerGiven: spellValue.trim(),
        usedClue,
        pointsAwarded: ok ? (usedClue ? 4 : 8) : 0,
      });
      if (ok) {
        if (!res.duplicate) celebrate(res.pointsAwarded);
        else setFeedback("ok");
      } else {
        setFeedback("try");
      }
    } catch (err) {
      if (ok) lockedKeys.current.delete(`${question.word.id}:SPELL`);
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function showClue() {
    if (!question) return;
    setUsedClue(true);
    if (round === "LISTEN") {
      setHighlightCorrect(true);
      setClue(`Picture tip: look for ${question.word.emoji}`);
      void speakWord(question.word.text);
    } else if (round === "LETTER") {
      setClue(`Starts with “${question.word.firstLetter}”`);
      void speakWord(question.word.firstLetter);
    } else {
      setClue(`Starts with “${question.word.firstLetter}” · ${question.word.meaning}`);
      void speakWord(question.word.text);
    }
  }

  function replayCategory() {
    router.replace({
      pathname: "/play",
      params: {
        categoryId: String(params.categoryId),
        childId: String(params.childId),
        title: params.title ?? session?.category.label ?? "Play",
      },
    });
  }

  return (
    <AuthGate roles={ROLE_SETS.kidsLearning}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KidsHeader
          left={<IconButton emoji="←" onPress={() => router.back()} />}
          title={params.title ?? session?.category.label ?? "Play"}
          right={
            <View style={styles.scorePill}>
              <Text style={styles.scoreText}>⭐ {score}</Text>
            </View>
          }
        />

        <ErrorText>{error}</ErrorText>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.muted}>Starting game…</Text>
          </View>
        ) : null}

        {!loading && error && !session ? (
          <Card style={{ gap: 10, marginTop: 20 }}>
            <Title>Could not start</Title>
            <SoftButton label="Back to Learn" onPress={() => router.back()} />
          </Card>
        ) : null}

        {round === "RESULTS" && results ? (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {confetti ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.confetti,
                  {
                    opacity: confettiAnim.interpolate({
                      inputRange: [0, 0.2, 1],
                      outputRange: [0, 1, 0],
                    }),
                  },
                ]}
              >
                <Text style={styles.confettiText}>🎉 ✨ 🎊 ⭐ 🎈</Text>
              </Animated.View>
            ) : null}
            <Card color={colors.primary} style={styles.resultsCard}>
              <Text style={{ fontSize: 64 }}>🦊</Text>
              <Title>Great job, {results.childName}!</Title>
              <Text style={styles.resultsSub}>
                {results.category.emoji} {results.category.label} finished
              </Text>
              <View style={styles.statsGrid}>
                <Stat label="Attempted" value={String(results.questionsAttempted)} />
                <Stat label="Correct" value={String(results.correctAnswers)} />
                <Stat label="Points" value={String(results.points)} />
                <Stat
                  label="Stars"
                  value={"★".repeat(results.stars) || "☆"}
                />
                <Stat label="Accuracy" value={`${results.accuracy}%`} />
                <Stat label="Words" value={String(results.wordsLearned)} />
              </View>
              <SoftButton label="Replay category" onPress={replayCategory} />
              <SoftButton label="Back to categories" onPress={() => router.back()} />
              {results.nextCategory ? (
                <SoftButton
                  label={`Next: ${results.nextCategory.emoji} ${results.nextCategory.label}`}
                  onPress={() =>
                    router.replace({
                      pathname: "/play",
                      params: {
                        categoryId: results.nextCategory!.id,
                        childId: String(params.childId),
                        title: results.nextCategory!.label,
                      },
                    })
                  }
                />
              ) : null}
            </Card>
          </ScrollView>
        ) : null}

        {!loading && session && question && round !== "RESULTS" ? (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {confetti ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.confetti,
                  {
                    opacity: confettiAnim.interpolate({
                      inputRange: [0, 0.2, 1],
                      outputRange: [0, 1, 0],
                    }),
                  },
                ]}
              >
                <Text style={styles.confettiText}>🌟 🎉 ✨</Text>
              </Animated.View>
            ) : null}

            <Text style={styles.meta}>
              {session.category.emoji} Word {question.index}/{session.questionsTotal}
            </Text>

            <Card style={{ alignItems: "center", gap: 8 }}>
              <Text style={styles.round}>
                {round === "LISTEN"
                  ? "Round 1 — Listen"
                  : round === "LETTER"
                    ? "Letter fun"
                    : "Spell (optional)"}
              </Text>

              {round === "LISTEN" ? (
                <AvatarBubble emoji="👂" size={96} bg={colors.skySoft} />
              ) : question.word.imageUrl ? (
                <Image
                  source={{ uri: question.word.imageUrl }}
                  style={styles.wordImage}
                  accessibilityLabel={question.word.text}
                />
              ) : (
                <AvatarBubble emoji={question.word.emoji} size={96} bg={colors.skySoft} />
              )}

              {round === "LISTEN" ? (
                <Text style={styles.meaning}>Listen carefully, then pick the matching picture.</Text>
              ) : (
                <>
                  <Text style={styles.word}>{question.word.text}</Text>
                  <Text style={styles.meaning}>{question.word.meaning}</Text>
                </>
              )}

              {round === "SPELL" ? (
                <View style={styles.spellBox}>
                  <Text style={styles.spellTyped}>{spellValue || "—"}</Text>
                </View>
              ) : null}

              <View style={styles.audioRow}>
                <SoftButton
                  label="🔊 Play"
                  onPress={() => void speakWord(question.word.text)}
                />
                <SoftButton
                  label="Replay"
                  onPress={() => void speakWord(question.word.text)}
                />
                <SoftButton label="Clue" onPress={showClue} />
              </View>
              {clue ? <Text style={styles.clue}>{clue}</Text> : null}
            </Card>

            {round === "LISTEN" ? (
              <View style={styles.grid}>
                {question.listenOptions.map((opt) => (
                  <Pressable
                    key={opt.key}
                    style={[
                      styles.choice,
                      shadow.soft,
                      highlightCorrect && opt.isCorrect ? styles.choiceHint : null,
                    ]}
                    disabled={feedback === "ok" || saving}
                    onPress={() => {
                      void speakWord(opt.text);
                      void onListenPick(opt);
                    }}
                  >
                    <Text style={styles.choiceKey}>{opt.key}</Text>
                    <Text style={{ fontSize: 28 }}>{opt.emoji}</Text>
                    <Text style={styles.choiceLabel}>Pick {opt.key}</Text>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {round === "LETTER" ? (
              <View style={{ gap: 10 }}>
                <Text style={styles.spellHint}>Tap the first letter</Text>
                <View style={styles.grid}>
                  {letterChoices.map((letter) => (
                    <Pressable
                      key={letter}
                      style={[styles.choice, shadow.soft]}
                      disabled={feedback === "ok" || saving}
                      onPress={() => void onLetterPick(letter)}
                    >
                      <Text style={styles.letterBig}>{letter}</Text>
                    </Pressable>
                  ))}
                </View>
                <SoftButton
                  label="Try spelling with a grown-up →"
                  onPress={() => {
                    setFeedback(null);
                    setSpellValue("");
                    setRound("SPELL");
                    void speakWord(question.word.text);
                  }}
                />
              </View>
            ) : null}

            {round === "SPELL" ? (
              <View style={{ gap: 10 }}>
                <Text style={styles.spellHint}>
                  Optional with a parent — wrong answers are okay!
                </Text>
                <View style={styles.keyboard}>
                  {LETTERS.map((letter) => (
                    <Pressable
                      key={letter}
                      style={[styles.key, shadow.soft]}
                      disabled={feedback === "ok" || saving}
                      onPress={() =>
                        setSpellValue((v) =>
                          (v + letter).slice(0, question.word.text.length + 2)
                        )
                      }
                    >
                      <Text style={styles.letter}>{letter}</Text>
                    </Pressable>
                  ))}
                </View>
                <View style={styles.spellActions}>
                  <SoftButton
                    label="⌫"
                    onPress={() => setSpellValue((t) => t.slice(0, -1))}
                  />
                  <SoftButton label="Clear" onPress={() => setSpellValue("")} />
                  <SoftButton label="Okay ›" onPress={() => void onSpellSubmit()} />
                  <SoftButton
                    label="Skip"
                    onPress={() => void goNextQuestion()}
                  />
                </View>
              </View>
            ) : null}

            {feedback === "ok" ? (
              <Card color={colors.mintSoft} style={{ alignItems: "center", gap: 8 }}>
                <Text style={{ fontSize: 40 }}>🌟</Text>
                <Text style={styles.feedbackOk}>Good Job!</Text>
                <Text style={styles.feedbackMeta}>
                  {"★".repeat(starsFlash)} · +{pointsFlash} points
                </Text>
                <SoftButton
                  label={saving ? "Saving…" : "Next"}
                  onPress={() => {
                    if (round === "LISTEN") goNextAfterListen();
                    else void goNextQuestion();
                  }}
                />
              </Card>
            ) : null}

            {feedback === "try" ? (
              <Card style={{ alignItems: "center", gap: 8 }}>
                <Text style={styles.feedbackTry}>Nice try! Listen again.</Text>
                <SoftButton
                  label="Try again"
                  onPress={() => {
                    setFeedback(null);
                    void speakWord(question.word.text);
                  }}
                />
                {round === "LETTER" || round === "SPELL" ? (
                  <SoftButton label="Next word" onPress={() => void goNextQuestion()} />
                ) : null}
              </Card>
            ) : null}
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </AuthGate>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  content: { gap: 14, paddingBottom: 28 },
  centerBox: { alignItems: "center", gap: 12, marginTop: 48 },
  muted: { color: colors.textMuted, fontWeight: "600" },
  scorePill: {
    backgroundColor: "#fff",
    borderRadius: radii.pill,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  scoreText: { fontWeight: "800", color: colors.text },
  meta: { fontWeight: "700", color: colors.textMuted },
  round: { color: colors.primary, fontWeight: "800" },
  word: {
    fontSize: 34,
    fontWeight: "800",
    color: colors.text,
    textTransform: "capitalize",
  },
  meaning: { color: colors.textMuted, textAlign: "center" },
  wordImage: {
    width: 120,
    height: 120,
    borderRadius: 24,
    backgroundColor: colors.skySoft,
  },
  audioRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  clue: { color: colors.accent, fontWeight: "700", textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  choice: {
    width: "47%",
    flexGrow: 1,
    backgroundColor: "#fff",
    borderRadius: radii.lg,
    padding: 16,
    alignItems: "center",
    gap: 4,
  },
  choiceHint: { borderWidth: 2, borderColor: colors.success },
  choiceKey: { fontWeight: "800", color: colors.primary },
  choiceLabel: { fontWeight: "700", color: colors.text },
  letterBig: { fontSize: 32, fontWeight: "800", color: colors.primaryDark },
  spellBox: {
    minWidth: 160,
    minHeight: 52,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
  },
  spellTyped: {
    fontSize: 28,
    fontWeight: "800",
    color: colors.primaryDark,
    letterSpacing: 4,
  },
  spellHint: { textAlign: "center", color: colors.textMuted, fontWeight: "600" },
  keyboard: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    justifyContent: "center",
  },
  key: {
    width: 36,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  letter: { fontSize: 16, fontWeight: "800", color: colors.primaryDark },
  spellActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  feedbackOk: { fontWeight: "800", fontSize: 22, color: colors.success },
  feedbackMeta: { fontWeight: "700", color: colors.text },
  feedbackTry: { fontWeight: "700", color: colors.accent, textAlign: "center" },
  confetti: {
    position: "absolute",
    top: 8,
    left: 0,
    right: 0,
    zIndex: 5,
    alignItems: "center",
  },
  confettiText: { fontSize: 28 },
  resultsCard: { alignItems: "center", gap: 10, marginTop: 12 },
  resultsSub: { color: "#EDE9FE", fontWeight: "700", textAlign: "center" },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    width: "100%",
  },
  stat: {
    width: "30%",
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: radii.md,
    paddingVertical: 10,
    alignItems: "center",
  },
  statValue: { color: "#fff", fontWeight: "800", fontSize: 18 },
  statLabel: { color: "#EDE9FE", fontSize: 11, fontWeight: "600" },
});
