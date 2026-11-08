import { Pressable, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { colors, radii } from "../theme";

export type EarnedCertificate = {
  id: string;
  certificateNo: string;
  category: { label: string; emoji: string } | null;
};

/** Celebration row on a results card when the session earned a category certificate. */
export function CertificateEarned({ certificates }: { certificates?: EarnedCertificate[] }) {
  const router = useRouter();
  if (!certificates?.length) return null;
  return (
    <View style={styles.wrap}>
      {certificates.map((c) => (
        <Pressable
          key={c.id}
          onPress={() => router.push({ pathname: "/certificate", params: { id: c.id } })}
          style={({ pressed }) => [styles.card, { opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={styles.big}>🎓</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>New certificate!</Text>
            <Text style={styles.body}>
              You learned every word in {c.category?.emoji} {c.category?.label}. Tap to see it.
            </Text>
          </View>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, alignSelf: "stretch" },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.yellowSoft,
    borderRadius: radii.lg,
    padding: 12,
    borderWidth: 2,
    borderColor: "#F5C542",
  },
  big: { fontSize: 36 },
  title: { fontWeight: "900", fontSize: 16, color: colors.text },
  body: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
});
