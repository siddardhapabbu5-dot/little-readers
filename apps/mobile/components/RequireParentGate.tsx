import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ParentGateModal } from "./ParentGateModal";
import { isParentGateUnlocked, subscribeParentGate } from "../services/parent-gate";
import { getUser } from "../services/secure";
import { colors } from "../theme";

/**
 * Blocks PARENT users from adult tools until the Parent PIN is verified.
 * Re-checked on every focus and whenever the gate locks, so Back/Forward,
 * direct URLs, refresh and stale screens never show content while locked.
 * Admin / Super Admin / School Admin bypass — not student guardians.
 */
export function RequireParentGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [needsGate, setNeedsGate] = useState(false);
  const [unlocked, setUnlocked] = useState(isParentGateUnlocked);
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const user = await getUser<{ role: string }>();
      if (!alive) return;
      setNeedsGate(user?.role === "PARENT");
      setChecking(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => subscribeParentGate(() => setUnlocked(isParentGateUnlocked())), []);

  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      setUnlocked(isParentGateUnlocked());
      return () => setFocused(false);
    }, [])
  );

  if (checking) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.primary} />
        <Text style={styles.hint}>Checking parent security…</Text>
      </View>
    );
  }

  if (needsGate && !unlocked) {
    return (
      <View style={styles.center}>
        <Text style={styles.hint}>Parent PIN required for family tools.</Text>
        {/* A screen left mounted underneath (e.g. parent → Learn) must not overlay the kids zone. */}
        <ParentGateModal
          visible={focused}
          onClose={() => router.replace("/(tabs)/home")}
          onUnlocked={() => setUnlocked(true)}
        />
      </View>
    );
  }

  return <>{children}</>;
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.bg,
    padding: 24,
    gap: 12,
  },
  hint: { color: colors.textMuted, fontWeight: "700", textAlign: "center" },
});
