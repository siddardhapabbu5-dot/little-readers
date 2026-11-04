import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, SoftButton, Title } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { BadgeChip, KidsHeader, IconButton } from "../components/kids";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { getActiveChild } from "../services/secure";
import { colors, radii } from "../theme";

type Achievement = {
  id: string;
  code: string;
  title: string;
  description?: string | null;
  earnedAt: string;
};

type ProgressPayload = {
  summary?: {
    wordsLearned?: number;
    stars?: number;
    points?: number;
    categoriesCompleted?: number;
  };
  achievements?: Achievement[];
};

const BADGE_EMOJIS = ["👣", "⭐", "📚", "📖", "🏆", "🎯", "🌟", "🎖️"];

function emojiFor(code: string, index: number) {
  let hash = 0;
  for (let i = 0; i < code.length; i++) hash = (hash + code.charCodeAt(i) * (i + 1)) % 997;
  return BADGE_EMOJIS[(hash + index) % BADGE_EMOJIS.length];
}

export default function RewardsAllScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [childName, setChildName] = useState("Champ");
  const [summary, setSummary] = useState<ProgressPayload["summary"] | null>(null);
  const [achievements, setAchievements] = useState<Achievement[]>([]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setLoading(true);
        try {
          const child = await getActiveChild<{ id: string; displayName: string }>();
          if (!child) {
            setError("Select a child from Home or Learn first.");
            setSummary(null);
            setAchievements([]);
            return;
          }
          setChildName(child.displayName);
          const data = await apiRequest<ProgressPayload>(`/learning/progress/${child.id}`);
          setSummary(data.summary ?? null);
          setAchievements(data.achievements ?? []);
          setError(null);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not load rewards");
        } finally {
          setLoading(false);
        }
      })();
    }, [])
  );

  const stars = summary?.stars ?? 0;
  const points = summary?.points ?? 0;
  const words = summary?.wordsLearned ?? 0;
  const lessons = summary?.categoriesCompleted ?? 0;

  return (
    <AuthGate roles={ROLE_SETS.kidsLearning}>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KidsHeader
          left={<IconButton emoji="←" onPress={() => router.back()} />}
          title="All rewards"
        />

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.muted}>Loading rewards…</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <Title>{childName}</Title>
            <ErrorText>{error}</ErrorText>

            <Card style={{ gap: 10 }}>
              <Text style={styles.section}>Progress</Text>
              <View style={styles.statsRow}>
                <Stat label="Stars" value={String(stars)} emoji="⭐" />
                <Stat label="Points" value={String(points)} emoji="🪙" />
                <Stat label="Words" value={String(words)} emoji="📚" />
                <Stat label="Lessons" value={String(lessons)} emoji="✅" />
              </View>
            </Card>

            <Text style={styles.section}>Badges & achievements</Text>
            {achievements.length === 0 ? (
              <Card>
                <Text style={styles.emptyTitle}>No badges yet</Text>
                <Text style={styles.muted}>
                  Keep playing Listen & Spell — earned badges from the server will show up here.
                  Nothing is invented on this screen.
                </Text>
                <SoftButton
                  label="Open Learn"
                  onPress={() => router.push("/(tabs)/learn")}
                />
              </Card>
            ) : (
              <View style={styles.badgeGrid}>
                {achievements.map((a, i) => (
                  <View key={a.id} style={styles.badgeCard}>
                    <BadgeChip
                      emoji={emojiFor(a.code, i)}
                      title={a.title || a.code}
                    />
                    {a.description ? (
                      <Text style={styles.desc}>{a.description}</Text>
                    ) : null}
                    <Text style={styles.earned}>
                      Earned {new Date(a.earnedAt).toLocaleDateString()}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </AuthGate>
  );
}

function Stat({
  label,
  value,
  emoji,
}: {
  label: string;
  value: string;
  emoji: string;
}) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statEmoji}>{emoji}</Text>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg, paddingHorizontal: 16 },
  content: { gap: 14, paddingBottom: 28 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  section: { fontWeight: "800", fontSize: 16, color: colors.text },
  muted: { color: colors.textMuted, lineHeight: 20 },
  emptyTitle: { fontWeight: "800", fontSize: 16, color: colors.text, marginBottom: 6 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  stat: {
    width: "47%",
    backgroundColor: colors.bg,
    borderRadius: radii.lg,
    padding: 12,
    alignItems: "center",
    gap: 2,
  },
  statEmoji: { fontSize: 18 },
  statValue: { fontWeight: "800", fontSize: 20, color: colors.text },
  statLabel: { color: colors.textMuted, fontWeight: "600", fontSize: 12 },
  badgeGrid: { gap: 12 },
  badgeCard: {
    backgroundColor: "#fff",
    borderRadius: radii.xl,
    padding: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  desc: { color: colors.textMuted, lineHeight: 18 },
  earned: { color: colors.primary, fontWeight: "700", fontSize: 12 },
});
