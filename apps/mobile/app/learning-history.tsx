import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, SoftButton, Title } from "../components/ui";
import { IconButton, KidsHeader, SkyBackground } from "../components/kids";
import { AuthGate } from "../components/AuthGate";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { getActiveChild } from "../services/secure";
import { colors, radii, shadow } from "../theme";

type HistoryItem = {
  sessionId: string;
  status: string;
  activityType: string;
  category: { label: string; emoji: string };
  startedAt: string;
  completedAt?: string | null;
  durationSec: number;
  points: number;
  stars: number;
  questionsAttempted: number;
  correctAnswers: number;
  incorrectAnswers: number;
  accuracy: number;
  wordsPracticed: string[];
};

type HistoryPayload = {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  items: HistoryItem[];
};

export default function LearningHistoryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ childId?: string }>();
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [childId, setChildId] = useState<string | null>(null);

  const load = useCallback(async (id: string, nextOffset: number, append: boolean) => {
    const data = await apiRequest<HistoryPayload>(
      `/learning/progress/${id}/history?limit=20&offset=${nextOffset}`
    );
    setItems((prev) => (append ? [...prev, ...data.items] : data.items));
    setHasMore(data.hasMore);
    setOffset(nextOffset + data.items.length);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setLoading(true);
        try {
          const active = await getActiveChild<{ id: string }>();
          const id = String(params.childId || active?.id || "");
          if (!id) {
            setError("No student selected.");
            return;
          }
          setChildId(id);
          await load(id, 0, false);
          setError(null);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not load history");
        } finally {
          setLoading(false);
        }
      })();
    }, [load, params.childId])
  );

  async function loadMore() {
    if (!childId || !hasMore || loadingMore) return;
    setLoadingMore(true);
    try {
      await load(childId, offset, true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load more");
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.kidsLearning}>
      <SkyBackground>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KidsHeader
          left={<IconButton emoji="←" onPress={() => router.back()} />}
          title="Learning history"
        />
        <ErrorText>{error}</ErrorText>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <Title>What you practiced</Title>
            <Text style={styles.sub}>
              Real sessions only — dates shown in India time (IST).
            </Text>
            {items.length === 0 ? (
              <Card>
                <Text style={styles.sub}>No learning history yet. Play from Games or Learn.</Text>
              </Card>
            ) : null}
            {items.map((h) => (
              <View key={h.sessionId} style={[styles.card, shadow.soft]}>
                <Text style={styles.title}>
                  {h.category.emoji} {h.category.label}
                </Text>
                <Text style={styles.meta}>
                  {formatActivity(h.activityType)} · {h.status}
                </Text>
                <Text style={styles.meta}>
                  {formatWhen(h.completedAt ?? h.startedAt)}
                  {h.durationSec ? ` · ${Math.round(h.durationSec / 60)} min` : ""}
                </Text>
                <Text style={styles.meta}>
                  ✅ {h.correctAnswers} · ❌ {h.incorrectAnswers} · {h.accuracy}% · ⭐{" "}
                  {h.stars} · {h.points} pts
                </Text>
                {h.wordsPracticed.length ? (
                  <Text style={styles.words}>
                    Words: {h.wordsPracticed.join(", ")}
                    {h.wordsPracticed.length >= 12 ? "…" : ""}
                  </Text>
                ) : null}
              </View>
            ))}
            {hasMore ? (
              <SoftButton
                label={loadingMore ? "Loading…" : "Load more"}
                onPress={() => void loadMore()}
              />
            ) : null}
          </ScrollView>
        )}
      </SafeAreaView>
      </SkyBackground>
    </AuthGate>
  );
}

function formatActivity(t: string) {
  const map: Record<string, string> = {
    LISTEN_SPELL: "Listen & Spell",
    MATCHING: "Matching",
    QUIZ: "Quiz",
    REVISION: "Revision",
    LISTEN: "Listen",
    SPELL: "Spell",
  };
  return map[t] ?? t;
}

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "transparent" },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  center: { padding: 40, alignItems: "center" },
  sub: { color: colors.textMuted, fontWeight: "600", lineHeight: 20 },
  card: {
    backgroundColor: "#fff",
    borderRadius: radii.lg,
    padding: 14,
    gap: 4,
  },
  title: { fontWeight: "800", fontSize: 16, color: colors.text },
  meta: { color: colors.textMuted, fontWeight: "600", fontSize: 12 },
  words: { color: colors.primaryDark, fontWeight: "700", fontSize: 12, marginTop: 4 },
});
