import { StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { SoftButton } from "../components/ui";
import { IconButton, KidsHeader, LearningBanner } from "../components/kids";
import { AuthGate } from "../components/AuthGate";
import { openLearningActivity } from "../services/learning-nav";
import { ROLE_SETS } from "../services/auth-errors";
import { colors, radii, shadow } from "../theme";

/** Category → choose Listen / Spell / Matching / Quiz / Revision. */
export default function CategoryPlayScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    categoryId: string;
    childId: string;
    title?: string;
    emoji?: string;
  }>();

  function go(
    activity: "LISTEN_SPELL" | "MATCHING" | "QUIZ" | "REVISION",
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
        <View style={styles.content}>
          <LearningBanner
            title={`${params.emoji ?? "📚"} ${params.title ?? "Category"}`}
            body="Pick how you want to practice these words."
            emoji="🎯"
            color={colors.primarySoft}
          />

          <View style={[styles.card, shadow.card]}>
            <Text style={styles.title}>🎧 Listen</Text>
            <SoftButton label="Start Listen" onPress={() => go("LISTEN_SPELL", "LISTEN")} />
          </View>
          <View style={[styles.card, shadow.card]}>
            <Text style={styles.title}>✍️ Spell</Text>
            <SoftButton label="Start Spell" onPress={() => go("LISTEN_SPELL", "SPELL")} />
          </View>
          <View style={[styles.card, shadow.card]}>
            <Text style={styles.title}>🧩 Matching</Text>
            <SoftButton label="Start Matching" onPress={() => go("MATCHING")} />
          </View>
          <View style={[styles.card, shadow.card]}>
            <Text style={styles.title}>📝 Quiz</Text>
            <SoftButton label="Start Quiz" onPress={() => go("QUIZ")} />
          </View>
          <View style={[styles.card, shadow.card]}>
            <Text style={styles.title}>🔁 Revision</Text>
            <SoftButton label="Start Revision" onPress={() => go("REVISION")} />
          </View>
        </View>
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
});
