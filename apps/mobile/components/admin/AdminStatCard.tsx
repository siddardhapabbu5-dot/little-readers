import { Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { dash } from "./dashboardTheme";

type Props = {
  value: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  soft: string;
  accent: string;
  onPress: () => void;
};

export function AdminStatCard({ value, label, icon, tint, soft, accent, onPress }: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.92 : 1, transform: [{ scale: pressed ? 0.98 : 1 }] }]}
    >
      <LinearGradient
        colors={["transparent", accent]}
        start={{ x: 1, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.cornerWash}
        pointerEvents="none"
      />
      <View style={styles.topRow}>
        <View style={[styles.iconBubble, { backgroundColor: soft }]}>
          <Ionicons name={icon} size={20} color={tint} />
        </View>
        <View style={[styles.arrowBtn, { backgroundColor: soft }]}>
          <Ionicons name="chevron-forward" size={14} color={tint} />
        </View>
      </View>
      <Text style={styles.value} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={styles.label}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "48%",
    backgroundColor: dash.card,
    borderRadius: 22,
    padding: 14,
    minHeight: 128,
    overflow: "hidden",
    shadowColor: "#4C1D95",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cornerWash: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: "70%",
    height: "55%",
    borderTopLeftRadius: 80,
  },
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  iconBubble: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
  },
  arrowBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  value: {
    marginTop: 12,
    fontSize: 28,
    fontWeight: "800",
    color: dash.text,
    letterSpacing: -0.5,
  },
  label: {
    marginTop: 2,
    fontSize: 13,
    fontWeight: "600",
    color: dash.textMuted,
  },
});
