import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ErrorText } from "../../components/ui";
import {
  BadgeChip,
  IconButton,
  KidsHeader,
  ProgressStats,
  RewardBanner,
  SectionRow,
  WeeklyChallengeCard,
} from "../../components/kids";
import { apiRequest, ApiError } from "../../services/api";
import { getActiveChild } from "../../services/secure";
import { colors } from "../../theme";

const FALLBACK_BADGES = [
  { title: "First Steps", emoji: "👣" },
  { title: "Learning Star", emoji: "⭐" },
  { title: "Vocabulary Champion", emoji: "📚" },
  { title: "Story Lover", emoji: "📖" },
];

export default function RewardsTab() {
  const router = useRouter();
  const [summary, setSummary] = useState<any>(null);
  const [achievements, setAchievements] = useState<any[]>([]);
  const [childName, setChildName] = useState("Champ");
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          const child = await getActiveChild<{ id: string; displayName: string }>();
          if (!child) {
            setError("Select a child from Home or Learn first.");
            return;
          }
          setChildName(child.displayName);
          const data = await apiRequest<any>(`/learning/progress/${child.id}`);
          setSummary(data.summary);
          setAchievements(data.achievements ?? []);
          setError(null);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not load rewards");
        }
      })();
    }, [])
  );

  const words = summary?.wordsLearned ?? 0;
  const stars = summary?.stars ?? 0;
  const points = summary?.points ?? 0;
  const lessons = summary?.categoriesCompleted ?? 0;
  const streak = Math.max(1, Math.min(stars, 14));
  const badgeCount = achievements.length || (words > 0 ? 1 : 0);

  const earnedBadges =
    achievements.length > 0
      ? achievements.map((a: any, i: number) => ({
          title: a.title ?? a.code ?? "Badge",
          emoji: FALLBACK_BADGES[i % FALLBACK_BADGES.length].emoji,
        }))
      : [];

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <KidsHeader
          left={<IconButton emoji="←" onPress={() => router.push("/(tabs)/home")} />}
          right={
            <View style={styles.coins}>
              <Text style={{ fontSize: 16 }}>🪙</Text>
              <Text style={styles.coinText}>{points || stars * 10}</Text>
            </View>
          }
        />

        <RewardBanner
          title="Great Job, You're a Star!"
          body={`Keep learning, ${childName} — earn awesome rewards.`}
          emoji="🏆"
        />

        <ErrorText>{error}</ErrorText>

        <ProgressStats lessons={lessons} streak={streak} badges={badgeCount} />

        <SectionRow
          title="Badges"
          action="See all"
          onAction={() => router.push("/rewards-all")}
        />
        {earnedBadges.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 10 }}
          >
            {earnedBadges.map((b) => (
              <BadgeChip key={b.title} emoji={b.emoji} title={b.title} />
            ))}
          </ScrollView>
        ) : (
          <Text style={styles.emptyBadges}>
            No earned badges yet. Tap See all for stars and progress details.
          </Text>
        )}

        <WeeklyChallengeCard
          title="Complete 10 lessons this week"
          completed={Math.min(words, 10)}
          target={10}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14, paddingBottom: 28 },
  coins: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#fff",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  coinText: { fontWeight: "800", color: colors.text },
  emptyBadges: { color: colors.textMuted, fontWeight: "600", lineHeight: 20 },
});
