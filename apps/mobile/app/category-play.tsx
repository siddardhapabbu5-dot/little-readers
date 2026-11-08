import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { SoftButton } from "../components/ui";
import { IconButton, KidsHeader, LearningBanner } from "../components/kids";
import { AuthGate } from "../components/AuthGate";
import { openLearningActivity } from "../services/learning-nav";
import { ROLE_SETS } from "../services/auth-errors";
import { colors, radii, shadow } from "../theme";

/** Category → learn with Listen / Spell / Practice; games live in the Games tab. */
export default function CategoryPlayScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    categoryId: string;
    childId: string;
    title?: string;
    emoji?: string;
  }>();

  function go(
    activity: "LISTEN_SPELL" | "REVISION",
    startRound?: "LISTEN" | "SPELL"
  ) {
    openLearningActivity(router, {
      activity,
      categoryId: String(params.categoryId),
      childId: String(params.childId),
      title: params.title,
      startRound,
    });
  }

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
            body="Learn the words step by step: listen, spell, then practice."
            emoji="📚"
            color={colors.primarySoft}
          />

          <View style={[styles.card, shadow.card]}>
            <Text style={styles.title}>1. 🎧 Listen</Text>
            <Text style={styles.body}>Hear each word and pick its picture.</Text>
            <SoftButton label="Start Listen" onPress={() => go("LISTEN_SPELL", "LISTEN")} />
          </View>
          <View style={[styles.card, shadow.card]}>
            <Text style={styles.title}>2. ✍️ Spell</Text>
            <Text style={styles.body}>Build each word letter by letter.</Text>
            <SoftButton label="Start Spell" onPress={() => go("LISTEN_SPELL", "SPELL")} />
          </View>
          <View style={[styles.card, shadow.card]}>
            <Text style={styles.title}>3. 🔁 Practice</Text>
            <Text style={styles.body}>Go over the words that need more help.</Text>
            <SoftButton label="Start Practice" onPress={() => go("REVISION")} />
          </View>
          <SoftButton
            label="🎮 Play games with these words"
            onPress={() =>
              router.push({
                pathname: "/(tabs)/games",
                params: { categoryId: String(params.categoryId) },
              })
            }
          />
        </ScrollView>
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12 },
  card: {
    backgroundColor: "#fff",
    borderRadius: radii.xl,
    padding: 14,
    gap: 8,
  },
  title: { fontWeight: "800", fontSize: 16, color: colors.text },
  body: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
});
