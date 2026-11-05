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
          Listen & Spell lives in Learn. Extra game modes are coming soon.
        </Text>

        <LearningBanner
          title="Listen & Spell"
          body="Open Learn, pick a category, then play Listen and Spell rounds."
          emoji="🎧"
          color={colors.skySoft}
        />

        <View style={[styles.card, shadow.card]}>
          <Text style={styles.cardTitle}>More games</Text>
          <Text style={styles.cardBody}>
            Matching, Quiz, and Revision are coming soon — not available yet.
          </Text>
          <SoftButton
            label="Open Learn hub"
            onPress={() => router.push("/(tabs)/learn")}
          />
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
    gap: 10,
  },
  cardTitle: { fontWeight: "800", fontSize: 18, color: colors.text },
  cardBody: { color: colors.textMuted, marginBottom: 4 },
});
