import { StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { SoftButton } from "../../components/ui";
import { LearningBanner, SectionRow } from "../../components/kids";
import { colors, radii, shadow } from "../../theme";

export default function GamesTab() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <View style={styles.content}>
        <SectionRow title="Games" />
        <Text style={styles.sub}>
          Listen & Spell are ready in Learn. Extra game modes are listed below.
        </Text>

        <LearningBanner
          title="Listen & Spell — Available"
          body="Open Learn, pick a category, then play Listen and Spell rounds."
          emoji="🎧"
          color={colors.skySoft}
        />
        <SoftButton
          label="Open Listen & Spell (Learn)"
          onPress={() => router.push("/(tabs)/learn")}
        />

        <View style={[styles.card, shadow.card]}>
          <Text style={styles.cardTitle}>Coming soon</Text>
          <Text style={styles.cardBody}>
            These games are not available yet — buttons do not start a session:
          </Text>
          <Text style={styles.soonItem}>• Matching</Text>
          <Text style={styles.soonItem}>• Quiz</Text>
          <Text style={styles.soonItem}>• Revision</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 14 },
  sub: { color: colors.textMuted, fontWeight: "600" },
  card: {
    backgroundColor: "#fff",
    borderRadius: radii.xl,
    padding: 16,
    gap: 8,
  },
  cardTitle: { fontWeight: "800", fontSize: 18, color: colors.text },
  cardBody: { color: colors.textMuted, marginBottom: 4 },
  soonItem: { color: colors.textMuted, fontWeight: "700" },
});
