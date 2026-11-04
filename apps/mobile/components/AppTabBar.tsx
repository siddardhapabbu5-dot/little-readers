import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, shadow } from "../theme";

const ICONS: Record<string, string> = {
  home: "🏠",
  learn: "🎓",
  games: "🎮",
  rewards: "⭐",
  profile: "👤",
};

export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottom = Platform.OS === "web" ? 10 : Math.max(insets.bottom, 10);

  return (
    <View style={[styles.wrap, { paddingBottom: bottom }, shadow.tab]}>
      <View style={styles.bar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const { options } = descriptors[route.key];
          const label =
            typeof options.tabBarLabel === "string"
              ? options.tabBarLabel
              : options.title ?? route.name;
          const emoji = ICONS[route.name] ?? "•";

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityState={focused ? { selected: true } : {}}
              onPress={() => {
                const event = navigation.emit({
                  type: "tabPress",
                  target: route.key,
                  canPreventDefault: true,
                });
                if (!focused && !event.defaultPrevented) {
                  navigation.navigate(route.name, route.params);
                }
              }}
              style={styles.item}
            >
              <View style={[styles.iconWrap, focused ? styles.iconWrapOn : null]}>
                <Text style={[styles.icon, focused ? styles.iconOn : null]}>{emoji}</Text>
              </View>
              <Text style={[styles.label, focused ? styles.labelOn : null]} numberOfLines={1}>
                {label}
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
    paddingTop: 10,
    minHeight: 58,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    paddingHorizontal: 2,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  iconWrapOn: {
    backgroundColor: colors.primarySoft,
  },
  icon: {
    fontSize: 20,
    lineHeight: 24,
    textAlign: "center",
    opacity: 0.55,
  },
  iconOn: {
    opacity: 1,
  },
  label: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: "700",
    color: colors.tabInactive,
    includeFontPadding: false,
    textAlign: "center",
  },
  labelOn: {
    color: colors.primary,
  },
});
