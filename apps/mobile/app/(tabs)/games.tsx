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
          Practice with Listen & Spell — open a category from Learn to play.
        </Text>

        <LearningBanner
          title="Listen Adventure"
          body="Hear the word, then tap the matching picture."
          emoji="🎧"
          color={colors.skySoft}
        />

        <View style={[styles.card, shadow.card]}>
          <Text style={styles.cardTitle}>✏️ Spell Fun</Text>
          <Text style={styles.cardBody}>
            Gentle letter play for little readers — first letter recognition for ages
            1–3.
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
