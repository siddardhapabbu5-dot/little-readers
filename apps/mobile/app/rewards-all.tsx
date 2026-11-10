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
import { BadgeChip, KidsHeader, IconButton, SkyBackground } from "../components/kids";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { getActiveChild } from "../services/secure";
import { colors, radii } from "../theme";

type AchievementRow = {
  code: string;
  title: string;
  description?: string | null;
  emoji?: string;
  unlocked: boolean;
  earnedAt?: string | null;
};

type ProgressPayload = {
  child?: { displayName: string };
  summary?: {
    wordsCorrect?: number;
    stars?: number;
    points?: number;
    categoriesCompleted?: number;
    accuracy?: number;
  };
  achievements?: AchievementRow[];
};

export default function RewardsAllScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [childName, setChildName] = useState("Champ");
  const [summary, setSummary] = useState<ProgressPayload["summary"] | null>(null);
  const [achievements, setAchievements] = useState<AchievementRow[]>([]);

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
          const data = await apiRequest<ProgressPayload>(
            `/learning/progress/${child.id}`
          );
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

  const unlocked = achievements.filter((a) => a.unlocked);
  const locked = achievements.filter((a) => !a.unlocked);

  return (
    <AuthGate roles={ROLE_SETS.kidsLearning}>
      <SkyBackground>
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <KidsHeader
          left={<IconButton emoji="←" onPress={() => router.back()} />}
          title="Achievements"
        />

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content}>
            <Title>{childName}</Title>
            <ErrorText>{error}</ErrorText>

            <Card style={{ gap: 10 }}>
              <Text style={styles.section}>From real learning</Text>
              <View style={styles.statsRow}>
                <Stat label="Words correct" value={String(summary?.wordsCorrect ?? 0)} />
                <Stat label="Stars" value={String(summary?.stars ?? 0)} />
                <Stat label="Points" value={String(summary?.points ?? 0)} />
                <Stat label="Accuracy" value={`${summary?.accuracy ?? 0}%`} />
              </View>
            </Card>

            <Text style={styles.section}>Unlocked</Text>
            {unlocked.length === 0 ? (
              <Card>
                <Text style={styles.muted}>
                  No achievements unlocked yet. Complete activities to earn them — the
                  server confirms each one.
                </Text>
                <SoftButton label="Open Learn" onPress={() => router.push("/(tabs)/learn")} />
              </Card>
            ) : (
              <View style={styles.grid}>
                {unlocked.map((a) => (
                  <View key={a.code} style={styles.badgeCard}>
                    <BadgeChip emoji={a.emoji ?? "🏅"} title={a.title} />
                    {a.description ? (
                      <Text style={styles.desc}>{a.description}</Text>
                    ) : null}
                    {a.earnedAt ? (
                      <Text style={styles.earned}>
                        Earned{" "}
                        {new Date(a.earnedAt).toLocaleDateString("en-IN", {
                          timeZone: "Asia/Kolkata",
                        })}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}

            <Text style={styles.section}>Locked</Text>
            {locked.length === 0 ? (
              <Text style={styles.muted}>All listed milestones unlocked.</Text>
            ) : (
              locked.map((a) => (
                <View key={a.code} style={styles.lockedRow}>
                  <Text style={styles.lockedTitle}>🔒 {a.title}</Text>
                  {a.description ? (
                    <Text style={styles.desc}>{a.description}</Text>
                  ) : null}
                </View>
              ))
            )}
          </ScrollView>
        )}
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
  safe: { flex: 1, backgroundColor: "transparent" },
  content: { padding: 20, gap: 12, paddingBottom: 36, width: "100%", maxWidth: 720, alignSelf: "center" },
  center: { padding: 40, alignItems: "center" },
  section: { fontWeight: "800", fontSize: 16, color: colors.text },
  muted: { color: colors.textMuted, fontWeight: "600", lineHeight: 20 },
  statsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  stat: {
    width: "47%",
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    padding: 10,
  },
  statValue: { fontWeight: "900", fontSize: 18, color: colors.primaryDark },
  statLabel: { fontWeight: "700", fontSize: 11, color: colors.textMuted },
  grid: { gap: 10 },
  badgeCard: {
    backgroundColor: "#fff",
    borderRadius: radii.lg,
    padding: 12,
    gap: 6,
  },
  desc: { color: colors.textMuted, fontWeight: "600", fontSize: 12 },
  earned: { color: colors.mintDeep, fontWeight: "700", fontSize: 11 },
  lockedRow: {
    backgroundColor: "#fff",
    borderRadius: radii.lg,
    padding: 12,
    gap: 4,
    opacity: 0.85,
  },
  lockedTitle: { fontWeight: "800", color: colors.textMuted },
});
