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
          if (!active.hasLearningSeat) {
            setError(null);
            setGroups([]);
            setLevels([]);
            setLessons([]);
            setLoading(false);
            return;
          }

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

          const catalog = await apiRequest<LevelRow[]>("/learning/levels");
          // Only real levels from API (no hardcoded L1–L4 placeholders).
          const numbered = [...catalog].sort((a, b) => a.sortOrder - b.sortOrder);
          setLevels(numbered);

          const activeCode =
            (selectedLevel && numbered.some((l) => l.code === selectedLevel)
              ? selectedLevel
              : null) ??
            numbered.find((l) => (l.wordCount ?? 0) > 0)?.code ??
            numbered[0]?.code ??
            "";
          if (activeCode && activeCode !== selectedLevel) {
            setSelectedLevel(activeCode);
          }

          const lessonList = await apiRequest<LessonRow[]>(
            `/learning/lessons?childId=${encodeURIComponent(active.id)}`
          ).catch(() => [] as LessonRow[]);
          setLessons(lessonList);

          if (!activeCode) {
            setGroups([]);
          } else {
            const levelKey = activeCode.replace(/^LEVEL_/i, "");
            const data = await apiRequest<{ groups: Group[] }>(
              `/learning/levels/${levelKey}/groups?childId=${encodeURIComponent(active.id)}`
            );
            setGroups(data.groups);
          }
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not load lessons");
        } finally {
          setLoading(false);
        }
      })();
    }, [selectedLevel])
  );

  const activeMeta = levels.find((l) => l.code === selectedLevel);
  const contentReady =
    (activeMeta?.wordCount ?? 0) > 0 ||
    groups.some((g) => g.categories.some((c) => (c.wordCount ?? 0) > 0));

  const filteredGroups = useMemo(() => {
    if (filter === "all") return groups;
    if (filter === "a") {
      return groups.filter(
        (g) => /group\s*a/i.test(g.label) || /_a$/i.test(g.code) || g.code === "A" || groups.indexOf(g) === 0
      );
    }
    if (filter === "b") {
      return groups.filter(
        (g) => /group\s*b/i.test(g.label) || /_b$/i.test(g.code) || g.code === "B" || groups.indexOf(g) === 1
      );
    }
    return groups;
  }, [groups, filter]);

  const displayGroups = useMemo(() => {
    if (filter === "all") return groups;
    if (groups.length <= 2) {
      if (filter === "a") return groups.slice(0, 1);
      if (filter === "b") return groups.slice(1);
    }
    return filteredGroups.length ? filteredGroups : groups;
  }, [filter, groups, filteredGroups]);

  return (
    <SkyBackground>
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <KidsHeader
          left={<IconButton emoji="←" onPress={() => router.push("/(tabs)/home")} />}
          title={activeMeta?.label ?? "Learn"}
          right={<IconButton emoji="🏆" bg={colors.yellowSoft} onPress={() => router.push("/(tabs)/rewards")} />}
        />

        {child?.hasLearningSeat && lessons.length > 0 ? (
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

        {levels.length > 1 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.levelRow}
          >
            {levels.map((meta) => {
              const ready = (meta.wordCount ?? 0) > 0;
              const selected = selectedLevel === meta.code;
              const short =
                meta.code.replace(/^LEVEL_/i, "L") || meta.label.slice(0, 8);
              return (
                <Pressable
                  key={meta.id}
                  onPress={() => setSelectedLevel(meta.code)}
                  style={[
                    styles.levelChip,
                    selected && styles.levelChipOn,
                    !ready && styles.levelChipSoon,
                  ]}
                >
                  <Text
                    style={[
                      styles.levelChipText,
                      selected && styles.levelChipTextOn,
                    ]}
                  >
                    {short}
                    {!ready ? " · Soon" : ""}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {!loading && child && !child.hasLearningSeat ? (
          <View style={styles.seatGate}>
            <Text style={styles.seatGateTitle}>Activate a learning seat</Text>
            <Text style={styles.seatGateBody}>
              {child.displayName} is saved, but your plan includes 2 child seats. Assign an
              available seat or add a paid seat before Kids Zone unlocks.
            </Text>
            <SoftButton label="Open subscription / seats" onPress={() => router.push("/subscription")} />
            <SoftButton label="Parent dashboard" onPress={() => router.push("/parent")} />
          </View>
        ) : (
          <>
        <LearningBanner
          title={contentReady ? "Let's Make Words Fun!" : "More levels coming"}
          body={
            contentReady
              ? "Listen first, then gentle letter play."
              : "Level structure is ready. Vocabulary will be added by the owner — nothing invented here."
          }
          emoji={contentReady ? "📚" : "🚧"}
          image={contentReady ? art.heroKids : null}
          color={contentReady ? "#FFFFFF" : colors.yellowSoft}
        />

        {contentReady ? (
          <FilterPills
            value={filter}
            onChange={setFilter}
            options={[
              { key: "all", label: "All" },
              { key: "a", label: "Group A" },
              { key: "b", label: "Group B" },
            ]}
          />
        ) : null}

        <ErrorText>{error}</ErrorText>
        {loading ? <ActivityIndicator color={colors.primary} /> : null}

        {contentReady
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
          : !loading ? (
              <View style={styles.emptyLevel}>
                <Text style={styles.emptyTitle}>No vocabulary in this level yet</Text>
                <Text style={styles.emptyBody}>
                  Categories appear here after Admin publishes words for this grade.
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

const styles = StyleSheet.create({
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
  levelRow: { gap: 8, paddingVertical: 2 },
  levelChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radii.pill,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: colors.border,
  },
  levelChipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  levelChipSoon: { opacity: 0.85 },
  levelChipText: { fontWeight: "800", color: colors.text },
  levelChipTextOn: { color: "#fff" },
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
