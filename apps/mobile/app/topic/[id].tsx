import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { ErrorText, SoftButton } from "../../components/ui";
import { IconButton, KidsHeader, SkyBackground } from "../../components/kids";
import { apiRequest, ApiError } from "../../services/api";
import { displayEmoji } from "../../services/emoji";
import { gradeTheme } from "../../services/grade-theme";
import { speakWord } from "../../services/speech";
import { colors, radii, shadow } from "../../theme";

type TopicWord = {
  id: string;
  word: string;
  simpleMeaning: string;
  exampleSentence: string | null;
  emoji: string;
};

type TopicData = {
  category: {
    id: string;
    categoryName: string;
    emoji: string;
    symbol: string | null;
    dailyConversation: string | null;
    exampleSentence: string | null;
    levelCode: string;
    wordCount: number;
  };
  words: TopicWord[];
};

function ListenButton({ text, voice, accent }: { text: string; voice: "kid" | "default"; accent: string }) {
  return (
    <Pressable
      onPress={() => void speakWord(text, { profile: voice })}
      accessibilityRole="button"
      accessibilityLabel={`Listen: ${text}`}
      style={({ pressed }) => [styles.listen, { backgroundColor: accent, opacity: pressed ? 0.8 : 1 }]}
    >
      <Text style={styles.listenText}>🔊 Listen</Text>
    </Pressable>
  );
}

