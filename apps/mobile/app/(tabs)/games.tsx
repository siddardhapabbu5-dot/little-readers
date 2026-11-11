import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type ImageSourcePropType,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import type { ActivityCode, MixMode } from "@little-readers/shared";
import { SoftButton, ErrorText } from "../../components/ui";
import { SectionRow, SkyBackground } from "../../components/kids";
import { ACTIVITY_ART, art, categoryTheme } from "../../components/illustrations";
import { apiRequest, ApiError } from "../../services/api";
import { getActiveChild, saveActiveChild } from "../../services/secure";
import { displayEmoji } from "../../services/emoji";
import { isOn, startActivity, useActivities } from "../../services/activities";
import { openLearningActivity, resolveChildLevel } from "../../services/learning-nav";
import { colors, radii, shadow } from "../../theme";

type ChildRow = {
  id: string;
  displayName: string;
  level?: string;
  hasLearningSeat?: boolean;
  learnWiseGrade?: { levelCode: string; gradeLabel: string } | null;
};
type GradeAccess = { entitled: boolean; gradeLabel: string; reason: string | null };
type Category = {
  id: string;
  label: string;
  emoji: string;
  unlocked: boolean;
  wordCount: number;
  progress?: { completed?: boolean; wordsLearned?: number } | null;
};
type Group = { categories: Category[] };
type DailyStatus = { completedToday: boolean; totalCompleted: number };

