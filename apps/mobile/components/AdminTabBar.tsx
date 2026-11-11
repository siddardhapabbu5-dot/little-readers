import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { dash } from "./admin/dashboardTheme";

type TabKey = "dashboard" | "structure" | "vocabulary" | "lessons" | "more";

const TABS: Array<{
  key: TabKey;
  label: string;
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
}> = [
  { key: "dashboard", label: "Dashboard", href: "/admin", icon: "home-outline", iconActive: "home" },
  {
    key: "structure",
    label: "Structure",
    href: "/admin-structure",
    icon: "layers-outline",
    iconActive: "layers",
  },
  {
    key: "vocabulary",
    label: "Vocabulary",
    href: "/admin-vocabulary",
    icon: "book-outline",
    iconActive: "book",
  },
  {
    key: "lessons",
    label: "Lessons",
    href: "/admin-lessons",
    icon: "school-outline",
    iconActive: "school",
  },
  {
    key: "more",
    label: "More",
    href: "/admin-settings",
    icon: "menu-outline",
    iconActive: "menu",
  },
];

function activeKey(pathname: string | null): TabKey {
  const path = pathname ?? "";
  if (path.includes("admin-structure") || path.includes("admin-curriculum")) return "structure";
  if (
    path.includes("admin-vocabulary") ||
    path.includes("admin-dictionary") ||
    path.includes("admin-words") ||
    path.includes("admin-programme")
  ) {
    return "vocabulary";
  }
  if (path.includes("admin-lessons")) return "lessons";
  if (
    path.includes("admin-settings") ||
    path.includes("admin-privacy") ||
    path.includes("admin-schools") ||
    path.includes("admin-payments") ||
    path.includes("admin-reports") ||
    path.includes("admin-seats")
  ) {
    return "more";
  }
  return "dashboard";
}

export function AdminTabBar() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const current = activeKey(pathname);
  const bottom = Platform.OS === "web" ? Math.max(insets.bottom, 8) : Math.max(insets.bottom, 6);

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
