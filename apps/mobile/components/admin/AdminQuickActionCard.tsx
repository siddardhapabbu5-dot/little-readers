import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { dash } from "./dashboardTheme";

type Props = {
  title: string;
  subtitle: string;
  icon: keyof typeof Ionicons.glyphMap;
  tint?: string;
  soft?: string;
  onPress: () => void;
};

export function AdminQuickActionCard({
  title,
  subtitle,
  icon,
  tint = dash.purple,
  soft = dash.purpleSoft,
  onPress,
}: Props) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.9 : 1 }]}
    >
      <View style={[styles.iconBubble, { backgroundColor: soft }]}>
        <Ionicons name={icon} size={22} color={tint} />
      </View>
      <View style={styles.copy}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
      <View style={[styles.arrow, { backgroundColor: tint }]}>
        <Ionicons name="chevron-forward" size={18} color="#fff" />
      </View>
      <Ionicons
        name={icon}
        size={64}
        color={tint}
        style={styles.watermark}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: dash.card,
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    overflow: "hidden",
    minHeight: 76,
    shadowColor: "#4C1D95",
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  iconBubble: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  copy: { flex: 1, gap: 2, zIndex: 1 },
  title: { fontSize: 15, fontWeight: "800", color: dash.text },
  subtitle: { fontSize: 12, color: dash.textMuted },
  arrow: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  watermark: {
    position: "absolute",
    right: 48,
    opacity: 0.06,
  },
});