/** Kids' game zone: pick a game first, then the words to play with. */
export default function GamesTab() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const { activities } = useActivities();
  const [child, setChild] = useState<ChildRow | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [daily, setDaily] = useState<DailyStatus | null>(null);
  const [game, setGame] = useState<ActivityCode | null>(null);
  const [access, setAccess] = useState<GradeAccess | null>(null);
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

          if (active) {
            const levelKey =
              active.learnWiseGrade?.levelCode ??
              resolveChildLevel(
                active.level ?? "",
                await apiRequest<Parameters<typeof resolveChildLevel>[1]>("/learning/levels")
              );
            const [curriculum, dailyStatus] = await Promise.all([
              apiRequest<{ groups: Group[]; access: GradeAccess | null }>(
                `/learning/levels/${encodeURIComponent(levelKey)}/groups?childId=${encodeURIComponent(active.id)}`
              ),
              apiRequest<DailyStatus>(
                `/learning/progress/${encodeURIComponent(active.id)}/daily-challenge`
              ).catch(() => null),
            ]);
            setAccess(curriculum.access ?? null);
            const entitled = curriculum.access?.entitled !== false;
            setCategories(
              entitled
                ? (curriculum.groups ?? []).flatMap((g) => g.categories).filter((c) => c.wordCount > 0)
                : []
            );
            setDaily(entitled ? dailyStatus : null);
          } else {
            setAccess(null);
            setCategories([]);
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

  const games = activities.filter((a) => a.kind === "game" && a.mode && a.enabled);
  const surpriseOn = isOn(activities, "SURPRISE") && games.length > 0;
  const playable = useMemo(() => categories.filter((c) => c.unlocked), [categories]);
  const preset = playable.find((c) => c.id === params.categoryId) ?? null;
  const learnedAny = categories.some((c) => (c.progress?.wordsLearned ?? 0) > 0);
  const completedAny = categories.some((c) => c.progress?.completed);

  function play(code: ActivityCode, category: Category) {
    if (!child) return;
    startActivity(router, activities, code, {
      categoryId: category.id,
      childId: child.id,
      title: category.label,
    });
  }

  function pickGame(code: ActivityCode) {
    if (preset) {
      play(code, preset);
      return;
    }
    setGame((g) => (g === code ? null : code));
  }

  function surprise() {
    if (!playable.length) return;
    play("SURPRISE", preset ?? playable[Math.floor(Math.random() * playable.length)]);
  }

  function openWorld(mix: MixMode, title: string) {
    if (!child) return;
    const opts = { categoryId: "", childId: child.id, title, mix };
    if (mix === "REVISION_WORLD") {
      openLearningActivity(router, { activity: "REVISION", ...opts });
      return;
    }
    if (mix === "DAILY_CHALLENGE" && isOn(activities, "QUIZ_TIME")) {
      openLearningActivity(router, { activity: "QUIZ", ...opts });
      return;
    }
    startActivity(router, activities, "SURPRISE", opts);
  }

  const chosen = games.find((g) => g.code === game) ?? null;
  const blocked = Boolean(access && !access.entitled);

  return (
    <SkyBackground>
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <SectionRow title="Game Zone 🎮" />
        <Text style={styles.sub}>
          {preset
            ? `Playing with ${displayEmoji(preset.emoji)} ${preset.label} words. Pick a game!`
            : "Pick a game, then choose the words you want to play with."}
        </Text>
        <ErrorText>{error}</ErrorText>

        {child && !blocked ? (
          <World
            emoji="🏆"
            image={art.trophy}
            title="Challenge World"
            body="Weekly goals, leaderboards, friends and badges."
            color="#EDE7FF"
            onPress={() => router.push("/challenge-world")}
          />
        ) : null}

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : !child ? (
          <Text style={styles.sub}>Add a student on Parent, then return here.</Text>
        ) : blocked ? (
          <>
            <Text style={styles.sub}>
              {access?.reason ?? `A ${access?.gradeLabel.split(" – ")[0]} subscription is needed.`}
            </Text>
            <SoftButton label="Ask a parent to subscribe" onPress={() => router.push("/subscription")} />
          </>
        ) : !playable.length ? (
          <Text style={styles.sub}>
            No games yet. Learn your first words in Learn, then come back to play!
          </Text>
        ) : (
          <>
            <View style={styles.grid}>
              {games.map((g) => (
                <Pressable
                  key={g.code}
                  onPress={() => pickGame(g.code)}
                  style={({ pressed }) => [
                    styles.tile,
                    shadow.card,
                    { backgroundColor: ACTIVITY_ART[g.code]?.tint ?? colors.mintSoft, opacity: pressed ? 0.85 : 1 },
                    game === g.code && styles.tileOn,
                  ]}
                >
                  <Image source={ACTIVITY_ART[g.code].image} style={styles.tileArt} resizeMode="contain" />
                  <Text style={styles.tileTitle}>{g.title}</Text>
                  <Text style={styles.tileBody}>{g.description}</Text>
                </Pressable>
              ))}
              {surpriseOn ? (
                <Pressable
                  onPress={surprise}
                  style={({ pressed }) => [
                    styles.tile,
                    styles.tileWide,
                    shadow.card,
                    { backgroundColor: colors.pinkSoft, opacity: pressed ? 0.85 : 1 },
                  ]}
                >
                  <Image source={art.surprise} style={styles.worldArt} resizeMode="contain" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.tileTitle}>Surprise Game!</Text>
                    <Text style={styles.tileBody}>A random game with random words.</Text>
                  </View>
                </Pressable>
              ) : null}
            </View>
            {games.length === 0 ? (
              <Text style={styles.sub}>Games are switched off right now. Try Learn!</Text>
            ) : null}

            {preset ? (
              <SoftButton
                label="Choose other words"
                onPress={() => router.setParams({ categoryId: "" })}
              />
            ) : null}

            {chosen && !preset ? (
              <View style={{ gap: 10 }}>
                <Text style={styles.pickTitle}>
                  {chosen.emoji} {chosen.title} — choose your words
                </Text>
                <View style={styles.catGrid}>
                  {categories.map((c, i) => {
                    const theme = categoryTheme(c.label, i);
                    return (
                    <Pressable
                      key={c.id}
                      disabled={!c.unlocked}
                      onPress={() => play(chosen.code, c)}
                      style={({ pressed }) => [
                        styles.cat,
                        shadow.soft,
                        { backgroundColor: theme.tint },
                        !c.unlocked && styles.catLocked,
                        { opacity: pressed ? 0.85 : 1 },
                      ]}
                    >
                      {!c.unlocked ? (
                        <Text style={styles.catEmoji}>🔒</Text>
                      ) : theme.image ? (
                        <Image source={theme.image} style={styles.catArt} resizeMode="contain" />
                      ) : (
                        <Text style={styles.catEmoji}>{displayEmoji(c.emoji)}</Text>
                      )}
                      <Text style={styles.catLabel} numberOfLines={2}>
                        {c.label}
                      </Text>
                    </Pressable>
                    );
                  })}
                </View>
                <Text style={styles.hint}>🔒 Finish earlier topics in Learn to unlock more.</Text>
              </View>
            ) : null}

            {!preset && games.length > 0 ? (
              <>
                <SectionRow title="Fun Worlds 🌟" />
                <World
                  emoji="📅"
                  image={art.starGoal}
                  title="Daily Challenge"
                  body={
                    daily?.completedToday
                      ? "Done for today ✅ Play again for fun, or come back tomorrow for a new mix."
                      : "A new mix of words you know, every day."
                  }
                  color={colors.yellowSoft}
                  disabled={!learnedAny}
                  onPress={() => openWorld("DAILY_CHALLENGE", "Daily Challenge")}
                />
                <World
                  emoji="🔁"
                  image={art.revision}
                  title="Revision World"
                  body={
                    completedAny
                      ? "Practise words from topics you finished."
                      : "Opens after you finish your first topic."
                  }
                  color={colors.skySoft}
                  disabled={!completedAny && !learnedAny}
                  onPress={() => openWorld("REVISION_WORLD", "Revision World")}
                />
                <World
                  emoji="🌈"
                  image={art.surprise}
                  title="Mixed Games"
                  body={`Words from all ${playable.length} open topic${playable.length === 1 ? "" : "s"}, mixed up!`}
                  color={colors.mintSoft}
                  disabled={!learnedAny}
                  onPress={() => openWorld("MIXED", "Mixed Games")}
                />
                {!learnedAny ? (
                  <Text style={styles.hint}>Learn a few words first to open the Fun Worlds.</Text>
                ) : null}
              </>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
    </SkyBackground>
  );
}

function World(props: {
  emoji: string;
  image?: ImageSourcePropType;
  title: string;
  body: string;
  color: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.tile,
        styles.tileWide,
        styles.world,
        shadow.card,
        { backgroundColor: props.color, opacity: props.disabled ? 0.5 : pressed ? 0.85 : 1 },
      ]}
    >
      {props.image && !props.disabled ? (
        <Image source={props.image} style={styles.worldArt} resizeMode="contain" />
      ) : (
        <Text style={styles.tileEmoji}>{props.disabled ? "🔒" : props.emoji}</Text>
      )}
      <View style={{ flex: 1 }}>
        <Text style={styles.tileTitle}>{props.title}</Text>
        <Text style={styles.tileBody}>{props.body}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 18, gap: 14, paddingBottom: 36, width: "100%", maxWidth: 720, alignSelf: "center" },
  sub: { color: colors.text, fontWeight: "700", lineHeight: 20, opacity: 0.8 },
  tileArt: { width: 84, height: 84, alignSelf: "center" },
  worldArt: { width: 72, height: 72 },
  catArt: { width: 64, height: 56 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: {
    flexGrow: 1,
    flexBasis: "45%",
    borderRadius: radii.xl,
    padding: 16,
    gap: 6,
    minHeight: 150,
    borderWidth: 3,
    borderColor: "transparent",
  },
  tileWide: { flexBasis: "100%", flexDirection: "row", alignItems: "center", gap: 14, minHeight: 0 },
  tileOn: { borderColor: colors.primary },
  /** World cards sit in a column, where flexBasis would set height. */
  world: { flexBasis: "auto", flexGrow: 0 },
  tileEmoji: { fontSize: 44 },
  tileTitle: { fontWeight: "900", fontSize: 19, color: colors.text },
  tileBody: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
  pickTitle: { fontWeight: "800", fontSize: 17, color: colors.text },
  catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cat: {
    width: "30%",
    flexGrow: 1,
    backgroundColor: "#fff",
    borderRadius: radii.lg,
    padding: 12,
    alignItems: "center",
    gap: 6,
  },
  catLocked: { backgroundColor: colors.bgSoft, opacity: 0.6 },
  catEmoji: { fontSize: 32 },
  catLabel: { fontWeight: "700", fontSize: 12, color: colors.text, textAlign: "center" },
  hint: { color: colors.textMuted, fontSize: 12 },
});
