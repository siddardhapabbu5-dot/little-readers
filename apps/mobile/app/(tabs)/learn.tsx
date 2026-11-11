import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import Constants from "expo-constants";
import { ErrorText, SoftButton } from "../../components/ui";
import {
  CategoryTile,
  FilterPills,
  IconButton,
  KidsHeader,
  LearningBanner,
  SkyBackground,
} from "../../components/kids";
import { art, categoryTheme } from "../../components/illustrations";
import { displayEmoji } from "../../services/emoji";
import { resolveChildLevel } from "../../services/learning-nav";
import { gradeTheme, type GradeTheme } from "../../services/grade-theme";
import { apiRequest, ApiError } from "../../services/api";
import {
  getActiveChild,
  getOrCreateInstallationId,
  phoneLabel,
  saveActiveChild,
} from "../../services/secure";
import { colors, radii } from "../../theme";

type ChildRow = {
  id: string;
  displayName: string;
  birthYear: number;
  level: string;
  hasLearningSeat?: boolean;
  learnWiseGrade?: { levelCode: string; gradeLabel: string } | null;
};
type GradeAccess = {
  entitled: boolean;
  via: string | null;
  gradeLabel: string;
  levelCode: string;
  reason: string | null;
};
type Category = {
  id: string;
  label: string;
  emoji: string;
  symbol?: string | null;
  dailyConversation?: string | null;
  wordCount: number;
  unlocked: boolean;
  progress: { wordsLearned: number; stars: number; completed: boolean } | null;
};
type Group = { id: string; code: string; label: string; categories: Category[] };
type LevelRow = {
  id: string;
  code: string;
  label: string;
  description?: string | null;
  wordCount: number;
  sortOrder: number;
};
type LessonRow = {
  id: string;
  title: string;
  description: string | null;
  playStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED";
  wordCount: number;
};

