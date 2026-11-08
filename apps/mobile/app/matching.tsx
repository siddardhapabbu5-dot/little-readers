import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

type WordQ = {
  index: number;
  word: {
    id: string;
    text: string;
    meaning: string;
    emoji: string;
  };
};

type SessionPayload = {
  sessionId: string;
  category: { id?: string; label: string; emoji: string };
  questions: WordQ[];
};

type ResultsPayload = {
  childName: string;
  category: { label: string; emoji: string; id: string };
  questionsAttempted: number;
  correctAnswers: number;
  points: number;
  stars: number;
  accuracy: number;
  wordsLearned: number;
  newCertificates?: EarnedCertificate[];
};

type Tile =
  | { kind: "word"; id: string; wordId: string; label: string }
  | { kind: "emoji"; id: string; wordId: string; label: string };

export default function MatchingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    categoryId?: string;
    childId: string;
    title?: string;
    mix?: string;
  }>();

  const [session, setSession] = useState<SessionPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<ResultsPayload | null>(null);
  const [selected, setSelected] = useState<Tile | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const startedAt = useRef(Date.now());
  const locked = useRef(new Set<string>());

  const words = useMemo(
    () =>
      (session?.questions ?? []).map((q) => ({
        ...q.word,
        emoji: displayEmoji(q.word.emoji),
      })),
    [session]
  );

  const tiles = useMemo(() => {
    const left: Tile[] = words.map((w) => ({
      kind: "word",
      id: `w-${w.id}`,
      wordId: w.id,
      label: w.text,
    }));
    const right: Tile[] = words.map((w) => ({
      kind: "emoji",
      id: `e-${w.id}`,
      wordId: w.id,
      label: w.emoji,
    }));
    return {
      left: shuffle(left),
      right: shuffle(right),
    };
  }, [words]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        if (!params.childId || (!params.categoryId && !params.mix)) {
          throw new Error("Missing child or category");
        }
        const data = await apiRequest<SessionPayload>("/learning/sessions", {
          method: "POST",
          body: JSON.stringify({
            childId: params.childId,
            ...(params.mix ? { mix: params.mix } : { categoryId: params.categoryId }),
            activityMode: "MATCHING",
            questionCount: 6,
            resume: false,
          }),
        });
        setSession(data);
        startedAt.current = Date.now();
      } catch (err) {
        if (err instanceof ApiError && err.status === 402) {
          router.replace("/subscription");
          return;
        }
        setError(err instanceof ApiError ? err.message : "Could not start Matching");
      } finally {
        setLoading(false);
      }
    })();
  }, [params.categoryId, params.childId, params.mix, router]);

  const complete = useCallback(async () => {
    if (!session) return;
    setSaving(true);
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
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save results");
    } finally {
      setSaving(false);
    }
  }, [session]);

  async function onTile(tile: Tile) {
    if (saving || matched.has(tile.wordId) || results) return;
    setFeedback(null);

    if (!selected) {
      setSelected(tile);
      if (tile.kind === "word") void speakWord(tile.label);
      return;
    }

    if (selected.id === tile.id) {
      setSelected(null);
      return;
    }

    if (selected.kind === tile.kind) {
      setSelected(tile);
      if (tile.kind === "word") void speakWord(tile.label);
      return;
    }

    const ok = selected.wordId === tile.wordId;
    const wordId = tile.wordId;
    const word = words.find((w) => w.id === wordId);

    if (ok) {
      if (locked.current.has(wordId)) {
        setMatched((m) => new Set(m).add(wordId));
        setSelected(null);
        return;
      }
      locked.current.add(wordId);
      try {
        setSaving(true);
        const res = await apiRequest<{ pointsAwarded: number; duplicate?: boolean }>(
          `/learning/sessions/${session!.sessionId}/attempts`,
          {
            method: "POST",
            body: JSON.stringify({
              wordId,
              round: "MATCHING",
              isCorrect: true,
              answerGiven: `${selected.kind}+${tile.kind}`,
              pointsAwarded: 8,
            }),
          }
        );
        if (!res.duplicate) setScore((s) => s + res.pointsAwarded);
        setMatched((m) => new Set(m).add(wordId));
        setFeedback(`Nice! ${word?.text ?? ""} matched.`);
        if (word) void speakWord(word.text);
        const nextCount = matched.size + 1;
        if (nextCount >= words.length) {
          await complete();
        }
      } catch (err) {
        locked.current.delete(wordId);
        setError(err instanceof ApiError ? err.message : "Save failed");
      } finally {
        setSaving(false);
        setSelected(null);
      }
    } else {
      try {
        setSaving(true);
        await apiRequest(`/learning/sessions/${session!.sessionId}/attempts`, {
          method: "POST",
          body: JSON.stringify({
            wordId: selected.wordId,
            round: "MATCHING",
            isCorrect: false,
            answerGiven: tile.wordId,
            pointsAwarded: 0,
          }),
        });
      } catch {
        /* keep UX moving; incorrect already shown */
      } finally {
        setSaving(false);
      }
      setFeedback("Not a match — try again.");
      setSelected(null);
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.kidsLearning}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KidsHeader
          left={<IconButton emoji="←" onPress={() => router.back()} />}
          title={params.title ?? session?.category.label ?? "Matching"}
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
            <Text style={styles.muted}>Starting Matching…</Text>
          </View>
        ) : null}

        {results ? (
          <ScrollView contentContainerStyle={styles.content}>
            <Card color={colors.primary} style={styles.results}>
              <Text style={{ fontSize: 56 }}>🧩</Text>
              <Title>Matching done, {results.childName}!</Title>
              <Text style={styles.muted}>
                {results.correctAnswers}/{results.questionsAttempted} correct ·{" "}
                {results.points} pts · {results.accuracy}%
              </Text>
              <CertificateEarned certificates={results.newCertificates} />
              <SoftButton label="Back to Games" onPress={() => (isPreviewChild(params.childId) ? router.back() : router.replace("/(tabs)/games"))} />
              <SoftButton label="Home" onPress={() => router.replace("/(tabs)/home")} />
            </Card>
          </ScrollView>
        ) : null}

        {!loading && session && !results ? (
          <ScrollView contentContainerStyle={styles.content}>
            <Text style={styles.help}>
              Tap a word, then tap its matching picture. Matched pairs stay checked.
            </Text>
            {feedback ? <Text style={styles.feedback}>{feedback}</Text> : null}
            <View style={styles.board}>
              <View style={styles.col}>
                {tiles.left.map((t) => (
                  <Pressable
                    key={t.id}
                    disabled={matched.has(t.wordId)}
                    onPress={() => void onTile(t)}
                    style={[
                      styles.tile,
                      selected?.id === t.id && styles.tileOn,
                      matched.has(t.wordId) && styles.tileDone,
                    ]}
                  >
                    <Text style={styles.tileWord}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.col}>
                {tiles.right.map((t) => (
                  <Pressable
                    key={t.id}
                    disabled={matched.has(t.wordId)}
                    onPress={() => void onTile(t)}
                    style={[
                      styles.tile,
                      styles.emojiTile,
                      selected?.id === t.id && styles.tileOn,
                      matched.has(t.wordId) && styles.tileDone,
                    ]}
                  >
                    <Text style={styles.tileEmoji}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <Text style={styles.muted}>
              Matched {matched.size}/{words.length}
            </Text>
          </ScrollView>
        ) : null}
      </SafeAreaView>
    </AuthGate>
  );
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  center: { padding: 40, alignItems: "center", gap: 10 },
  muted: { color: colors.textMuted, fontWeight: "600", textAlign: "center" },
  help: { color: colors.text, fontWeight: "700", fontSize: 15, lineHeight: 22 },
  feedback: { color: colors.primaryDark, fontWeight: "800", textAlign: "center" },
  board: { flexDirection: "row", gap: 12 },
  col: { flex: 1, gap: 10 },
  tile: {
    backgroundColor: "#fff",
    borderRadius: radii.md,
    minHeight: 56,
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    borderWidth: 2,
    borderColor: "#E8E4F8",
    ...shadow.soft,
  },
  emojiTile: { minHeight: 64 },
  tileOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  tileDone: { opacity: 0.45, borderColor: colors.mint },
  tileWord: { fontWeight: "800", color: colors.text, fontSize: 15, textAlign: "center" },
  tileEmoji: { fontSize: 28 },
  scorePill: {
    backgroundColor: "#fff",
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  scoreText: { fontWeight: "800", color: colors.primaryDark },
  results: { alignItems: "center", gap: 10, paddingVertical: 24 },
});
