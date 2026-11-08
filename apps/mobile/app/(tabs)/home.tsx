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
  CategoryTile,
  ContinueCard,
  DailyGoalCard,
  FeatureTile,
  IconButton,
  KidsButton,
  KidsHeader,
  RecommendCard,
  SectionRow,
  SkyBackground,
  StatPill,
  WelcomeHero,
} from "../../components/kids";
import { ACTIVITY_ART, art, categoryTheme } from "../../components/illustrations";
import { apiRequest, ApiError } from "../../services/api";
import { openLearningActivity } from "../../services/learning-nav";
import { isOn, startActivity, useActivities } from "../../services/activities";
import type { ChallengeOverview } from "../../services/challenges";
import { displayEmoji } from "../../services/emoji";
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
type DailyStatus = { completedToday: boolean; totalCompleted: number };

function levelLabel(code?: string) {
  if (!code) return null;
  return code.replace(/^LEVEL_/i, "Level ");
}

export default function HomeTab() {
  const router = useRouter();
  const { activities } = useActivities();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [child, setChild] = useState<ChildRow | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [daily, setDaily] = useState<DailyStatus | null>(null);
  const [week, setWeek] = useState<ChallengeOverview | null>(null);
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
            const q = encodeURIComponent(active.id);
            const [p, curriculum, d, w] = await Promise.all([
              apiRequest<ProgressPayload>(`/learning/progress/${active.id}`),
              apiRequest<{ groups: Group[] }>(
                `/learning/levels/${encodeURIComponent(levelKey)}/groups?childId=${q}`
              ),
              apiRequest<DailyStatus>(`/learning/progress/${q}/daily-challenge`).catch(() => null),
              apiRequest<ChallengeOverview>(`/challenges/overview?childId=${q}`).catch(() => null),
            ]);
            setProgress(p);
            setGroups(curriculum.groups ?? []);
            setDaily(d);
            setWeek(w);
          } else {
            setProgress(null);
            setGroups([]);
            setDaily(null);
            setWeek(null);
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
  const withWords = categories.filter((c) => c.wordCount > 0);

  const continueCat =
    withWords.find((c) => (c.progress?.wordsLearned ?? 0) > 0 && !c.progress?.completed) ??
    withWords.find((c) => c.unlocked) ??
    withWords[0];

  const learnedAny = categories.some((c) => (c.progress?.wordsLearned ?? 0) > 0);
  const completedAny = categories.some((c) => c.progress?.completed);
  const summary = progress?.summary;
  const dailyCompleted = summary?.daily?.wordsLearnedToday ?? 0;
  const dailyTarget = summary?.daily?.target ?? 5;
  const stars = summary?.stars ?? 0;
  const points = summary?.points ?? 0;
  const words = summary?.wordsCorrect ?? summary?.wordsLearned ?? 0;
  const level = child ? levelLabel(child.level) ?? "Level 1" : null;
  const weekGoalsDone = week ? week.goals.filter((g) => g.done).length : 0;

  function openCategory(cat?: Category) {
    if (!cat || !child) {
      router.push("/(tabs)/learn");
      return;
    }
    router.push({
      pathname: "/category-play",
      params: { categoryId: cat.id, childId: child.id, title: cat.label, emoji: cat.emoji },
    });
  }

  function continueLearning() {
    if (!continueCat || !child) {
      router.push("/(tabs)/learn");
      return;
    }
    openLearningActivity(router, {
      activity: "LISTEN_SPELL",
      categoryId: continueCat.id,
      childId: child.id,
      title: continueCat.label,
    });
  }

  function openDaily() {
    if (!child) return;
    const opts = { categoryId: "", childId: child.id, title: "Daily Challenge", mix: "DAILY_CHALLENGE" as const };
    if (isOn(activities, "QUIZ_TIME")) openLearningActivity(router, { activity: "QUIZ", ...opts });
    else startActivity(router, activities, "SURPRISE", opts);
  }

  function openRevision() {
    if (!child) return;
    openLearningActivity(router, {
      activity: "REVISION",
      categoryId: "",
      childId: child.id,
      title: "Revision World",
      mix: "REVISION_WORLD",
    });
  }

  const ready = !loading && child && child.hasLearningSeat !== false;
  const continuePct = continueCat
    ? Math.round(((continueCat.progress?.wordsLearned ?? 0) / Math.max(continueCat.wordCount, 1)) * 100)
    : 0;

  return (
    <SkyBackground>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <KidsHeader
            left={<IconButton emoji="☰" label="Profile" onPress={() => router.push("/(tabs)/profile")} />}
            right={
              <IconButton
                emoji="🏆"
                label="Challenge World"
                bg={colors.yellowSoft}
                onPress={() => router.push("/challenge-world")}
              />
            }
          />

          <WelcomeHero
            name={child?.displayName ?? user?.name?.split(" ")[0] ?? "Champ"}
            message={
              child
                ? `${level} · Let's learn something new!`
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
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Add a student to start</Text>
              <Text style={styles.hint}>
                Create a student profile on the Parent screen, then come back here.
              </Text>
              <SoftButton label="Open Parent dashboard" onPress={() => router.push("/parent")} />
            </View>
          ) : child.hasLearningSeat === false ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Activate a learning seat</Text>
              <Text style={styles.hint}>
                {child.displayName} needs a seat before Kids Zone unlocks.
              </Text>
              <SoftButton label="Subscription / seats" onPress={() => router.push("/subscription")} />
              <SoftButton label="Parent dashboard" onPress={() => router.push("/parent")} />
            </View>
          ) : null}

          {ready ? (
            <>
              <View style={styles.statsRow}>
                <StatPill emoji="⭐" value={stars} label="Stars" tint="#FFFBEA" />
                <StatPill emoji="💎" value={points} label="Points" tint="#F1EDFF" />
                <StatPill emoji="📖" value={words} label="Words" tint="#EAF8FF" />
              </View>

              <DailyGoalCard
                completed={dailyCompleted}
                target={dailyTarget}
                message={
                  dailyCompleted >= dailyTarget
                    ? "Amazing! Daily word goal complete."
                    : "Correct words today from any activity or game."
                }
              />

              {continueCat ? (
                <>
                  <SectionRow
                    title="Continue Learning"
                    action="All topics"
                    onAction={() => router.push("/(tabs)/learn")}
                  />
                  <ContinueCard
                    emoji={displayEmoji(continueCat.emoji)}
                    image={categoryTheme(continueCat.label).image}
                    tint={categoryTheme(continueCat.label).tint}
                    title={continueCat.label}
                    subtitle={`${continueCat.progress?.wordsLearned ?? 0}/${continueCat.wordCount} words learned`}
                    progressPct={continuePct}
                    onContinue={continueLearning}
                  />
                  <KidsButton label="▶  Continue Learning" onPress={continueLearning} />
                </>
              ) : (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyTitle}>Words are on the way</Text>
                  <Text style={styles.hint}>
                    Vocabulary appears here after Admin publishes it. Nothing is invented.
                  </Text>
                </View>
              )}

              <SectionRow title="Challenges & Rewards" />
              <View style={styles.featureGrid}>
                <FeatureTile
                  wide
                  title="Daily Challenge"
                  subtitle={
                    daily?.completedToday
                      ? "Done for today ✅ Play again for fun!"
                      : learnedAny
                        ? "A fresh mix of words you know. Earn bonus points!"
                        : "Learn a few words first to unlock it."
                  }
                  image={art.starGoal}
                  tint="#FFF3C4"
                  disabled={!learnedAny}
                  onPress={openDaily}
                />
                <FeatureTile
                  wide
                  title="Weekly Challenge"
                  subtitle={
                    week
                      ? `${week.weekPoints} points this week · ${weekGoalsDone}/${week.goals.length} goals done`
                      : "Weekly goals, badges and leaderboards."
                  }
                  image={art.trophy}
                  tint="#EDE7FF"
                  onPress={() => router.push("/challenge-world")}
                />
                <FeatureTile
                  title="My Rewards"
                  subtitle={`⭐ ${stars} stars`}
                  emoji="🎖️"
                  tint={colors.pinkSoft}
                  onPress={() => router.push("/(tabs)/rewards")}
                />
                <FeatureTile
                  title="Certificates"
                  subtitle="View & share"
                  image={art.certificate}
                  tint={colors.cream}
                  onPress={() => router.push("/(tabs)/rewards")}
                />
                <FeatureTile
                  title="Leaderboard"
                  subtitle={week?.globalRank ? `Rank #${week.globalRank.rank}` : "Weekly ranks"}
                  emoji="🥇"
                  tint={colors.skySoft}
                  onPress={() => router.push({ pathname: "/challenge-world", params: { tab: "global" } })}
                />
                <FeatureTile
                  wide
                  title="Revision World"
                  subtitle={
                    completedAny || learnedAny
                      ? "Practise the words you already learned."
                      : "Opens after you learn your first words."
                  }
                  image={art.revision}
                  tint={colors.greenSoft}
                  disabled={!completedAny && !learnedAny}
                  onPress={openRevision}
                />
              </View>

              {continueCat ? (
                <>
                  <SectionRow
                    title="Activities"
                    action="Games"
                    onAction={() => router.push("/(tabs)/games")}
                  />
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={{ gap: 12, paddingVertical: 4 }}
                  >
                    {activities
                      .filter((a) => a.enabled)
                      .map((a) => (
                        <RecommendCard
                          key={a.code}
                          emoji={a.emoji}
                          image={ACTIVITY_ART[a.code]?.image}
                          title={a.title}
                          tag={continueCat.label}
                          tint={ACTIVITY_ART[a.code]?.tint ?? colors.skySoft}
                          onPress={() =>
                            startActivity(router, activities, a.code, {
                              categoryId: continueCat.id,
                              childId: child!.id,
                              title: continueCat.label,
                            })
                          }
                        />
                      ))}
                  </ScrollView>
                </>
              ) : null}

              {withWords.length ? (
                <>
                  <SectionRow
                    title="Categories"
                    action="See all"
                    onAction={() => router.push("/(tabs)/learn")}
                  />
                  <View style={styles.tileGrid}>
                    {withWords.slice(0, 6).map((cat, i) => {
                      const theme = categoryTheme(cat.label, i);
                      return (
                        <CategoryTile
                          key={cat.id}
                          emoji={displayEmoji(cat.emoji)}
                          title={cat.label}
                          image={theme.image}
                          tint={theme.tint}
                          learned={cat.progress?.wordsLearned ?? 0}
                          total={cat.wordCount}
                          stars={cat.progress?.stars ?? 0}
                          locked={!cat.unlocked}
                          completed={cat.progress?.completed}
                          onPress={() => openCategory(cat)}
                        />
                      );
                    })}
                  </View>
                </>
              ) : null}
            </>
          ) : null}

          <View style={{ height: 8 }} />
        </ScrollView>
      </SafeAreaView>
    </SkyBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 18, gap: 16, paddingBottom: 28, width: "100%", maxWidth: 720, alignSelf: "center" },
  centerBox: { gap: 10, paddingVertical: 12, alignItems: "center" },
  emptyCard: { gap: 10, padding: 16, borderRadius: 24, backgroundColor: "#fff" },
  emptyTitle: { fontWeight: "900", fontSize: 18, color: colors.text },
  hint: { color: colors.textMuted, fontWeight: "600", lineHeight: 20 },
  statsRow: { flexDirection: "row", gap: 10, flexWrap: "wrap" },
  featureGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
});
