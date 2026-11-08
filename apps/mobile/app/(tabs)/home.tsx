import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ErrorText, SoftButton } from "../../components/ui";
import {
  ContinueCard,
  DailyGoalCard,
  IconButton,
  KidsHeader,
  RecommendCard,
  SectionRow,
  WelcomeHero,
} from "../../components/kids";
import { apiRequest, ApiError } from "../../services/api";
import { openLearningActivity } from "../../services/learning-nav";
import { startActivity, useActivities } from "../../services/activities";
import { getActiveChild, getUser, saveActiveChild } from "../../services/secure";
import { colors } from "../../theme";

type AuthUser = { id: string; name: string; email: string; role: string };
type ChildRow = {
  id: string;
  displayName: string;
  birthYear: number;
  birthDate?: string | null;
  level: string;
  levelId?: string | null;
  hasLearningSeat?: boolean;
};
type Category = {
  id: string;
  label: string;
  emoji: string;
  wordCount: number;
  unlocked: boolean;
  progress: { wordsLearned: number; stars: number; completed: boolean } | null;
};
type Group = { id: string; code: string; label: string; categories: Category[] };
type ProgressPayload = {
  summary?: {
    wordsLearned?: number;
    wordsCorrect?: number;
    stars?: number;
    points?: number;
    categoriesCompleted?: number;
    daily?: {
      wordsLearnedToday: number;
      target: number;
      date: string;
      timezone: string;
      completed: boolean;
    };
  };
};

function ageFromChild(child: ChildRow): string | null {
  if (child.birthDate && /^\d{2}\/\d{2}\/\d{4}$/.test(child.birthDate)) {
    const [dd, mm, yyyy] = child.birthDate.split("/").map(Number);
    const born = new Date(yyyy, mm - 1, dd);
    const now = new Date();
    let age = now.getFullYear() - born.getFullYear();
    const m = now.getMonth() - born.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age -= 1;
    if (age >= 0 && age <= 18) return `Age ${age}`;
  }
  if (child.birthYear) {
    const age = new Date().getFullYear() - child.birthYear;
    if (age >= 0 && age <= 18) return `Age ~${age}`;
  }
  return null;
}

function levelLabel(code?: string) {
  if (!code) return null;
  return code.replace(/^LEVEL_/i, "Level ");
}

const ACTIVITY_TINTS = [colors.skySoft, colors.yellowSoft, colors.mintSoft, colors.pinkSoft, colors.primarySoft];

