import { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { dash } from "./dashboardTheme";

function Pulse({ style }: { style?: object }) {
  const opacity = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);
  return <Animated.View style={[styles.block, style, { opacity }]} />;
}

export function AdminStatsSkeleton() {
  return (
    <View style={styles.grid}>
      {[0, 1, 2, 3].map((i) => (
        <View key={i} style={styles.card}>
          <Pulse style={styles.circle} />
          <Pulse style={styles.lineLg} />
          <Pulse style={styles.lineSm} />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 12 },
  card: {
    width: "48%",
    backgroundColor: dash.card,
    borderRadius: 22,
    padding: 16,
    gap: 10,
    minHeight: 120,
  },
  block: { backgroundColor: "#E9E5FF", borderRadius: 10 },
  circle: { width: 40, height: 40, borderRadius: 20 },
  lineLg: { height: 22, width: "55%", borderRadius: 8 },
  lineSm: { height: 12, width: "70%", borderRadius: 6 },
});