export default function LearnTab() {
  const router = useRouter();
  const [child, setChild] = useState<ChildRow | null>(null);
  const [levels, setLevels] = useState<LevelRow[]>([]);
  const [selectedLevel, setSelectedLevel] = useState("");
  const [groups, setGroups] = useState<Group[]>([]);
  const [filter, setFilter] = useState("all");
  const [lessons, setLessons] = useState<LessonRow[]>([]);
  const [access, setAccess] = useState<GradeAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          let active = await getActiveChild<ChildRow>();
          const kids = await apiRequest<ChildRow[]>("/children");
          if (!active) {
            active = kids[0] ?? null;
            if (active) await saveActiveChild(active);
          } else {
            const fresh = kids.find((k) => k.id === active!.id);
            if (fresh) {
              active = fresh;
              await saveActiveChild(fresh);
            }
          }
          if (!active) {
            setError("Add a child on the Parent screen first.");
            setLoading(false);
            return;
          }
          setChild(active);

          const catalog = await apiRequest<LevelRow[]>("/learning/levels");
          setLevels(catalog);
          const activeCode =
            active.learnWiseGrade?.levelCode ?? resolveChildLevel(active.level, catalog);
          setSelectedLevel(activeCode);
          const data = activeCode
            ? await apiRequest<{ groups: Group[]; access: GradeAccess | null }>(
                `/learning/levels/${encodeURIComponent(activeCode)}/groups?childId=${encodeURIComponent(active.id)}`
              )
            : { groups: [] as Group[], access: null };
          setAccess(data.access);
          if (data.access && !data.access.entitled) {
            setGroups([]);
            setLessons([]);
            setLoading(false);
            return;
          }
          setGroups(data.groups);

          // Register device only on real iOS/Android. Expo web is preview — no lock spam.
          if (Platform.OS === "ios" || Platform.OS === "android") {
            const installationId = await getOrCreateInstallationId();
            await apiRequest("/devices/register", {
              method: "POST",
              body: JSON.stringify({
                childId: active.id,
                installationId,
                platform: Platform.OS,
                deviceLabel: phoneLabel(),
                appVersion: Constants.expoConfig?.version ?? "0.1.0",
              }),
            }).catch(() => null);
          }

          const lessonList = await apiRequest<LessonRow[]>(
            `/learning/lessons?childId=${encodeURIComponent(active.id)}`
          ).catch(() => [] as LessonRow[]);
          setLessons(lessonList);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not load lessons");
        } finally {
          setLoading(false);
        }
      })();
    }, [])
  );

  const activeMeta = levels.find((l) => l.code === selectedLevel);
  const gradeLabel = access?.gradeLabel ?? child?.learnWiseGrade?.gradeLabel ?? activeMeta?.label;
  const gradeName = gradeLabel?.split(" – ")[0] ?? "This grade";
  const blocked = Boolean(access && !access.entitled);
  const theme = gradeTheme(access?.levelCode ?? selectedLevel);
  const contentReady =
    (activeMeta?.wordCount ?? 0) > 0 ||
    groups.some((g) => g.categories.some((c) => (c.wordCount ?? 0) > 0));
  const visibleGroups = useMemo(() => groups.filter((g) => g.categories.length > 0), [groups]);
  const hasCategories = visibleGroups.length > 0;

  const filterOptions = useMemo(
    () => [
      { key: "all", label: "All" },
      ...visibleGroups.map((g) => ({
        key: g.id,
        label: /^[A-Z]$/.test(g.code) ? `Group ${g.code}` : g.label,
      })),
    ],
    [visibleGroups]
  );

  const displayGroups = useMemo(() => {
    if (filter === "all") return visibleGroups;
    const picked = visibleGroups.filter((g) => g.id === filter);
    return picked.length ? picked : visibleGroups;
  }, [filter, visibleGroups]);

  return (
    <SkyBackground>
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <KidsHeader
          left={<IconButton emoji="←" onPress={() => router.push("/(tabs)/home")} />}
          title={gradeLabel ?? "Learn"}
          right={<IconButton emoji="🏆" bg={colors.yellowSoft} onPress={() => router.push("/(tabs)/rewards")} />}
        />

        {!blocked && lessons.length > 0 ? (
          <View style={styles.lessonsBlock}>
            <Text style={styles.lessonsTitle}>Lessons</Text>
            <Text style={styles.lessonsHint}>Listen & Spell · your own progress</Text>
            {lessons.slice(0, 8).map((lesson) => (
              <Pressable
                key={lesson.id}
                style={styles.lessonCard}
                onPress={() => router.push(`/lesson/${lesson.id}`)}
              >
                <Text style={styles.lessonName}>{lesson.title}</Text>
                <Text style={styles.lessonMeta}>
                  {lesson.wordCount} words ·{" "}
                  {lesson.playStatus === "COMPLETED"
                    ? "Completed"
                    : lesson.playStatus === "IN_PROGRESS"
                      ? "In progress"
                      : "Not started"}
                </Text>
              </Pressable>
            ))}
          </View>
        ) : null}

        {!loading && child && blocked ? (
          <View style={styles.seatGate}>
            <Text style={styles.seatGateTitle}>Ask a parent to unlock {gradeName}</Text>
            <Text style={styles.seatGateBody}>
              {child.displayName} is in {gradeLabel}.{" "}
              {access?.reason ??
                `Each grade has its own subscription, so a parent needs to subscribe to ${gradeName} first.`}
            </Text>
            <SoftButton label="Open subscription" onPress={() => router.push("/subscription")} />
            <SoftButton label="Parent dashboard" onPress={() => router.push("/parent")} />
          </View>
        ) : loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
        {theme ? (
          <LearningBanner
            title={contentReady ? theme.bannerTitle : `${gradeName} topics are coming soon`}
            body={
              contentReady
                ? theme.bannerBody
                : `${gradeName} topics open here as soon as they are reviewed and published.`
            }
            emoji={contentReady ? theme.bannerEmoji : "🚧"}
            color={contentReady ? theme.bannerColor : colors.yellowSoft}
          />
        ) : (
          <LearningBanner
            title={contentReady ? "Let's Make Words Fun!" : `${gradeName} words are coming soon`}
            body={
              contentReady
                ? "Listen first, then gentle letter play."
                : `${gradeName} categories open here as soon as their words are ready.`
            }
            emoji={contentReady ? "📚" : "🚧"}
            image={contentReady ? art.heroKids : null}
            color={contentReady ? "#FFFFFF" : colors.yellowSoft}
          />
        )}

        {hasCategories && filterOptions.length > 2 ? (
          <FilterPills value={filter} onChange={setFilter} options={filterOptions} />
        ) : null}

        <ErrorText>{error}</ErrorText>

        {hasCategories && theme
          ? displayGroups.map((group) => (
              <View key={group.id} style={{ gap: 10 }}>
                <Text style={[styles.groupLabel, { color: theme.accent }]}>{group.label}</Text>
                {group.categories.map((cat) => (
                  <TopicCard
                    key={cat.id}
                    cat={cat}
                    theme={theme}
                    onPress={() =>
                      router.push({
                        pathname: "/topic/[id]",
                        params: { id: cat.id, childId: child?.id ?? "", levelCode: theme.levelCode },
                      })
                    }
                  />
                ))}
              </View>
            ))
          : hasCategories
          ? displayGroups.map((group) => (
              <View key={group.id} style={{ gap: 10 }}>
                <Text style={styles.groupLabel}>{group.label}</Text>
                <View style={styles.tileGrid}>
                  {group.categories.map((cat, i) => {
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
                        comingSoon={(cat.wordCount ?? 0) === 0}
                        onPress={() =>
                          router.push({
                            pathname: "/category-play",
                            params: {
                              categoryId: cat.id,
                              childId: child?.id ?? "",
                              title: cat.label,
                              emoji: cat.emoji,
                            },
                          })
                        }
                      />
                    );
                  })}
                </View>
              </View>
            ))
          : contentReady ? (
              <View style={styles.emptyLevel}>
                <Text style={styles.emptyTitle}>{gradeName} words are coming soon</Text>
                <Text style={styles.emptyBody}>
                  Categories appear here once their words are ready and published.
                </Text>
              </View>
            ) : null}
          </>
        )}

        <SoftButton label="Device / transfer" onPress={() => router.push("/devices")} />
      </ScrollView>
    </SafeAreaView>
    </SkyBackground>
  );
}

