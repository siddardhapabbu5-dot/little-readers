import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { dash } from "./admin/dashboardTheme";

type TabKey = "dashboard" | "schools" | "payments" | "reports" | "settings";

const TABS: Array<{
  key: TabKey;
  label: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}> = [
  { key: "dashboard", label: "Dashboard", href: "/admin", icon: "home-outline", iconActive: "home" },
  { key: "schools", label: "Schools", href: "/admin-schools", icon: "business-outline", iconActive: "business" },
  { key: "payments", label: "Payments", href: "/admin-payments", icon: "card-outline", iconActive: "card" },
  { key: "reports", label: "Reports", href: "/admin-reports", icon: "bar-chart-outline", iconActive: "bar-chart" },
  { key: "settings", label: "Settings", href: "/admin-settings", icon: "settings-outline", iconActive: "settings" },
];

function activeKey(pathname: string | null): TabKey {
  const path = pathname ?? "";
  if (path.includes("admin-schools")) return "schools";
  if (path.includes("admin-payments")) return "payments";
  if (path.includes("admin-reports")) return "reports";
  if (path.includes("admin-settings")) return "settings";
  return "dashboard";
}

export function AdminTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const current = activeKey(pathname);
  const bottom = Platform.OS === "web" ? 8 : Math.max(insets.bottom, 6);

  return (
    <View style={[styles.wrap, { paddingBottom: bottom }]}>
      <View style={styles.bar}>
        {TABS.map((tab) => {
          const focused = current === tab.key;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={tab.label}
              onPress={() => {
                if (!focused) router.replace(tab.href as never);
              }}
              style={styles.item}
            >
              {focused ? (
                <LinearGradient
                  colors={[dash.headerStart, dash.headerEnd]}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.pill}
                >
                  <Ionicons name={tab.iconActive} size={20} color="#fff" />
                </LinearGradient>
              ) : (
                <View style={styles.iconPlain}>
                  <Ionicons name={tab.icon} size={22} color={dash.textSoft} />
                </View>
              )}
              <Text style={[styles.label, focused && styles.labelOn]} numberOfLines={1}>
                {tab.label}
              </Text>
              <View style={[styles.underline, focused && styles.underlineOn]} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EDE9FE",
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: -3 },
    elevation: 10,
  },
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-around",
    paddingTop: 8,
  },
  item: {
    flex: 1,
    alignItems: "center",
    gap: 3,
    minHeight: 52,
    paddingHorizontal: 2,
  },
  pill: {
    width: 44,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  iconPlain: {
    width: 44,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 10,
    lineHeight: 13,
    fontWeight: "600",
    color: dash.textSoft,
    textAlign: "center",
  },
  labelOn: {
    color: dash.purple,
    fontWeight: "800",
  },
  underline: {
    marginTop: 3,
    width: 18,
    height: 3,
    borderRadius: 2,
    backgroundColor: "transparent",
  },
  underlineOn: {
    backgroundColor: dash.purple,
  },
});
