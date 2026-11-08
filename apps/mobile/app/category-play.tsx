import { useCallback, useState } from "react";
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ProgressBar } from "../components/ui";
import { IconButton, KidsButton, KidsHeader, SectionRow, SkyBackground } from "../components/kids";
import { ACTIVITY_ART, art, categoryTheme } from "../components/illustrations";
import { AuthGate } from "../components/AuthGate";
import { apiRequest } from "../services/api";
import { startActivity, useActivities, type ActivityState } from "../services/activities";
import { ROLE_SETS } from "../services/auth-errors";
import { displayEmoji } from "../services/emoji";
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

/** Category → pick one of the admin-enabled activities, all using this category's words. */
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
  const title = params.title ?? "Category";
  const theme = categoryTheme(title);
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
  const games = activities.filter((a) => a.kind === "game" && a.enabled);
  const total = progress?.wordCount ?? 0;
  const left = Math.max(total - (progress?.wordsLearned ?? 0), 0);
  const start = (code: ActivityState["code"]) =>
    startActivity(router, activities, code, { categoryId, childId, title });

  return (
    <AuthGate roles={ROLE_SETS.kidsLearning}>
      <SkyBackground>
        <SafeAreaView style={styles.safe} edges={["top"]}>
          <View style={styles.headerPad}>
            <KidsHeader left={<IconButton emoji="←" onPress={() => router.back()} />} title={title} />
          </View>
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={[styles.hero, { backgroundColor: theme.tint }, shadow.card]}>
              {theme.image ? (
                <Image source={theme.image} style={styles.heroArt} resizeMode="contain" />
              ) : (
                <Text style={{ fontSize: 80 }}>{displayEmoji(params.emoji ?? "📚")}</Text>
              )}
              <View style={styles.heroCard}>
                <Text style={styles.heroTitle}>{title}</Text>
                {progress ? (
                  <>
                    <ProgressBar value={progress.wordsLearned} max={Math.max(total, 1)} color={colors.green} />
                    <View style={styles.heroRow}>
                      <Text style={styles.heroMeta}>
                        {progress.wordsLearned}/{total} words · {progress.progressPct}%
                      </Text>
                      <Text style={styles.heroStars}>⭐ {progress.stars}</Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.heroMeta}>Listen first, then spell. Have fun!</Text>
                )}
              </View>
            </View>

            {progress?.certificate ? (
              <Pressable
                onPress={() => router.push({ pathname: "/certificate", params: { id: progress.certificate!.id } })}
                style={[styles.certCard, shadow.soft]}
              >
                <Image source={art.certificate} style={styles.certArt} resizeMode="contain" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>You earned a certificate!</Text>
                  <Text style={styles.cardBody}>Tap to view, download or share it.</Text>
                </View>
              </Pressable>
            ) : progress ? (
              <View style={[styles.certCard, shadow.soft]}>
                <Image source={art.certificate} style={[styles.certArt, { opacity: 0.55 }]} resizeMode="contain" />
                <Text style={[styles.cardBody, { flex: 1 }]}>
                  Learn {left === total ? "all" : `${left} more`} word{left === 1 ? "" : "s"} to earn your
                  certificate!
                </Text>
              </View>
            ) : null}

            {progress?.resume ? (
              <View style={[styles.resumeCard, shadow.soft]}>
                <Text style={styles.cardTitle}>⏯️ You stopped in the middle</Text>
                <Text style={styles.cardBody}>
                  {progress.resume.answered} of {progress.resume.total} words done in this round. Keep going!
                </Text>
                <KidsButton label="Continue" tone="orange" onPress={() => start("LISTEN")} />
              </View>
            ) : null}

            {learn.length ? <SectionRow title="Learn" /> : null}
            {learn.map((a, i) => (
              <ActivityCard
                key={a.code}
                step={i + 1}
                activity={a}
                done={progress ? `${progress.byActivity[a.code] ?? 0}/${total} words done` : undefined}
                onPress={() => start(a.code)}
              />
            ))}

            {games.length ? <SectionRow title="Play" /> : null}
            {games.map((a) => (
              <ActivityCard key={a.code} activity={a} onPress={() => start(a.code)} />
            ))}

            {learn.length === 0 && games.length === 0 ? (
              <Text style={styles.cardBody}>Activities are switched off right now.</Text>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </SkyBackground>
    </AuthGate>
  );
}

function ActivityCard({
  activity,
  step,
  done,
  onPress,
}: {
  activity: ActivityState;
  step?: number;
  done?: string;
  onPress: () => void;
}) {
  const look = ACTIVITY_ART[activity.code];
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Start ${activity.title}`}
      style={({ pressed }) => [
        styles.actCard,
        shadow.card,
        { opacity: pressed ? 0.9 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      <View style={[styles.actArtBox, { backgroundColor: look.tint }]}>
        <Image source={look.image} style={styles.actArt} resizeMode="contain" />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={styles.actTitle}>
          {step ? `${step}. ` : ""}
          {activity.title}
        </Text>
        <Text style={styles.cardBody} numberOfLines={2}>
          {activity.description}
        </Text>
        {done ? <Text style={[styles.actDone, { color: look.accent }]}>{done}</Text> : null}
      </View>
      <View style={[styles.go, { backgroundColor: look.accent }]}>
        <Text style={styles.goText}>▶</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerPad: { paddingHorizontal: 18, width: "100%", maxWidth: 720, alignSelf: "center" },
  content: { padding: 18, paddingTop: 6, gap: 14, paddingBottom: 36, width: "100%", maxWidth: 720, alignSelf: "center" },
  hero: { borderRadius: radii.xl, padding: 16, alignItems: "center", gap: 10 },
  heroArt: { width: "70%", maxWidth: 260, height: 160 },
  heroCard: { width: "100%", backgroundColor: "#fff", borderRadius: radii.lg, padding: 14, gap: 8 },
  heroTitle: { fontSize: 24, fontWeight: "900", color: colors.text },
  heroRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  heroMeta: { color: colors.textMuted, fontWeight: "800", fontSize: 14 },
  heroStars: { color: colors.text, fontWeight: "900", fontSize: 15 },
  certCard: {
    backgroundColor: colors.cream,
    borderRadius: radii.lg,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  certArt: { width: 56, height: 56 },
  resumeCard: { backgroundColor: colors.yellowSoft, borderRadius: radii.lg, padding: 16, gap: 10 },
  cardTitle: { fontWeight: "900", fontSize: 17, color: colors.text },
  cardBody: { color: colors.textMuted, fontWeight: "700", fontSize: 14, lineHeight: 19 },
  actCard: {
    backgroundColor: "#fff",
    borderRadius: radii.xl,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  actArtBox: { width: 84, height: 84, borderRadius: 24, alignItems: "center", justifyContent: "center" },
  actArt: { width: 70, height: 70 },
  actTitle: { fontWeight: "900", fontSize: 19, color: colors.text },
  actDone: { fontWeight: "900", fontSize: 13 },
  go: { width: 50, height: 50, borderRadius: 25, alignItems: "center", justifyContent: "center" },
  goText: { color: "#fff", fontWeight: "900", fontSize: 18 },
});
