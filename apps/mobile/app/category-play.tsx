import { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { SoftButton } from "../components/ui";
import { IconButton, KidsHeader, LearningBanner } from "../components/kids";
import { AuthGate } from "../components/AuthGate";
import { apiRequest } from "../services/api";
import { startActivity, useActivities } from "../services/activities";
import { ROLE_SETS } from "../services/auth-errors";
import { colors, radii, shadow } from "../theme";

type CategoryProgress = {
  wordCount: number;
  wordsLearned: number;
  progressPct: number;
  byActivity: Record<string, number>;
  stars: number;
  resume: { sessionId: string; answered: number; total: number } | null;
  certificate: { id: string; certificateNo: string | null } | null;
};

/** Category → learn with the admin-enabled Learn activities; games live in the Games tab. */
export default function CategoryPlayScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    categoryId: string;
    childId: string;
    title?: string;
    emoji?: string;
  }>();
  const categoryId = String(params.categoryId);
  const childId = String(params.childId);
  const { activities } = useActivities();
  const [progress, setProgress] = useState<CategoryProgress | null>(null);

  useFocusEffect(
    useCallback(() => {
      void apiRequest<CategoryProgress>(
        `/learning/progress/${encodeURIComponent(childId)}/categories/${encodeURIComponent(categoryId)}`
      )
        .then(setProgress)
        .catch(() => setProgress(null));
    }, [childId, categoryId])
  );

  const learn = activities.filter((a) => a.kind === "learn" && a.enabled);
  const anyGame = activities.some((a) => a.kind === "game" && a.enabled);
  const total = progress?.wordCount ?? 0;
  const left = Math.max(total - (progress?.wordsLearned ?? 0), 0);

  return (
    <AuthGate roles={ROLE_SETS.kidsLearning}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <KidsHeader
          left={<IconButton emoji="←" onPress={() => router.back()} />}
          title={params.title ?? "Choose activity"}
        />
        <ScrollView contentContainerStyle={styles.content}>
          <LearningBanner
            title={`${params.emoji ?? "📚"} ${params.title ?? "Category"}`}
            body="Learn the words step by step: listen first, then spell."
            emoji="📚"
            color={colors.primarySoft}
          />

          {progress ? (
            <View style={[styles.card, shadow.card]}>
              <Text style={styles.title}>
                {progress.wordsLearned}/{total} words learned · ⭐ {progress.stars}
              </Text>
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${progress.progressPct}%` }]} />
              </View>
              {progress.certificate ? (
                <SoftButton
                  label="🎓 View my certificate"
                  onPress={() =>
                    router.push({ pathname: "/certificate", params: { id: progress.certificate!.id } })
                  }
                />
              ) : (
                <Text style={styles.body}>
                  🎓 Learn {left === total ? "all" : `${left} more`} word{left === 1 ? "" : "s"} to earn your
                  certificate!
                </Text>
              )}
            </View>
          ) : null}

          {progress?.resume ? (
            <View style={[styles.card, styles.resumeCard]}>
              <Text style={styles.title}>⏯️ You stopped in the middle</Text>
              <Text style={styles.body}>
                {progress.resume.answered} of {progress.resume.total} words done in this round. Keep going!
              </Text>
              <SoftButton
                label="Continue"
                onPress={() => startActivity(router, activities, "LISTEN", { categoryId, childId, title: params.title })}
              />
            </View>
          ) : null}

          {learn.map((a, i) => (
            <View key={a.code} style={[styles.card, shadow.card]}>
              <Text style={styles.title}>
                {i + 1}. {a.emoji} {a.title}
              </Text>
              <Text style={styles.body}>{a.description}</Text>
              {progress ? (
                <Text style={styles.meta}>
                  {progress.byActivity[a.code] ?? 0}/{total} words done
                </Text>
              ) : null}
              <SoftButton
                label={`Start ${a.title}`}
                onPress={() => startActivity(router, activities, a.code, { categoryId, childId, title: params.title })}
              />
            </View>
          ))}
          {learn.length === 0 ? (
            <Text style={styles.body}>Learning activities are switched off right now.</Text>
          ) : null}

          {anyGame ? (
            <SoftButton
              label="🎮 Play games with these words"
              onPress={() => router.push({ pathname: "/(tabs)/games", params: { categoryId } })}
            />
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 36 },
  card: {
    backgroundColor: "#fff",
    borderRadius: radii.xl,
    padding: 14,
    gap: 8,
  },
  resumeCard: { backgroundColor: colors.yellowSoft },
  title: { fontWeight: "800", fontSize: 16, color: colors.text },
  body: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
  meta: { color: colors.primaryDark, fontWeight: "800", fontSize: 12 },
  barTrack: { height: 10, borderRadius: 5, backgroundColor: colors.bgSoft, overflow: "hidden" },
  barFill: { height: 10, borderRadius: 5, backgroundColor: colors.mint },
});
