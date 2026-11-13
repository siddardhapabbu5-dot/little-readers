import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { usePathname, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, shadow } from "../theme";

type TabKey = "home" | "progress" | "plan" | "account";

const TABS: Array<{
  key: TabKey;
  label: string;
  emoji: string;
  href: string;
  match: (path: string) => boolean;
}> = [
  {
    key: "home",
    label: "Home",
    emoji: "🏠",
    href: "/parent",
    match: (p) => p === "/parent" || p.endsWith("/parent"),
  },
  {
    key: "progress",
    label: "Progress",
    emoji: "📊",
    href: "/parent",
    match: (p) => p.includes("/child/") && p.includes("progress"),
  },
  {
    key: "plan",
    label: "Plan",
    emoji: "💎",
    href: "/subscription",
    match: (p) => p.includes("subscription"),
  },
  {
    key: "account",
    label: "Account",
    emoji: "👤",
    href: "/devices",
    match: (p) =>
      p.includes("devices") ||
      p.includes("privacy") ||
      p.includes("agreements") ||
      p.includes("(tabs)/profile"),
  },
];

type Props = {
  /** When Progress is tapped, open this child's progress if known. */
  activeChildId?: string | null;
};

export function ParentBottomNav({ activeChildId }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const path = pathname ?? "";
  const bottom = Platform.OS === "web" ? Math.max(insets.bottom, 8) : Math.max(insets.bottom, 6);

  const current: TabKey =
    TABS.find((t) => t.key !== "home" && t.match(path))?.key ??
    (TABS[0].match(path) ? "home" : "home");

  function go(tab: (typeof TABS)[number]) {
    if (tab.key === "progress") {
      if (activeChildId) {
        router.push(`/child/${activeChildId}?tab=progress` as never);
      } else {
        router.push("/parent" as never);
      }
      return;
    }
    if (tab.key === "home") {
      router.push("/parent" as never);
      return;
    }
    router.push(tab.href as never);
  }

  return (
    <View style={[styles.wrap, { paddingBottom: bottom }, shadow.tab]}>
      <View style={styles.bar}>
        {TABS.map((tab) => {
          const focused = current === tab.key;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="button"
              accessibilityLabel={tab.label}
              accessibilityState={focused ? { selected: true } : {}}
              onPress={() => go(tab)}
              style={styles.item}
            >
              <View
                style={[
                  styles.iconWrap,
                  focused ? { backgroundColor: colors.primarySoft } : null,
                ]}
              >
                <Text style={styles.emoji}>{tab.emoji}</Text>
              </View>
              <Text style={[styles.label, focused ? styles.labelOn : null]} numberOfLines={1}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 8,
    minHeight: 58,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    minHeight: 48,
  },
  iconWrap: {
    width: 44,
    height: 34,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  emoji: { fontSize: 18 },
  label: {
    fontSize: 11,
    fontWeight: "700",
    color: colors.tabInactive,
  },
  labelOn: { color: colors.primary, fontWeight: "900" },
});
