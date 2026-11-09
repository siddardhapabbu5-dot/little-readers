import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, ProgressBar, SoftButton } from "../components/ui";
import { IconButton, KidsButton, KidsHeader, SkyBackground } from "../components/kids";
import { art } from "../components/illustrations";
import { AuthGate } from "../components/AuthGate";
import { CertificateEarned, type EarnedCertificate } from "../components/CertificateEarned";
import { ChallengePointsEarned, type ChallengeResult } from "../components/ChallengePointsEarned";
import { ApiError } from "../services/api";
import { apiRequest, isPreviewChild } from "../services/learning-session";
import { ROLE_SETS } from "../services/auth-errors";
import { displayEmoji } from "../services/emoji";
import { speakWord } from "../services/speech";
import { colors, radii, shadow } from "../theme";

type Option = {
  key: string;
  wordId?: string;
  text: string;
  emoji: string;
  isCorrect: boolean;
};

type Question = {
  index: number;
  word: {
    id: string;
    text: string;
    meaning: string;
    emoji: string;
  };
  listenOptions: Option[];
};

type SessionPayload = {
  sessionId: string;
  category: { label: string; emoji: string };
  questions: Question[];
};

type ResultsPayload = {
  childName: string;
  questionsAttempted: number;
  correctAnswers: number;
  points: number;
  stars: number;
  accuracy: number;
  wordsLearned: number;
  newCertificates?: EarnedCertificate[];
  challenge?: ChallengeResult;
};