function TopicCard({ cat, theme, onPress }: { cat: Category; theme: GradeTheme; onPress: () => void }) {
  const learned = cat.progress?.wordsLearned ?? 0;
  const pct = cat.wordCount ? Math.min(100, Math.round((learned / cat.wordCount) * 100)) : 0;
  const locked = !cat.unlocked;
  return (
    <Pressable
      onPress={locked ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={`${cat.label}${locked ? ", locked" : ""}`}
      style={({ pressed }) => [
        styles.topicCard,
        { backgroundColor: theme.cardColor, borderColor: theme.accentSoft, opacity: locked ? 0.55 : pressed ? 0.85 : 1 },
      ]}
    >
      <View style={[styles.topicSymbol, { backgroundColor: theme.accentSoft, width: theme.symbolSize + 22, height: theme.symbolSize + 22 }]}>
        <Text style={{ fontSize: theme.symbolSize }}>{displayEmoji(cat.symbol || cat.emoji)}</Text>
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[styles.topicTitle, { fontSize: theme.titleSize }]} numberOfLines={2}>
          {cat.label}
        </Text>
        {theme.showConversationOnCard && cat.dailyConversation ? (
          <Text style={styles.topicLine} numberOfLines={2}>
            💬 {cat.dailyConversation}
          </Text>
        ) : null}
        <View style={styles.topicTrack}>
          <View style={[styles.topicFill, { width: `${pct}%`, backgroundColor: theme.accent }]} />
        </View>
        <Text style={styles.topicMeta}>
          {locked ? "🔒 Finish the earlier topics first" : cat.progress?.completed ? "✅ Completed" : `${learned}/${cat.wordCount} words`}
          {cat.progress?.stars ? ` · ${"⭐".repeat(Math.min(3, cat.progress.stars))}` : ""}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  topicCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 14,
    borderRadius: radii.lg,
    borderWidth: 2,
  },
  topicSymbol: { borderRadius: 999, alignItems: "center", justifyContent: "center" },
  topicTitle: { fontWeight: "900", color: colors.text },
  topicLine: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  topicTrack: { height: 6, borderRadius: 3, backgroundColor: "#EEF2F7", overflow: "hidden" },
  topicFill: { height: 6, borderRadius: 3 },
  topicMeta: { color: colors.textMuted, fontSize: 12, fontWeight: "700" },
  safe: { flex: 1 },
  content: { padding: 18, gap: 14, paddingBottom: 30, width: "100%", maxWidth: 720, alignSelf: "center" },
  tileGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  lessonsBlock: { gap: 8, marginBottom: 4 },
  lessonsTitle: { fontWeight: "900", fontSize: 18, color: colors.text },
  lessonsHint: { color: colors.textMuted, fontSize: 12, marginBottom: 4 },
  lessonCard: {
    backgroundColor: "#fff",
    borderRadius: radii.md,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  lessonName: { fontWeight: "800", fontSize: 16, color: colors.text },
  lessonMeta: { color: colors.textMuted, fontSize: 13, marginTop: 4 },
  groupLabel: { fontWeight: "900", fontSize: 19, color: colors.text, marginTop: 4 },
  emptyLevel: {
    backgroundColor: "#fff",
    borderRadius: radii.lg,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyTitle: { fontWeight: "800", fontSize: 16, color: colors.text },
  emptyBody: { color: colors.textMuted, lineHeight: 20 },
  seatGate: {
    backgroundColor: "#fff",
    borderRadius: radii.lg,
    padding: 18,
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  seatGateTitle: { fontWeight: "900", fontSize: 18, color: colors.text },
  seatGateBody: { color: colors.textMuted, lineHeight: 21 },
});
