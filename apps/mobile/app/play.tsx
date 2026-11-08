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
  ProgressBar,
  SoftButton,
  Title,
} from "../components/ui";
import { IconButton, KidsHeader, SkyBackground } from "../components/kids";
import { art } from "../components/illustrations";
import { AuthGate } from "../components/AuthGate";
import { CertificateEarned, type EarnedCertificate } from "../components/CertificateEarned";
import { ChallengePointsEarned, type ChallengeResult } from "../components/ChallengePointsEarned";
import { ApiError } from "../services/api";
import { apiRequest } from "../services/learning-session";
import { ROLE_SETS } from "../services/auth-errors";
import { displayEmoji } from "../services/emoji";
import { prefetchKidVoice, speakWord } from "../services/speech";
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
  newCertificates?: EarnedCertificate[];
  challenge?: ChallengeResult;
}

const LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
const CHOICE_TINTS: Record<string, string> = {
  A: colors.cream,
  B: colors.pinkSoft,
  C: colors.skySoft,
  D: colors.greenSoft,
};

export default function PlayScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    categoryId?: string;
    lessonId?: string;
    childId: string;
    title?: string;
    /** Deep-link into Listen or Spell for the first word. */
    startRound?: string;
    /** "1" = start a new round instead of continuing the unfinished one. */
    fresh?: string;
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
    prefetchKidVoice();
  }, []);

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
              // Omit count → server gives remaining unlearned words (up to full category).
              : { categoryId: params.categoryId, resume: params.fresh !== "1" }),
          }),
        });
        // Ensure Symbol emoji from A–Z sheets always render for parent/kid play.
        const questions = data.questions.map((q) => ({
          ...q,
          word: { ...q.word, emoji: displayEmoji(q.word.emoji) },
          listenOptions: q.listenOptions.map((o) => ({
            ...o,
            emoji: displayEmoji(o.emoji),
          })),
        }));
        setSession({ ...data, questions });
        startedAt.current = Date.now();
        const preferred =
          String(params.startRound ?? "").toUpperCase() === "SPELL"
            ? "SPELL"
            : String(params.startRound ?? "").toUpperCase() === "LETTER"
              ? "LETTER"
              : "LISTEN";
        setRound(preferred);
        if (questions[0]) void speakWord(questions[0].word.text, { profile: "kid" });
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
  }, [params.categoryId, params.lessonId, params.childId, params.startRound, params.fresh]);

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
        fresh: "1",
      },
    });
  }

  return (
    <AuthGate roles={ROLE_SETS.kidsLearning}>
      <SkyBackground>
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
              <Image source={art.trophy} style={styles.resultsArt} resizeMode="contain" />
              <Text style={styles.resultsTitle}>Great job, {results.childName}!</Text>
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
              <CertificateEarned certificates={results.newCertificates} />
              <ChallengePointsEarned challenge={results.challenge} />
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
          <View style={styles.playScreen}>
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

            <View style={styles.progressRow}>
              <View style={{ flex: 1 }}>
                <ProgressBar value={question.index} max={Math.max(session.questionsTotal, 1)} color={colors.orange} />
              </View>
              <Text style={styles.progressText}>
                {question.index}/{session.questionsTotal}
              </Text>
            </View>

            <View style={[styles.promptBar, shadow.card]}>
              <View style={styles.promptLeft}>
                {round === "LISTEN" ? (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Play the word"
                    onPress={() => void speakWord(question.word.text, { profile: "kid" })}
                    style={({ pressed }) => [styles.bigAudio, { transform: [{ scale: pressed ? 0.94 : 1 }] }]}
                  >
                    <Text style={styles.bigAudioIcon}>🔊</Text>
                  </Pressable>
                ) : question.word.imageUrl ? (
                  <Image
                    source={{ uri: question.word.imageUrl }}
                    style={styles.wordImageSm}
                    accessibilityLabel={feedback === "ok" ? question.word.text : "Picture clue"}
                  />
                ) : (
                  <AvatarBubble
                    emoji={displayEmoji(question.word.emoji)}
                    size={52}
                    bg={colors.skySoft}
                  />
                )}
                <View style={styles.promptTextCol}>
                  <Text style={styles.meta} numberOfLines={1}>
                    {session.category.emoji} {question.index}/{session.questionsTotal}
                    {" · "}
                    {round === "LISTEN"
                      ? "Listen"
                      : round === "LETTER"
                        ? "Letter"
                        : "Spell"}
                  </Text>
                  {round === "LISTEN" ? (
                    <Text style={styles.listenPrompt} numberOfLines={2}>
                      Listen, then tap the right picture!
                    </Text>
                  ) : (
                    <>
                      {feedback === "ok" ? (
                        <Text style={styles.wordSm} numberOfLines={1}>
                          {question.word.text}
                        </Text>
                      ) : (
                        <Text style={styles.wordHidden} numberOfLines={1}>
                          Tap 🔊 Play and listen
                        </Text>
                      )}
                      <Text style={styles.meaning} numberOfLines={1}>
                        {question.word.meaning}
                      </Text>
                    </>
                  )}
                </View>
              </View>
              <View style={styles.audioRow}>
                <SoftButton
                  label="🔊 Play"
                  onPress={() => void speakWord(question.word.text, { profile: "kid" })}
                />
                <SoftButton label="Clue" onPress={showClue} />
              </View>
              {clue ? (
                <Text style={styles.clue} numberOfLines={1}>
                  {clue}
                </Text>
              ) : null}
              {round === "SPELL" ? (
                <View style={styles.spellBox}>
                  <Text style={styles.spellTyped}>{spellValue || "—"}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.playBody}>
              {round === "LISTEN" ? (
                <View style={styles.gridRows}>
                  {[0, 1].map((row) => (
                    <View key={row} style={styles.gridRow}>
                      {question.listenOptions.slice(row * 2, row * 2 + 2).map((opt) => (
                        <Pressable
                          key={opt.key}
                          accessibilityRole="button"
                          accessibilityLabel={`Answer ${opt.key}`}
                          style={({ pressed }) => [
                            styles.choiceFlex,
                            styles.choicePicture,
                            { backgroundColor: CHOICE_TINTS[opt.key] ?? "#fff" },
                            shadow.card,
                            highlightCorrect && opt.isCorrect ? styles.choiceHint : null,
                            { transform: [{ scale: pressed ? 0.96 : 1 }] },
                          ]}
                          disabled={feedback === "ok" || saving}
                          onPress={() => {
                            void speakWord(opt.text, { profile: "kid" });
                            void onListenPick(opt);
                          }}
                        >
                          <Text style={styles.choiceKey}>{opt.key}</Text>
                          <Text style={styles.choiceEmoji}>{displayEmoji(opt.emoji)}</Text>
                        </Pressable>
                      ))}
                    </View>
                  ))}
                </View>
              ) : null}

              {round === "LETTER" ? (
                <View style={styles.letterBlock}>
                  <Text style={styles.spellHint}>Tap the first letter</Text>
                  <View style={styles.gridRows}>
                    {[0, 1].map((row) => (
                      <View key={row} style={styles.gridRow}>
                        {letterChoices.slice(row * 2, row * 2 + 2).map((letter) => (
                          <Pressable
                            key={letter}
                            accessibilityRole="button"
                            accessibilityLabel={`Letter ${letter}`}
                            style={({ pressed }) => [
                              styles.choiceFlex,
                              styles.letterTile,
                              shadow.card,
                              { transform: [{ scale: pressed ? 0.96 : 1 }] },
                            ]}
                            disabled={feedback === "ok" || saving}
                            onPress={() => void onLetterPick(letter)}
                          >
                            <Text style={styles.letterBig}>{letter}</Text>
                          </Pressable>
                        ))}
                      </View>
                    ))}
                  </View>
                  <SoftButton
                    label="Spell with a grown-up →"
                    onPress={() => {
                      setFeedback(null);
                      setSpellValue("");
                      setRound("SPELL");
                      void speakWord(question.word.text, { profile: "kid" });
                    }}
                  />
                </View>
              ) : null}

              {round === "SPELL" ? (
                <View style={styles.spellBlock}>
                  <View style={styles.keyboard}>
                    {LETTERS.map((letter) => (
                      <Pressable
                        key={letter}
                        accessibilityRole="button"
                        accessibilityLabel={`Type ${letter}`}
                        style={({ pressed }) => [styles.key, shadow.soft, { opacity: pressed ? 0.7 : 1 }]}
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
                    <SoftButton label="Skip" onPress={() => void goNextQuestion()} />
                  </View>
                </View>
              ) : null}
            </View>

            {feedback === "ok" ? (
              <View style={styles.feedbackBarOk}>
                <Text style={styles.feedbackInline}>
                  🎉 Great job! {"⭐".repeat(starsFlash)} +{pointsFlash}
                </Text>
                <SoftButton
                  label={saving ? "…" : "Next"}
                  onPress={() => {
                    if (round === "LISTEN") goNextAfterListen();
                    else void goNextQuestion();
                  }}
                />
              </View>
            ) : null}

            {feedback === "try" ? (
              <View style={styles.feedbackBarTry}>
                <Text style={styles.feedbackTry}>💪 Nice try! Listen again.</Text>
                <SoftButton
                  label="Again"
                  onPress={() => {
                    setFeedback(null);
                    void speakWord(question.word.text, { profile: "kid" });
                  }}
                />
                {round === "LETTER" || round === "SPELL" ? (
                  <SoftButton label="Next" onPress={() => void goNextQuestion()} />
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}
      </SafeAreaView>
      </SkyBackground>
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
  safe: { flex: 1, paddingHorizontal: 14, width: "100%", maxWidth: 720, alignSelf: "center" },
  content: { gap: 14, paddingBottom: 28 },
  playScreen: { flex: 1, minHeight: 0, gap: 10, paddingBottom: 6 },
  playBody: { flex: 1, minHeight: 0 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4 },
  progressText: { fontWeight: "900", color: colors.text, fontSize: 14 },
  promptBar: {
    backgroundColor: "#fff",
    borderRadius: radii.xl,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  promptLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
  bigAudio: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 4,
    borderColor: colors.primarySoft,
  },
  bigAudioIcon: { fontSize: 30 },
  listenPrompt: { color: colors.text, fontSize: 17, fontWeight: "900", lineHeight: 22 },
  promptTextCol: { flex: 1, gap: 2 },
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
  meta: { fontWeight: "800", color: colors.textMuted, fontSize: 13 },
  wordHidden: { fontSize: 17, fontWeight: "900", color: colors.primary, marginVertical: 2 },
  wordSm: {
    fontSize: 26,
    fontWeight: "800",
    color: colors.text,
    textTransform: "capitalize",
  },
  meaning: { color: colors.textMuted, fontSize: 14, fontWeight: "700" },
  wordImageSm: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: colors.skySoft,
  },
  audioRow: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  clue: { color: colors.orange, fontWeight: "800", fontSize: 14 },
  gridRows: { flex: 1, minHeight: 0, gap: 12 },
  gridRow: { flex: 1, flexDirection: "row", gap: 12, minHeight: 0 },
  choiceFlex: {
    flex: 1,
    minHeight: 0,
    backgroundColor: "#fff",
    borderRadius: radii.lg,
    paddingVertical: 6,
    paddingHorizontal: 6,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  choicePicture: { borderRadius: radii.xl, borderWidth: 3, borderColor: "#fff", minHeight: 96 },
  choiceHint: { borderWidth: 4, borderColor: colors.green },
  choiceKey: {
    position: "absolute",
    top: 8,
    left: 10,
    fontWeight: "900",
    color: colors.primary,
    fontSize: 14,
  },
  choiceEmoji: { fontSize: 64, lineHeight: 76 },
  letterTile: { borderRadius: radii.xl, borderWidth: 3, borderColor: "#fff", minHeight: 64 },
  letterBig: { fontSize: 48, fontWeight: "900", color: colors.primaryDark },
  letterBlock: { flex: 1, gap: 6, minHeight: 0 },
  spellBlock: { flex: 1, gap: 8, justifyContent: "flex-end" },
  spellBox: {
    minHeight: 52,
    borderRadius: radii.md,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  spellTyped: {
    fontSize: 28,
    fontWeight: "900",
    color: colors.primaryDark,
    letterSpacing: 4,
  },
  spellHint: {
    textAlign: "center",
    color: colors.text,
    fontWeight: "800",
    fontSize: 16,
  },
  keyboard: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    justifyContent: "center",
  },
  key: {
    width: 42,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 3,
    borderBottomColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  letter: { fontSize: 20, fontWeight: "900", color: colors.primaryDark },
  spellActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" },
  feedbackBarOk: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexShrink: 0,
    backgroundColor: colors.greenSoft,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: colors.green,
  },
  feedbackBarTry: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
    flexShrink: 0,
    backgroundColor: colors.orangeSoft,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: colors.orange,
  },
  feedbackInline: { flex: 1, fontWeight: "900", color: "#15803D", fontSize: 17 },
  feedbackTry: { flex: 1, fontWeight: "900", color: "#C2410C", fontSize: 16 },
  confetti: {
    position: "absolute",
    top: 4,
    left: 0,
    right: 0,
    zIndex: 5,
    alignItems: "center",
  },
  confettiText: { fontSize: 22 },
  resultsCard: { alignItems: "center", gap: 10, marginTop: 12, borderRadius: radii.xl },
  resultsArt: { width: 140, height: 140 },
  resultsTitle: { color: "#fff", fontSize: 26, fontWeight: "900", textAlign: "center" },
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