export default function HomeTab() {
  const router = useRouter();
  const { activities } = useActivities();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [child, setChild] = useState<ChildRow | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setLoading(true);
        try {
          const u = await getUser<AuthUser>();
          setUser(u);
          if (!u) {
            setLoading(false);
            return;
          }

          let active = await getActiveChild<ChildRow>();
          if (u.role === "PARENT") {
            const kids = await apiRequest<ChildRow[]>("/children");
            const match = active
              ? kids.find((k) => k.id === active!.id) ?? kids[0]
              : kids[0];
            active = match ?? null;
            if (active) await saveActiveChild(active);
          }
          setChild(active);

          if (active?.hasLearningSeat !== false && active) {
            const levelKey = active.level || "LEVEL_1";
            const [p, curriculum] = await Promise.all([
              apiRequest<ProgressPayload>(`/learning/progress/${active.id}`),
              apiRequest<{ groups: Group[] }>(
                `/learning/levels/${encodeURIComponent(levelKey)}/groups?childId=${encodeURIComponent(active.id)}`
              ),
            ]);
            setProgress(p);
            setGroups(curriculum.groups ?? []);
          } else {
            setProgress(null);
            setGroups([]);
          }
          setError(null);
        } catch (err) {
          if (err instanceof ApiError && err.status === 429) {
            setError(null);
          } else {
            setError(err instanceof ApiError ? err.message : "Could not load home");
          }
        } finally {
          setLoading(false);
        }
      })();
    }, [])
  );

  const categories = useMemo(
    () => groups.flatMap((g) => g.categories.map((c) => ({ ...c, group: g.label }))),
    [groups]
  );

  const continueCat =
    categories.find((c) => (c.progress?.wordsLearned ?? 0) > 0 && !c.progress?.completed) ??
    categories.find((c) => c.unlocked) ??
    categories[0];

  const recommended = categories.filter((c) => c.unlocked).slice(0, 4);
  const daily = progress?.summary?.daily;
  const dailyCompleted = daily?.wordsLearnedToday ?? 0;
  const dailyTarget = daily?.target ?? 5;
  const stars = progress?.summary?.stars ?? 0;
  const words =
    progress?.summary?.wordsCorrect ?? progress?.summary?.wordsLearned ?? 0;
  const metaParts = [
    child ? ageFromChild(child) : null,
    child ? levelLabel(child.level) : null,
    child ? `⭐ ${stars}` : null,
    child && words > 0 ? `${words} words` : null,
  ].filter(Boolean);

  function openCategory(
    cat?: Category,
    activity: "LISTEN_SPELL" | "MATCHING" | "QUIZ" | "REVISION" = "LISTEN_SPELL",
    startRound?: "LISTEN" | "SPELL"
  ) {
    if (!cat || !child) {
      router.push("/(tabs)/learn");
      return;
    }
    openLearningActivity(router, {
      activity,
      categoryId: cat.id,
      childId: child.id,
      title: cat.label,
      startRound,
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <KidsHeader
          left={<IconButton emoji="☰" onPress={() => router.push("/(tabs)/profile")} />}
          right={<IconButton emoji="🎓" bg={colors.primarySoft} onPress={() => router.push("/(tabs)/learn")} />}
        />

        <WelcomeHero
          name={child?.displayName ?? "Champ"}
          message={
            metaParts.length
              ? metaParts.join(" · ")
              : "Ready to learn something awesome today?"
          }
          character="🧒"
        />

        <ErrorText>{error}</ErrorText>

        {loading ? (
          <View style={styles.centerBox}>
            <ActivityIndicator color={colors.primary} size="large" />
            <Text style={styles.hint}>Loading your home…</Text>
          </View>
        ) : !child ? (
          <View style={styles.centerBox}>
            <Text style={styles.emptyTitle}>Add a student to start</Text>
            <Text style={styles.hint}>
              Create a student profile on the Parent screen, then come back here.
            </Text>
            <SoftButton label="Open Parent dashboard" onPress={() => router.push("/parent")} />
          </View>
        ) : child.hasLearningSeat === false ? (
          <View style={styles.centerBox}>
            <Text style={styles.emptyTitle}>Activate a learning seat</Text>
            <Text style={styles.hint}>
              {child.displayName} needs a seat before Kids Zone unlocks.
            </Text>
            <SoftButton label="Subscription / seats" onPress={() => router.push("/subscription")} />
            <SoftButton label="Parent dashboard" onPress={() => router.push("/parent")} />
          </View>
        ) : (
          <>
            <DailyGoalCard
              completed={dailyCompleted}
              target={dailyTarget}
              message={
                dailyCompleted >= dailyTarget
                  ? "Amazing! Daily word goal complete."
                  : "Correct words today from any activity or game."
              }
            />

            <SectionRow
              title="Continue Learning"
              action="See all"
              onAction={() => router.push("/(tabs)/learn")}
            />
            {continueCat ? (
              <ContinueCard
                emoji={continueCat.emoji}
                title={continueCat.label}
                subtitle={`${continueCat.group ?? "Level 1"} · ${continueCat.progress?.wordsLearned ?? 0}/${continueCat.wordCount} words`}
                progressPct={Math.round(
                  ((continueCat.progress?.wordsLearned ?? 0) /
                    Math.max(continueCat.wordCount, 1)) *
                    100
                )}
                onContinue={() => openCategory(continueCat)}
              />
            ) : (
              <Text style={styles.hint}>
                Vocabulary is loading or not published yet. Check Learn for updates.
              </Text>
            )}

            <SectionRow
              title="Activities"
              action="Games"
              onAction={() => router.push("/(tabs)/games")}
            />
            {continueCat ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12 }}
              >
                {activities
                  .filter((a) => a.enabled)
                  .map((a, i) => (
                    <RecommendCard
                      key={a.code}
                      emoji={a.emoji}
                      title={continueCat.label}
                      tag={a.title}
                      tint={ACTIVITY_TINTS[i % ACTIVITY_TINTS.length]}
                      onPress={() =>
                        child
                          ? startActivity(router, activities, a.code, {
                              categoryId: continueCat.id,
                              childId: child.id,
                              title: continueCat.label,
                            })
                          : router.push("/(tabs)/learn")
                      }
                    />
                  ))}
              </ScrollView>
            ) : (
              <Text style={styles.hint}>Activities unlock when a category is available.</Text>
            )}

            <SectionRow title="Recommended for You" />
            {recommended.length ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 12 }}
              >
                {recommended.map((cat, i) => {
                  const startRound: "LISTEN" | "SPELL" =
                    i % 2 === 0 ? "LISTEN" : "SPELL";
                  return (
                    <RecommendCard
                      key={`${cat.id}-${startRound}`}
                      emoji={cat.emoji}
                      title={cat.label}
                      tag={startRound === "LISTEN" ? "Listen" : "Spell"}
                      tint={startRound === "LISTEN" ? colors.skySoft : colors.yellowSoft}
                      onPress={() =>
                        openCategory(cat, "LISTEN_SPELL", startRound)
                      }
                    />
                  );
                })}
              </ScrollView>
            ) : (
              <Text style={styles.hint}>No unlocked categories yet.</Text>
            )}
          </>
        )}

        <View style={{ height: 8 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 16, paddingBottom: 28 },
  centerBox: { gap: 10, paddingVertical: 12 },
  emptyTitle: { fontWeight: "800", fontSize: 18, color: colors.text },
  hint: { color: colors.textMuted, fontWeight: "600", lineHeight: 20 },
});
