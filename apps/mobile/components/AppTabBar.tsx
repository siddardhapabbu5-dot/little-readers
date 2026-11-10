import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, shadow } from "../theme";

const ICONS: Record<string, string> = {
  home: "🏠",
  learn: "📚",
  games: "🎮",
  rewards: "🏆",
  profile: "🙂",
};

const TINTS: Record<string, string> = {
  home: colors.skySoft,
  learn: colors.primarySoft,
  games: colors.greenSoft,
  rewards: colors.yellowSoft,
  profile: colors.pinkSoft,
};

export function AppTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 10);

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
              accessibilityLabel={label}
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
              <View
                style={[
                  styles.iconWrap,
                  focused ? { backgroundColor: TINTS[route.name] ?? colors.primarySoft } : null,
                ]}
              >
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
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
  },
  bar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    paddingTop: 10,
    minHeight: 62,
  },
  item: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    paddingHorizontal: 2,
    minHeight: 52,
  },
  iconWrap: {
    width: 48,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  icon: {
    fontSize: 22,
    lineHeight: 26,
    textAlign: "center",
    opacity: 0.5,
  },
  iconOn: {
    opacity: 1,
  },
  label: {
    fontSize: 12,
    lineHeight: 15,
    fontWeight: "800",
    color: colors.tabInactive,
    includeFontPadding: false,
    textAlign: "center",
  },
  labelOn: {
    color: colors.primary,
  },
});
