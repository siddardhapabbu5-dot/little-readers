import { useCallback, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { AuthGate } from "../components/AuthGate";
import { RequireParentGate } from "../components/RequireParentGate";
import { SoftButton } from "../components/ui";
import { ROLE_SETS } from "../services/auth-errors";
import { resolveSubscriptionEntryHref } from "../services/subscription-entry";
import { colors } from "../theme";

/**
 * Dashboard / Profile → Subscription entry for parents.
 * Parent PIN (RequireParentGate) runs first, then branches:
 * incomplete setup → /child-setup (Grade → Learning Phone)
 * complete / renewal → /subscription (status + plan → agreements → pay → receipt)
 */
export default function SubscriptionEntryScreen() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      setError(null);
      void (async () => {
        try {
          const href = await resolveSubscriptionEntryHref();
          if (!alive) return;
          router.replace(href as never);
        } catch {
          if (!alive) return;
          setError("Could not open subscription. Try again.");
        }
      })();
      return () => {
        alive = false;
      };
    }, [router])
  );

  return (
    <AuthGate roles={ROLE_SETS.parentFamily}>
      <RequireParentGate>
        <SafeAreaView style={styles.safe}>
          <View style={styles.center}>
            {error ? (
              <>
                <Text style={styles.error}>{error}</Text>
                <SoftButton
                  label="Try again"
                  onPress={() => {
                    setError(null);
                    void resolveSubscriptionEntryHref()
                      .then((href) => router.replace(href as never))
                      .catch(() => setError("Could not open subscription. Try again."));
                  }}
                />
                <SoftButton label="← Back" onPress={() => router.back()} />
              </>
            ) : (
              <>
                <ActivityIndicator color={colors.primary} size="large" />
                <Text style={styles.hint}>Opening subscription…</Text>
              </>
            )}
          </View>
        </SafeAreaView>
      </RequireParentGate>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 24,
  },
  hint: { color: colors.textMuted, fontWeight: "700" },
  error: { color: colors.danger, fontWeight: "700", textAlign: "center" },
});