export default function QuizScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    categoryId?: string;
    childId: string;
    title?: string;
    mix?: string;
    surprise?: string;
  }>();

  const [session, setSession] = useState<SessionPayload | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<"ok" | "try" | null>(null);
  const [score, setScore] = useState(0);
  const [results, setResults] = useState<ResultsPayload | null>(null);
  const startedAt = useRef(Date.now());
  const locked = useRef(new Set<string>());

  const question = session?.questions[qIndex] ?? null;

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        if (!params.childId || (!params.categoryId && !params.mix)) throw new Error("Missing params");
        const data = await apiRequest<SessionPayload>("/learning/sessions", {
          method: "POST",
          body: JSON.stringify({
            childId: params.childId,
            ...(params.mix ? { mix: params.mix } : { categoryId: params.categoryId }),
            activityMode: "QUIZ",
            questionCount: 8,
            resume: false,
            ...(params.surprise === "1" ? { surprise: true } : {}),
          }),
        });
        setSession({
          ...data,
          questions: data.questions.map((q) => ({
            ...q,
            word: { ...q.word, emoji: displayEmoji(q.word.emoji) },
            listenOptions: q.listenOptions.map((o) => ({
              ...o,
              emoji: displayEmoji(o.emoji),
            })),
          })),
        });
        startedAt.current = Date.now();
      } catch (err) {
        if (err instanceof ApiError && err.status === 402) {
          router.replace("/subscription");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Could not start Quiz");
      } finally {
        setLoading(false);
      }
    })();
  }, [params.categoryId, params.childId, params.mix, router]);

  const finish = useCallback(async () => {
    if (!session) return;
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
  }, [session]);

  async function onPick(option: Option) {
    if (!question || !session || feedback === "ok" || saving || results) return;
    const lockKey = question.word.id;
    if (option.isCorrect && locked.current.has(lockKey)) {
      setFeedback("ok");
      return;
    }

    try {
      setSaving(true);
      if (option.isCorrect) locked.current.add(lockKey);
      const res = await apiRequest<{ pointsAwarded: number; duplicate?: boolean }>(
        `/learning/sessions/${session.sessionId}/attempts`,
        {
          method: "POST",
          body: JSON.stringify({
            wordId: question.word.id,
            round: "QUIZ",
            isCorrect: option.isCorrect,
            answerGiven: option.text,
            pointsAwarded: option.isCorrect ? 8 : 0,
          }),
        }
      );
      if (option.isCorrect) {
        if (!res.duplicate) setScore((s) => s + res.pointsAwarded);
        setFeedback("ok");
        void speakWord(question.word.text);
      } else {
        setFeedback("try");
      }
    } catch (err) {
      if (option.isCorrect) locked.current.delete(lockKey);
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onNext() {
    if (!session || saving) return;
    setFeedback(null);
    if (qIndex + 1 >= session.questions.length) {
      setSaving(true);
      try {
        await finish();
      } catch (err) {
        setError(err instanceof ApiError ? err.message : "Could not save results");
      } finally {
        setSaving(false);
      }
      return;
    }
    setQIndex((i) => i + 1);
  }

  return (
    <AuthGate roles={ROLE_SETS.kidsLearning}>
      <SkyBackground>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KidsHeader
          left={<IconButton emoji="←" onPress={() => router.back()} />}
          title={params.title ?? session?.category.label ?? "Quiz"}
          right={
            <View style={styles.scorePill}>
              <Text style={styles.scoreText}>⭐ {score}</Text>
            </View>
          }
        />
        <ErrorText>{error}</ErrorText>

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}

        {results ? (
          <ScrollView contentContainerStyle={styles.content}>
            <Card color={colors.primary} style={styles.results}>
              <Image source={art.trophy} style={styles.resultsArt} resizeMode="contain" />
              <Text style={styles.resultsTitle}>Quiz complete, {results.childName}!</Text>
              <Text style={styles.resultsSub}>
                {results.correctAnswers}/{results.questionsAttempted} · {results.points} pts ·{" "}
                {results.accuracy}%
              </Text>
              <CertificateEarned certificates={results.newCertificates} />
              <ChallengePointsEarned challenge={results.challenge} />
              <SoftButton label="Back to Games" onPress={() => (isPreviewChild(params.childId) ? router.back() : router.replace("/(tabs)/games"))} />
              <SoftButton label="Home" onPress={() => router.replace("/(tabs)/home")} />
            </Card>
          </ScrollView>
        ) : null}

        {!loading && question && !results ? (
          <View style={styles.playArea}>
            <View style={styles.progressRow}>
              <View style={{ flex: 1 }}>
                <ProgressBar value={qIndex + 1} max={Math.max(session?.questions.length ?? 1, 1)} color={colors.orange} />
              </View>
              <Text style={styles.progress}>
                {qIndex + 1}/{session?.questions.length ?? 0}
              </Text>
            </View>
            <View style={[styles.promptCard, shadow.card]}>
              <Image source={art.quiz} style={styles.quizArt} resizeMode="contain" />
              {/* The answer's picture is revealed only after a correct pick. */}
              <Text style={styles.emoji}>{feedback === "ok" ? question.word.emoji : "🤔"}</Text>
              {feedback === "ok" ? (
                <Text style={styles.okText}>🎉 Correct! Well done!</Text>
              ) : feedback === "try" ? (
                <Text style={styles.tryAgain}>💪 Nice try! Pick another answer.</Text>
              ) : (
                <Text style={styles.prompt}>What word matches this meaning?</Text>
              )}
              <Text style={styles.meaning} numberOfLines={3}>
                {question.word.meaning}
              </Text>
            </View>

            <View style={styles.optionGrid}>
              {pairs(question.listenOptions).map((row, r) => (
                <View key={r} style={styles.optionRow}>
                  {row.map((opt, c) => {
                    const i = r * 2 + c;
                    return (
                      <Pressable
                        key={opt.key}
                        disabled={feedback === "ok" || saving}
                        onPress={() => void onPick(opt)}
                        accessibilityRole="button"
                        accessibilityLabel={opt.text}
                        style={({ pressed }) => [
                          styles.option,
                          { backgroundColor: OPTION_TINTS[i % OPTION_TINTS.length] },
                          shadow.soft,
                          feedback === "ok" && opt.isCorrect && styles.optionOk,
                          feedback === "try" && !opt.isCorrect && styles.optionDim,
                          { transform: [{ scale: pressed ? 0.97 : 1 }] },
                        ]}
                      >
                        <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                        <Text style={styles.optionText} numberOfLines={2}>
                          {opt.text}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              ))}
            </View>

            {feedback === "ok" ? (
              <KidsButton label={saving ? "Saving…" : "Next Question"} onPress={() => void onNext()} />
            ) : null}
          </View>
        ) : null}
      </SafeAreaView>
      </SkyBackground>
    </AuthGate>
  );
}

const OPTION_TINTS = [colors.cream, colors.pinkSoft, colors.skySoft, colors.greenSoft];

function pairs<T>(items: T[]): T[][] {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return rows;
}

const styles = StyleSheet.create({
  safe: { flex: 1, paddingHorizontal: 4, width: "100%", maxWidth: 720, alignSelf: "center" },
  content: { padding: 14, gap: 14, paddingBottom: 40 },
  center: { padding: 40, alignItems: "center" },
  playArea: { flex: 1, padding: 14, paddingBottom: 10, gap: 12 },
  progressRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  progress: { fontWeight: "900", color: colors.text, fontSize: 14 },
  promptCard: {
    alignItems: "center",
    gap: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: "#fff",
    borderRadius: radii.xl,
  },
  quizArt: { position: "absolute", top: 6, right: 6, width: 44, height: 44, opacity: 0.9 },
  emoji: { fontSize: 46 },
  prompt: { fontWeight: "800", color: colors.textMuted, fontSize: 15, textAlign: "center" },
  meaning: {
    fontSize: 20,
    fontWeight: "900",
    color: colors.text,
    textAlign: "center",
    lineHeight: 26,
  },
  optionGrid: { flex: 1, gap: 12, minHeight: 0 },
  optionRow: { flex: 1, flexDirection: "row", gap: 12, minHeight: 0 },
  option: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    borderRadius: radii.xl,
    paddingVertical: 8,
    paddingHorizontal: 8,
    minHeight: 0,
    borderWidth: 3,
    borderColor: "#fff",
  },
  optionOk: { borderColor: colors.green, backgroundColor: colors.greenSoft },
  optionDim: { opacity: 0.55 },
  optionEmoji: { fontSize: 40 },
  optionText: { fontWeight: "900", fontSize: 18, color: colors.text, textAlign: "center" },
  okText: { fontWeight: "900", fontSize: 16, color: "#15803D", textAlign: "center" },
  tryAgain: { color: "#C2410C", fontWeight: "900", fontSize: 15, textAlign: "center" },
  resultsArt: { width: 140, height: 140 },
  resultsTitle: { color: "#fff", fontSize: 24, fontWeight: "900", textAlign: "center" },
  resultsSub: { color: "#F3EEFF", fontWeight: "800", textAlign: "center", fontSize: 15 },
  scorePill: {
    backgroundColor: "#fff",
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  scoreText: { fontWeight: "800", color: colors.primaryDark },
  results: { alignItems: "center", gap: 10, paddingVertical: 24 },
});
