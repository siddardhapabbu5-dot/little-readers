import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { colors, radii } from "../theme";

export type ChallengeResult = {
  awarded: { source: string; label: string; points: number }[];
  limited: { source: string; label: string }[];
  totalAwarded: number;
  newBadges?: string[];
} | null;

/** Results-card row: weekly challenge points earned by this session. */
export function ChallengePointsEarned({ challenge }: { challenge?: ChallengeResult }) {
  const router = useRouter();
  if (!challenge || (!challenge.totalAwarded && !challenge.limited.length)) return null;
  return (
    <Pressable
      onPress={() => router.push("/challenge-world")}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}
    >
      <Text style={styles.big}>🏆</Text>
      <View style={{ flex: 1 }}>
        {challenge.totalAwarded > 0 ? (
          <Text style={styles.title}>+{challenge.totalAwarded} Challenge points!</Text>
        ) : (
          <Text style={styles.title}>Great practice!</Text>
        )}
        {challenge.limited.length ? (
          <Text style={styles.body}>
            You already earned today&apos;s {challenge.limited.map((l) => l.label).join(" & ")} points
            here. Try another topic or game for more!
          </Text>
        ) : null}
        {challenge.newBadges?.length ? (
          <Text style={styles.body}>New badge: {challenge.newBadges.join(", ")} 🎉</Text>
        ) : null}
        <Text style={styles.link}>Open Challenge World →</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    alignSelf: "stretch",
    backgroundColor: "#EDE9FE",
    borderRadius: radii.lg,
    padding: 12,
    borderWidth: 2,
    borderColor: "#A78BFA",
  },
  big: { fontSize: 36 },
  title: { fontWeight: "900", fontSize: 16, color: colors.text },
  body: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
  link: { color: "#6D28D9", fontWeight: "800", fontSize: 12, marginTop: 2 },
});
