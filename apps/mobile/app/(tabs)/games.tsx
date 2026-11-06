import { useCallback, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { SoftButton, ErrorText } from "../../components/ui";
import { LearningBanner, SectionRow } from "../../components/kids";
import { apiRequest, ApiError } from "../../services/api";
import { getActiveChild, saveActiveChild } from "../../services/secure";
import { openLearningActivity } from "../../services/learning-nav";
import { colors, radii, shadow } from "../../theme";

type ChildRow = {
  id: string;
  displayName: string;
  level?: string;
  hasLearningSeat?: boolean;
};
type Category = {
  id: string;
  label: string;
  emoji: string;
  unlocked: boolean;
  wordCount: number;
};
type Group = { categories: Category[] };

export default function GamesTab() {
  const router = useRouter();
  const [child, setChild] = useState<ChildRow | null>(null);
  const [category, setCategory] = useState<Category | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setLoading(true);
        try {
          let active = await getActiveChild<ChildRow>();
          const kids = await apiRequest<ChildRow[]>("/children");
          active = active
            ? kids.find((k) => k.id === active!.id) ?? kids[0]
            : kids[0] ?? null;
          if (active) await saveActiveChild(active);
          setChild(active);

          if (active && active.hasLearningSeat !== false) {
            const levelKey = active.level || "LEVEL_1";
            const curriculum = await apiRequest<{ groups: Group[] }>(
              `/learning/levels/${encodeURIComponent(levelKey)}/groups?childId=${encodeURIComponent(active.id)}`
            );
            const cats = (curriculum.groups ?? []).flatMap((g) => g.categories);
            const pick =
              cats.find((c) => c.unlocked && c.wordCount > 0) ??
              cats.find((c) => c.wordCount > 0) ??
              null;
            setCategory(pick);
          } else {
            setCategory(null);
          }
          setError(null);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not load games");
        } finally {
          setLoading(false);
        }
      })();
    }, [])
  );

  function start(activity: "LISTEN_SPELL" | "MATCHING" | "QUIZ" | "REVISION", startRound?: "LISTEN" | "SPELL") {
    if (!child || !category) {
      router.push("/(tabs)/learn");
      return;
    }
    openLearningActivity(router, {
      activity,
      categoryId: category.id,
      childId: child.id,
      title: category.label,
      startRound,
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionRow title="Games" />
        <Text style={styles.sub}>
          All five learning activities use real vocabulary and save real progress.
        </Text>
        <ErrorText>{error}</ErrorText>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : !child ? (
          <Text style={styles.sub}>Add a student on Parent, then return here.</Text>
        ) : child.hasLearningSeat === false ? (
          <SoftButton label="Activate a learning seat" onPress={() => router.push("/subscription")} />
        ) : !category ? (
          <Text style={styles.sub}>
            No published vocabulary yet. Open Learn when categories are ready.
          </Text>
        ) : (
          <>
            <LearningBanner
              title={`${category.emoji} ${category.label}`}
              body="Activities open this category. Pick another category from Learn anytime."
              emoji="🎮"
              color={colors.skySoft}
            />

            <View style={[styles.card, shadow.card]}>
              <Text style={styles.cardTitle}>🎧 Listen</Text>
              <Text style={styles.cardBody}>Hear the word and choose the picture.</Text>
              <SoftButton label="Start Listen" onPress={() => start("LISTEN_SPELL", "LISTEN")} />
            </View>

            <View style={[styles.card, shadow.card]}>
              <Text style={styles.cardTitle}>✍️ Spell</Text>
              <Text style={styles.cardBody}>Build the word letter by letter.</Text>
              <SoftButton label="Start Spell" onPress={() => start("LISTEN_SPELL", "SPELL")} />
            </View>

            <View style={[styles.card, shadow.card]}>
              <Text style={styles.cardTitle}>🧩 Matching</Text>
              <Text style={styles.cardBody}>Match each word with its picture.</Text>
              <SoftButton label="Start Matching" onPress={() => start("MATCHING")} />
            </View>

            <View style={[styles.card, shadow.card]}>
              <Text style={styles.cardTitle}>📝 Quiz</Text>
              <Text style={styles.cardBody}>Read the meaning and pick the word.</Text>
              <SoftButton label="Start Quiz" onPress={() => start("QUIZ")} />
            </View>

            <View style={[styles.card, shadow.card]}>
              <Text style={styles.cardTitle}>🔁 Revision</Text>
              <Text style={styles.cardBody}>
                Review words that need more practice — no fake history.
              </Text>
              <SoftButton label="Start Revision" onPress={() => start("REVISION")} />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14, paddingBottom: 36 },
  sub: { color: colors.textMuted, fontWeight: "600", lineHeight: 20 },
  card: {
    backgroundColor: "#fff",
    borderRadius: radii.xl,
    padding: 16,
    gap: 8,
  },
  cardTitle: { fontWeight: "800", fontSize: 18, color: colors.text },
  cardBody: { color: colors.textMuted, fontWeight: "600", marginBottom: 4 },
});
