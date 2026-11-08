import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { SoftButton, ErrorText } from "../../components/ui";
import { SectionRow } from "../../components/kids";
import { apiRequest, ApiError } from "../../services/api";
import { getActiveChild, saveActiveChild } from "../../services/secure";
import { displayEmoji } from "../../services/emoji";
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

type GameKey = "MATCHING" | "QUIZ";
const GAMES: Array<{ key: GameKey; emoji: string; title: string; body: string; color: string }> = [
  {
    key: "MATCHING",
    emoji: "🧩",
    title: "Match It",
    body: "Pair each word with its picture.",
    color: colors.skySoft,
  },
  {
    key: "QUIZ",
    emoji: "🎯",
    title: "Quiz Time",
    body: "Read the clue, tap the right word.",
    color: colors.yellowSoft,
  },
];

/** Kids' game zone: pick a game first, then the words to play with. */
export default function GamesTab() {
  const router = useRouter();
  const params = useLocalSearchParams<{ categoryId?: string }>();
  const [child, setChild] = useState<ChildRow | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [game, setGame] = useState<GameKey | null>(null);
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
            setCategories(
              (curriculum.groups ?? []).flatMap((g) => g.categories).filter((c) => c.wordCount > 0)
            );
          } else {
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

  const playable = useMemo(() => categories.filter((c) => c.unlocked), [categories]);
  const preset = playable.find((c) => c.id === params.categoryId) ?? null;

  function play(activity: GameKey, category: Category) {
    if (!child) return;
    openLearningActivity(router, {
      activity,
      categoryId: category.id,
      childId: child.id,
      title: category.label,
    });
  }

  function pickGame(key: GameKey) {
    if (preset) {
      play(key, preset);
      return;
    }
    setGame((g) => (g === key ? null : key));
  }

  function surprise() {
    if (!playable.length) return;
    const g = GAMES[Math.floor(Math.random() * GAMES.length)];
    const c = playable[Math.floor(Math.random() * playable.length)];
    play(g.key, c);
  }

  const chosen = GAMES.find((g) => g.key === game) ?? null;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScrollView contentContainerStyle={styles.content}>
        <SectionRow title="Game Zone 🎮" />
        <Text style={styles.sub}>
          {preset
            ? `Playing with ${displayEmoji(preset.emoji)} ${preset.label} words. Pick a game!`
            : "Pick a game, then choose the words you want to play with."}
        </Text>
        <ErrorText>{error}</ErrorText>

        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : !child ? (
          <Text style={styles.sub}>Add a student on Parent, then return here.</Text>
        ) : child.hasLearningSeat === false ? (
          <SoftButton label="Activate a learning seat" onPress={() => router.push("/subscription")} />
        ) : !playable.length ? (
          <Text style={styles.sub}>
            No games yet. Learn your first words in Learn, then come back to play!
          </Text>
        ) : (
          <>
            <View style={styles.grid}>
              {GAMES.map((g) => (
                <Pressable
                  key={g.key}
                  onPress={() => pickGame(g.key)}
                  style={({ pressed }) => [
                    styles.tile,
                    shadow.card,
                    { backgroundColor: g.color, opacity: pressed ? 0.85 : 1 },
                    game === g.key && styles.tileOn,
                  ]}
                >
                  <Text style={styles.tileEmoji}>{g.emoji}</Text>
                  <Text style={styles.tileTitle}>{g.title}</Text>
                  <Text style={styles.tileBody}>{g.body}</Text>
                </Pressable>
              ))}
              <Pressable
                onPress={surprise}
                style={({ pressed }) => [
                  styles.tile,
                  styles.tileWide,
                  shadow.card,
                  { backgroundColor: colors.pinkSoft, opacity: pressed ? 0.85 : 1 },
                ]}
              >
                <Text style={styles.tileEmoji}>🎲</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.tileTitle}>Surprise Game!</Text>
                  <Text style={styles.tileBody}>A random game with random words.</Text>
                </View>
              </Pressable>
            </View>

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
                  {categories.map((c) => (
                    <Pressable
                      key={c.id}
                      disabled={!c.unlocked}
                      onPress={() => play(chosen.key, c)}
                      style={({ pressed }) => [
                        styles.cat,
                        shadow.soft,
                        !c.unlocked && styles.catLocked,
                        { opacity: pressed ? 0.85 : 1 },
                      ]}
                    >
                      <Text style={styles.catEmoji}>
                        {c.unlocked ? displayEmoji(c.emoji) : "🔒"}
                      </Text>
                      <Text style={styles.catLabel} numberOfLines={2}>
                        {c.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.hint}>🔒 Finish earlier topics in Learn to unlock more.</Text>
              </View>
            ) : null}
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
  catLocked: { backgroundColor: colors.bgSoft },
  catEmoji: { fontSize: 32 },
  catLabel: { fontWeight: "700", fontSize: 12, color: colors.text, textAlign: "center" },
  hint: { color: colors.textMuted, fontSize: 12 },
});
