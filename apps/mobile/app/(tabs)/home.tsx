import { useCallback, useMemo, useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ErrorText } from "../../components/ui";
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
import { getActiveChild, getUser, saveActiveChild } from "../../services/secure";
import { colors } from "../../theme";

type AuthUser = { id: string; name: string; email: string; role: string };
type ChildRow = {
  id: string;
  displayName: string;
  birthYear: number;
  level: string;
  levelId?: string | null;
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

export default function HomeTab() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [child, setChild] = useState<ChildRow | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [progress, setProgress] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          const u = await getUser<AuthUser>();
          setUser(u);
          if (!u) return;

          let active = await getActiveChild<ChildRow>();
          if (u.role === "PARENT") {
            const kids = await apiRequest<ChildRow[]>("/children");
            // Prefer fresh API row so level/grade stay in sync when switching children.
            const match = active
              ? kids.find((k) => k.id === active!.id) ?? kids[0]
              : kids[0];
            active = match ?? null;
            if (active) await saveActiveChild(active);
          }
          setChild(active);

          if (active) {
            const levelKey = active.level || "LEVEL_1";
            const [p, curriculum] = await Promise.all([
              apiRequest(`/learning/progress/${active.id}`),
              apiRequest<{ groups: Group[] }>(
                `/learning/levels/${encodeURIComponent(levelKey)}/groups?childId=${encodeURIComponent(active.id)}`
              ),
            ]);
            setProgress(p);
            setGroups(curriculum.groups);
          }
          setError(null);
        } catch (err) {
          // Never show rate-limit noise on the kids home screen.
          if (err instanceof ApiError && err.status === 429) {
            setError(null);
            return;
          }
          setError(err instanceof ApiError ? err.message : "Could not load home");
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
  const words = progress?.summary?.wordsLearned ?? 0;
  const dailyCompleted = Math.min(words, 5);

  function openCategory(cat?: Category) {
    if (!cat || !child) {
      router.push("/(tabs)/learn");
      return;
    }
    router.push({
      pathname: "/play",
      params: { categoryId: cat.id, childId: child.id, title: cat.label },
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <KidsHeader
          left={<IconButton emoji="☰" onPress={() => router.push("/(tabs)/profile")} />}
          right={<IconButton emoji="🔍" bg={colors.primarySoft} onPress={() => router.push("/(tabs)/learn")} />}
        />

        <WelcomeHero
          name={child?.displayName ?? user?.name?.split(" ")[0] ?? "Champ"}
          character="🧒"
        />

        <ErrorText>{error}</ErrorText>

        <DailyGoalCard
          completed={dailyCompleted}
          target={5}
          message={
            dailyCompleted >= 5
              ? "Amazing! Daily goal complete."
              : "Keep it up! You're doing great."
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
            subtitle={`${continueCat.group ?? "Level 1"} · Listen & Spell`}
            progressPct={Math.round(
              ((continueCat.progress?.wordsLearned ?? 0) / Math.max(continueCat.wordCount, 1)) * 100
            )}
            onContinue={() => openCategory(continueCat)}
          />
        ) : null}

        <SectionRow title="Recommended for You" />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12 }}
        >
          {recommended.map((cat, i) => (
            <RecommendCard
              key={cat.id}
              emoji={cat.emoji}
              title={cat.label}
              tag={i % 2 === 0 ? "Listen" : "Spell"}
              tint={i % 2 === 0 ? colors.skySoft : colors.yellowSoft}
              onPress={() => openCategory(cat)}
            />
          ))}
        </ScrollView>

        <View style={{ height: 8 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 16, paddingBottom: 28 },
});
