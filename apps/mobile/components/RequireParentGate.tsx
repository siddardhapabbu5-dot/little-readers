import { useEffect, useState, type ReactNode } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import {
  ParentGateModal,
  isParentGateUnlocked,
} from "./ParentGateModal";
import { getUser } from "../services/secure";
import { colors } from "../theme";

/**
 * Blocks PARENT users from adult tools until Parent PIN unlocks (or is set).
 * Admin / Super Admin / School Admin bypass — not student guardians.
 */
export function RequireParentGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [needsGate, setNeedsGate] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  useEffect(() => {
    void (async () => {
      const user = await getUser<{ role: string }>();
      const isParent = user?.role === "PARENT";
      if (!isParent) {
        setNeedsGate(false);
        setUnlocked(true);
        setChecking(false);
        return;
      }
      setNeedsGate(true);
      setUnlocked(isParentGateUnlocked());
      setChecking(false);
    })();
  }, []);

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
        <ParentGateModal
          visible
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
