import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, SoftButton, Title } from "../components/ui";
import { IconButton, KidsHeader } from "../components/kids";
import { AuthGate } from "../components/AuthGate";
import { apiRequest, ApiError } from "../services/api";
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
};

export default function QuizScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    categoryId?: string;
    childId: string;
    title?: string;
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
        if (!params.childId || !params.categoryId) throw new Error("Missing params");
        const data = await apiRequest<SessionPayload>("/learning/sessions", {
          method: "POST",
          body: JSON.stringify({
            childId: params.childId,
            categoryId: params.categoryId,
            activityMode: "QUIZ",
            questionCount: 8,
            resume: false,
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
  }, [params.categoryId, params.childId, router]);

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
              <Text style={{ fontSize: 56 }}>📝</Text>
              <Title>Quiz complete, {results.childName}!</Title>
              <Text style={styles.muted}>
                {results.correctAnswers}/{results.questionsAttempted} · {results.points} pts ·{" "}
                {results.accuracy}%
              </Text>
              <SoftButton label="Back to Games" onPress={() => router.replace("/(tabs)/games")} />
              <SoftButton label="Home" onPress={() => router.replace("/(tabs)/home")} />
            </Card>
          </ScrollView>
        ) : null}

        {!loading && question && !results ? (
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.progress}>
              Question {qIndex + 1} / {session?.questions.length ?? 0}
            </Text>
            <Card style={styles.promptCard}>
              <Text style={styles.emoji}>{question.word.emoji}</Text>
              <Text style={styles.prompt}>What word matches this meaning?</Text>
              <Text style={styles.meaning}>{question.word.meaning}</Text>
            </Card>

            {question.listenOptions.map((opt) => (
              <Pressable
                key={opt.key}
                disabled={feedback === "ok" || saving}
                onPress={() => void onPick(opt)}
                style={[
                  styles.option,
                  feedback === "ok" && opt.isCorrect && styles.optionOk,
                  feedback === "try" && !opt.isCorrect && styles.optionDim,
                ]}
              >
                <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                <Text style={styles.optionText}>{opt.text}</Text>
              </Pressable>
            ))}

            {feedback === "ok" ? (
              <SoftButton label={saving ? "Saving…" : "Next"} onPress={() => void onNext()} />
            ) : null}
            {feedback === "try" ? (
              <Text style={styles.tryAgain}>Try another answer</Text>
            ) : null}
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  center: { padding: 40, alignItems: "center" },
  muted: { color: colors.textMuted, fontWeight: "600", textAlign: "center" },
  progress: { fontWeight: "800", color: colors.primaryDark },
  promptCard: { alignItems: "center", gap: 8, paddingVertical: 18 },
  emoji: { fontSize: 48 },
  prompt: { fontWeight: "700", color: colors.textMuted },
  meaning: {
    fontSize: 18,
    fontWeight: "800",
    color: colors.text,
    textAlign: "center",
    lineHeight: 26,
  },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: "#fff",
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 2,
    borderColor: "#E8E4F8",
    ...shadow.soft,
  },
  optionOk: { borderColor: colors.mint, backgroundColor: colors.mintSoft },
  optionDim: { opacity: 0.7 },
  optionEmoji: { fontSize: 26 },
  optionText: { fontWeight: "800", fontSize: 16, color: colors.text },
  tryAgain: { color: colors.accent, fontWeight: "800", textAlign: "center" },
  scorePill: {
    backgroundColor: "#fff",
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  scoreText: { fontWeight: "800", color: colors.primaryDark },
  results: { alignItems: "center", gap: 10, paddingVertical: 24 },
});
