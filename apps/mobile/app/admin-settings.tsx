import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AdminTabBar } from "../components/AdminTabBar";
import { AuthGate } from "../components/AuthGate";
import { PrimaryButton } from "../components/ui";
import { ROLE_SETS } from "../services/auth-errors";
import { clearSession, getUser } from "../services/secure";
import { adminColors, radii, shadow } from "../theme";

type AuthUser = { id: string; name: string; email: string; role: string };

const ACADEMIC: Array<{
  label: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { label: "Levels", href: "/admin-levels", icon: "layers-outline" },
  { label: "Grades", href: "/admin-grades", icon: "school-outline" },
  { label: "Students & Progress", href: "/admin-schools", icon: "people-outline" },
  { label: "Reports", href: "/admin-reports", icon: "bar-chart-outline" },
];

const SUBSCRIPTION_MGMT: Array<{
  label: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    label: "Subscription Plans",
    href: "/admin-subscription-plans",
    icon: "pricetag-outline",
  },
  { label: "Payments", href: "/admin-payments", icon: "card-outline" },
  { label: "Child seats", href: "/admin-seats", icon: "people-outline" },
  { label: "Subscriptions overview", href: "/subscription", icon: "diamond-outline" },
];

const OPERATIONS: Array<{
  label: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  { label: "Schools", href: "/admin-schools", icon: "business-outline" },
  { label: "Devices", href: "/devices", icon: "phone-portrait-outline" },
  {
    label: "Parent device sessions",
    href: "/admin-parent-devices",
    icon: "phone-portrait-outline",
  },
  { label: "Super Admin", href: "/super-admin", icon: "shield-checkmark-outline" },
];

const COMPLIANCE: Array<{
  label: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
}> = [
  {
    label: "Privacy & Compliance",
    href: "/admin-privacy",
    icon: "document-text-outline",
  },
  { label: "Change password", href: "/change-password", icon: "key-outline" },
];

export default function AdminSettingsScreen() {
  const router = useRouter();
  const [user, setUser] = useState<AuthUser | null>(null);

  useFocusEffect(
    useCallback(() => {
      void getUser<AuthUser>().then(setUser);
    }, [])
  );

  async function logout() {
    await clearSession();
    router.replace("/login");
  }

  function renderLinks(
    links: Array<{ label: string; href: string; icon: keyof typeof Ionicons.glyphMap }>
  ) {
    return links.map((link) => {
      if (link.href === "/super-admin" && user?.role !== "SUPER_ADMIN") {
        return null;
      }
      if (
        link.href === "/admin-privacy" &&
        user?.role !== "ADMIN" &&
        user?.role !== "SUPER_ADMIN"
      ) {
        return null;
      }
      return (
        <Pressable
          key={`${link.href}-${link.label}`}
          onPress={() => router.push(link.href as never)}
          style={({ pressed }) => [
            styles.row,
            shadow.soft,
            { opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <View style={styles.rowIcon}>
            <Ionicons name={link.icon} size={20} color={adminColors.primary} />
          </View>
          <Text style={styles.rowLabel}>{link.label}</Text>
          <Ionicons name="chevron-forward" size={18} color={adminColors.textSecondary} />
        </Pressable>
      );
    });
  }

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.title}>More</Text>
          <Text style={styles.sub}>Students, operations and account</Text>
        </View>

        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.profile, shadow.soft]}>
            <View style={styles.avatar}>
              <Ionicons name="person" size={22} color={adminColors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{user?.name ?? "Admin"}</Text>
              <Text style={styles.email}>{user?.email ?? ""}</Text>
              <Text style={styles.role}>{user?.role ?? ""}</Text>
            </View>
          </View>

          <Text style={styles.section}>Academic Setup</Text>
          {renderLinks(ACADEMIC)}

          <Text style={styles.section}>Subscription Management</Text>
          {renderLinks(SUBSCRIPTION_MGMT)}

          <Text style={styles.section}>Operations</Text>
          {renderLinks(OPERATIONS)}

          <Text style={styles.section}>Settings</Text>
          {renderLinks(COMPLIANCE)}

          <PrimaryButton label="Log out" color="#EF4444" onPress={() => void logout()} />
          <Text style={styles.note}>
            Logging out does not release registered child devices.
          </Text>
        </ScrollView>

        <AdminTabBar />
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: adminColors.background },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 4 },
  title: { fontSize: 24, fontWeight: "800", color: adminColors.text },
  sub: { color: adminColors.textSecondary, fontSize: 14 },
  content: { padding: 16, gap: 10, paddingBottom: 28 },
  profile: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
    backgroundColor: adminColors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: adminColors.border,
    padding: 14,
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
  },
  name: { fontWeight: "800", fontSize: 16, color: adminColors.text },
  email: { color: adminColors.textSecondary, fontSize: 13, marginTop: 2 },
  role: { color: adminColors.primary, fontWeight: "700", fontSize: 12, marginTop: 4 },
  section: {
    marginTop: 8,
    fontWeight: "800",
    color: adminColors.text,
    fontSize: 15,
  },
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
    minHeight: 52,
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#EDE9FE",
    alignItems: "center",
    justifyContent: "center",
  },
  rowLabel: { flex: 1, fontWeight: "700", color: adminColors.text, fontSize: 15 },
  note: { color: adminColors.textSecondary, fontSize: 12, lineHeight: 18 },
});
