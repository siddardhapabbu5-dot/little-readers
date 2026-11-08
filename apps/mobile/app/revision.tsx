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
import { CertificateEarned, type EarnedCertificate } from "../components/CertificateEarned";
import { ApiError } from "../services/api";
import { apiRequest, isPreviewChild } from "../services/learning-session";
import { ROLE_SETS } from "../services/auth-errors";
import { displayEmoji } from "../services/emoji";
import { speakWord } from "../services/speech";
import { colors, radii, shadow } from "../theme";

type Option = {
  key: string;
  text: string;
  emoji: string;
  isCorrect: boolean;
};

type Question = {
  index: number;
  word: { id: string; text: string; meaning: string; emoji: string };
  listenOptions: Option[];
};

type SessionPayload = {
  sessionId: string;
  category: { label: string; emoji: string };
  revisionNote?: string | null;
  questions: Question[];
};

type ResultsPayload = {
  childName: string;
  questionsAttempted: number;
  correctAnswers: number;
  points: number;
  accuracy: number;
  wordsLearned: number;
  newCertificates?: EarnedCertificate[];
};

/**
 * Revision: listen-style review prioritising weak/learned words from history.
 * A word counts as reviewed only after a correct REVISION attempt in this session.
 */
export default function RevisionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    categoryId?: string;
    childId: string;
    title?: string;
    mix?: string;
  }>();

  const [session, setSession] = useState<SessionPayload | null>(null);
  const [qIndex, setQIndex] = useState(0);
  const [mode, setMode] = useState<"LISTEN" | "SPELL">("LISTEN");
  const [spellValue, setSpellValue] = useState("");
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
            activityMode: "REVISION",
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
        if (data.questions[0]) {
          void speakWord(data.questions[0].word.text, { profile: "kid" });
        }
      } catch (err) {
        if (err instanceof ApiError && err.status === 402) {
          router.replace("/subscription");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Could not start Revision");
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

  async function submit(
    isCorrect: boolean,
    answerGiven: string,
    pointsAwarded: number
  ) {
    if (!question || !session) return;
    const lockKey = question.word.id;
    if (isCorrect && locked.current.has(lockKey)) {
      setFeedback("ok");
      return;
    }
    if (isCorrect) locked.current.add(lockKey);
    try {
      setSaving(true);
      const res = await apiRequest<{ pointsAwarded: number; duplicate?: boolean }>(
        `/learning/sessions/${session.sessionId}/attempts`,
        {
          method: "POST",
          body: JSON.stringify({
            wordId: question.word.id,
            round: "REVISION",
            isCorrect,
            answerGiven,
            pointsAwarded,
          }),
        }
      );
      if (isCorrect) {
        if (!res.duplicate) setScore((s) => s + res.pointsAwarded);
        setFeedback("ok");
      } else {
        setFeedback("try");
      }
    } catch (err) {
      if (isCorrect) locked.current.delete(lockKey);
      setError(err instanceof ApiError ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function onNext() {
    if (!session) return;
    setFeedback(null);
    setSpellValue("");
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
    const next = qIndex + 1;
    setQIndex(next);
    setMode(next % 2 === 0 ? "LISTEN" : "SPELL");
    void speakWord(session.questions[next].word.text, { profile: "kid" });
  }

  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  return (
    <AuthGate roles={ROLE_SETS.kidsLearning}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KidsHeader
          left={<IconButton emoji="←" onPress={() => router.back()} />}
          title={params.title ?? "Revision"}
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
              <Text style={{ fontSize: 56 }}>🔁</Text>
              <Title>Revision done, {results.childName}!</Title>
              <Text style={styles.muted}>
                {results.correctAnswers} reviewed correctly · {results.points} pts
              </Text>
              <CertificateEarned certificates={results.newCertificates} />
              <SoftButton label="Back to Games" onPress={() => (isPreviewChild(params.childId) ? router.back() : router.replace("/(tabs)/games"))} />
              <SoftButton label="Home" onPress={() => router.replace("/(tabs)/home")} />
            </Card>
          </ScrollView>
        ) : null}

        {!loading && question && !results ? (
          <ScrollView contentContainerStyle={styles.content}>
            {session?.revisionNote ? (
              <Text style={styles.note}>{session.revisionNote}</Text>
            ) : null}
            <Text style={styles.progress}>
              {mode === "LISTEN" ? "Listen & choose" : "Spell the word"} · {qIndex + 1}/
              {session?.questions.length ?? 0}
            </Text>

            <Card style={styles.promptCard}>
              <Pressable onPress={() => void speakWord(question.word.text, { profile: "kid" })}>
                <Text style={styles.speaker}>🔊 Hear again</Text>
              </Pressable>
              {mode === "SPELL" ? (
                <Text style={styles.emoji}>{question.word.emoji}</Text>
              ) : (
                <Text style={styles.hint}>Listen, then pick the matching word</Text>
              )}
              <Text style={styles.meaning}>{question.word.meaning}</Text>
            </Card>

            {mode === "LISTEN"
              ? question.listenOptions.map((opt) => (
                  <Pressable
                    key={opt.key}
                    disabled={feedback === "ok" || saving}
                    onPress={() =>
                      void submit(opt.isCorrect, opt.text, opt.isCorrect ? 8 : 0)
                    }
                    style={[
                      styles.option,
                      feedback === "ok" && opt.isCorrect && styles.optionOk,
                    ]}
                  >
                    <Text style={styles.optionEmoji}>{opt.emoji}</Text>
                    <Text style={styles.optionText}>{opt.text}</Text>
                  </Pressable>
                ))
              : (
                <>
                  <View style={styles.spellBox}>
                    <Text style={styles.spellValue}>{spellValue || " "}</Text>
                  </View>
                  <View style={styles.keyboard}>
                    {letters.map((L) => (
                      <Pressable
                        key={L}
                        style={styles.key}
                        onPress={() => setSpellValue((v) => (v + L).slice(0, 24))}
                      >
                        <Text style={styles.keyText}>{L}</Text>
                      </Pressable>
                    ))}
                  </View>
                  <View style={styles.row}>
                    <SoftButton label="Clear" onPress={() => setSpellValue("")} />
                    <SoftButton
                      label="Check"
                      onPress={() => {
                        const ok =
                          spellValue.trim().toLowerCase() ===
                          question.word.text.toLowerCase();
                        void submit(ok, spellValue.trim(), ok ? 8 : 0);
                      }}
                    />
                  </View>
                </>
              )}

            {feedback === "ok" ? (
              <SoftButton label="Next" onPress={() => void onNext()} />
            ) : null}
            {feedback === "try" ? (
              <Text style={styles.tryAgain}>Keep trying — hear the word again</Text>
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
  note: {
    backgroundColor: colors.yellowSoft,
    borderRadius: radii.md,
    padding: 12,
    fontWeight: "700",
    color: colors.text,
    lineHeight: 20,
  },
  progress: { fontWeight: "800", color: colors.primaryDark },
  promptCard: { alignItems: "center", gap: 8, paddingVertical: 16 },
  speaker: { color: colors.primary, fontWeight: "800" },
  emoji: { fontSize: 48 },
  hint: { color: colors.textMuted, fontWeight: "600" },
  meaning: { fontWeight: "700", color: colors.textMuted, textAlign: "center" },
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
  optionEmoji: { fontSize: 26 },
  optionText: { fontWeight: "800", fontSize: 16, color: colors.text },
  spellBox: {
    backgroundColor: "#fff",
    borderRadius: radii.md,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: colors.primary,
  },
  spellValue: { fontSize: 22, fontWeight: "800", letterSpacing: 2 },
  keyboard: { flexDirection: "row", flexWrap: "wrap", gap: 6, justifyContent: "center" },
  key: {
    width: 32,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#E8E4F8",
  },
  keyText: { fontWeight: "800", color: colors.text },
  row: { flexDirection: "row", gap: 10, justifyContent: "center" },
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
