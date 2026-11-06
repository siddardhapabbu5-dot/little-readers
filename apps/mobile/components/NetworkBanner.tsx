import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { API_URL } from "../services/api";
import {
  probeApiReachable,
  subscribeNetwork,
} from "../services/network";

/**
 * Non-blocking connectivity banner. Does not enable offline play or sync.
 */
export function NetworkBanner() {
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const unsub = subscribeNetwork(setOnline);
    void probeApiReachable(`${API_URL}/health`);
    const id = setInterval(() => {
      void probeApiReachable(`${API_URL}/health`);
    }, 45_000);
    return () => {
      unsub();
      clearInterval(id);
    };
  }, []);

  if (online) return null;

  return (
    <View style={[styles.banner, { paddingTop: Math.max(insets.top, 8) }]}>
      <Text style={styles.title}>No connection</Text>
      <Text style={styles.body}>
        Learning requires internet. Progress and rewards are saved only after
        the server confirms each answer — nothing is queued offline.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "#7F1D1D",
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 4,
  },
  title: {
    color: "#fff",
    fontWeight: "800",
    fontSize: 14,
  },
  body: {
    color: "#FECACA",
    fontSize: 12,
    lineHeight: 16,
  },
});
