import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AdminTabBar } from "../components/AdminTabBar";
import { AuthGate } from "../components/AuthGate";
import { ROLE_SETS } from "../services/auth-errors";
import { adminColors, radii, shadow } from "../theme";

const LINKS: Array<{
  label: string;
  subtitle: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    label: "Review vocabulary",
    subtitle: "Search, edit, approve and publish words",
    href: "/admin-words",
    icon: "checkmark-done-outline",
  },
  {
    label: "Dictionary upload",
    subtitle: "Upload · classify · pending suggestions",
    href: "/admin-dictionary",
    icon: "cloud-upload-outline",
  },
  {
    label: "Six-month programme",
    subtitle: "Schedule daily words (scheduler follow-up)",
    href: "/admin-programme",
    icon: "calendar-outline",
  },
];

export default function AdminVocabularyHubScreen() {
  const router = useRouter();

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Dictionary & Vocabulary</Text>
          <Text style={styles.sub}>
            Upload dictionary entries, review AI grade suggestions, then publish words for lessons.
          </Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          {LINKS.map((link) => (
            <Pressable
              key={link.href}
              onPress={() => router.push(link.href as never)}
              style={({ pressed }) => [
                styles.row,
                shadow.soft,
                { opacity: pressed ? 0.88 : 1 },
              ]}
            >
              <View style={styles.icon}>
                <Ionicons name={link.icon} size={22} color={adminColors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>{link.label}</Text>
                <Text style={styles.meta}>{link.subtitle}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={adminColors.textSecondary} />
            </Pressable>
          ))}
          <Text style={styles.note}>
            AI classification never auto-publishes. Approve or reject each suggestion first.
          </Text>
        </ScrollView>

        <AdminTabBar />
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: adminColors.background },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 6 },
  title: { fontSize: 24, fontWeight: "800", color: adminColors.text },
  sub: { color: adminColors.textSecondary, fontSize: 14, lineHeight: 20 },
  content: { padding: 16, gap: 10, paddingBottom: 28 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: adminColors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: adminColors.border,
    paddingVertical: 14,
    paddingHorizontal: 14,
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
  },
  label: { fontWeight: "800", color: adminColors.text, fontSize: 16 },
  meta: { color: adminColors.textSecondary, fontSize: 13, marginTop: 2 },
  note: { color: adminColors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 8 },
});