export default function TopicScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id: string; childId?: string; levelCode?: string }>();
  const id = String(params.id);
  const childId = params.childId ? String(params.childId) : "";
  const [data, setData] = useState<TopicData | null>(null);
  const [said, setSaid] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          const q = childId ? `?childId=${encodeURIComponent(childId)}` : "";
          setData(await apiRequest<TopicData>(`/learning/categories/${encodeURIComponent(id)}/words${q}`));
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not open this topic");
        } finally {
          setLoading(false);
        }
      })();
    }, [id, childId])
  );

  const theme = gradeTheme(data?.category.levelCode ?? params.levelCode);
  const accent = theme?.accent ?? colors.primary;
  const accentSoft = theme?.accentSoft ?? colors.primarySoft;
  const voice = theme?.voice ?? "kid";
  const cat = data?.category;
  const sayCount = Object.values(said).filter(Boolean).length;

  return (
    <SkyBackground>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <KidsHeader
            left={<IconButton emoji="←" onPress={() => router.back()} />}
            title={theme ? `${theme.topicWord}` : "Topic"}
          />
          {loading ? <ActivityIndicator color={accent} /> : null}
          <ErrorText>{error}</ErrorText>

          {cat ? (
            <>
              <View style={[styles.hero, { backgroundColor: accentSoft }, shadow.soft]}>
                <Text style={{ fontSize: (theme?.symbolSize ?? 48) + 16 }}>{displayEmoji(cat.symbol || cat.emoji)}</Text>
                <Text style={styles.heroTitle}>{cat.categoryName}</Text>
                <Text style={styles.heroMeta}>{cat.wordCount} key words</Text>
              </View>

              {cat.dailyConversation ? (
                <View style={[styles.card, shadow.soft]}>
                  <Text style={[styles.cardLabel, { color: accent }]}>💬 Daily conversation</Text>
                  <Text style={styles.cardText}>{cat.dailyConversation}</Text>
                  <ListenButton text={cat.dailyConversation} voice={voice} accent={accent} />
                </View>
              ) : null}

              {cat.exampleSentence ? (
                <View style={[styles.card, shadow.soft]}>
                  <Text style={[styles.cardLabel, { color: accent }]}>✏️ Example sentence</Text>
                  <Text style={styles.cardText}>{cat.exampleSentence}</Text>
                  <View style={styles.row}>
                    <ListenButton text={cat.exampleSentence} voice={voice} accent={accent} />
                    <Pressable
                      onPress={() => setSaid((s) => ({ ...s, example: true }))}
                      accessibilityRole="button"
                      style={[styles.sayBtn, { borderColor: accent }, said.example && { backgroundColor: accentSoft }]}
                    >
                      <Text style={[styles.sayText, { color: accent }]}>{said.example ? "🌟 Well said!" : "🗣️ I said it!"}</Text>
                    </Pressable>
                  </View>
                  <Text style={styles.hint}>Listen, then say it out loud yourself.</Text>
                </View>
              ) : null}

              <Text style={[styles.section, { color: accent }]}>Key words</Text>
              {data!.words.map((w) => (
                <View key={w.id} style={[styles.wordCard, shadow.soft]}>
                  <Text style={styles.wordEmoji}>{displayEmoji(w.emoji)}</Text>
                  <View style={{ flex: 1, gap: 3 }}>
                    <Text style={styles.word}>{w.word}</Text>
                    <Text style={styles.meaning}>{w.simpleMeaning}</Text>
                    {w.exampleSentence ? <Text style={styles.example}>“{w.exampleSentence}”</Text> : null}
                    <View style={styles.row}>
                      <ListenButton text={w.exampleSentence ? `${w.word}. ${w.exampleSentence}` : w.word} voice={voice} accent={accent} />
                      <Pressable
                        onPress={() => setSaid((s) => ({ ...s, [w.id]: true }))}
                        accessibilityRole="button"
                        style={[styles.sayBtn, { borderColor: accent }, said[w.id] && { backgroundColor: accentSoft }]}
                      >
                        <Text style={[styles.sayText, { color: accent }]}>{said[w.id] ? "🌟" : "🗣️ Say it"}</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              ))}

              <Text style={styles.hint}>
                {sayCount ? `You practised ${sayCount} time${sayCount === 1 ? "" : "s"} — great speaking!` : "Tap Listen, then say each word with me."}
              </Text>

              {childId && cat.wordCount > 0 ? (
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/category-play",
                      params: { categoryId: cat.id, childId, title: cat.categoryName, emoji: cat.symbol || cat.emoji },
                    })
                  }
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.play, { backgroundColor: accent, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={styles.playText}>🎮 {theme?.playLabel ?? "Play"}</Text>
                </Pressable>
              ) : null}
              <SoftButton label="Back to topics" onPress={() => router.back()} />
            </>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </SkyBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { padding: 18, gap: 14, paddingBottom: 30, width: "100%", maxWidth: 720, alignSelf: "center" },
  hero: { borderRadius: radii.xl, padding: 20, alignItems: "center", gap: 6 },
  heroTitle: { fontSize: 22, fontWeight: "900", color: colors.text, textAlign: "center" },
  heroMeta: { color: colors.textMuted, fontWeight: "700" },
  card: { backgroundColor: "#fff", borderRadius: radii.lg, padding: 16, gap: 8 },
  cardLabel: { fontWeight: "900", fontSize: 14 },
  cardText: { fontSize: 18, lineHeight: 26, color: colors.text, fontWeight: "700" },
  hint: { color: colors.textMuted, fontSize: 13, textAlign: "center" },
  section: { fontWeight: "900", fontSize: 19, marginTop: 4 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 4 },
  listen: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radii.pill },
  listenText: { color: "#fff", fontWeight: "900" },
  sayBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radii.pill, borderWidth: 2, backgroundColor: "#fff" },
  sayText: { fontWeight: "900" },
  wordCard: { backgroundColor: "#fff", borderRadius: radii.lg, padding: 14, flexDirection: "row", gap: 12 },
  wordEmoji: { fontSize: 40, width: 50, textAlign: "center" },
  word: { fontSize: 20, fontWeight: "900", color: colors.text },
  meaning: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  example: { color: colors.text, fontSize: 14, fontStyle: "italic", lineHeight: 20 },
  play: { borderRadius: radii.pill, paddingVertical: 16, alignItems: "center" },
  playText: { color: "#fff", fontSize: 18, fontWeight: "900" },
});
