import { useCallback, useState } from "react";
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AdminTabBar } from "../components/AdminTabBar";
import { AdminRevenueChart, type RevenueSummary } from "../components/admin/AdminRevenueChart";
import { dash } from "../components/admin/dashboardTheme";
import { AuthGate } from "../components/AuthGate";
import { ErrorText, LoadingSlot } from "../components/ui";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";

/**
 * Reports tab — revenue analytics from `GET /payments/admin/revenue` (real data only).
 */
export default function AdminReportsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revenue, setRevenue] = useState<RevenueSummary | null>(null);

  const load = useCallback(async () => {
    setRevenue(await apiRequest<RevenueSummary>("/payments/admin/revenue"));
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          await load();
        } catch (e) {
          setError(e instanceof ApiError ? e.message : "Could not load reports");
        } finally {
          setLoading(false);
        }
      })();
    }, [load])
  );

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Reports</Text>
          <Text style={styles.sub}>Live payment analytics · platform reports API pending</Text>
        </View>

        <LoadingSlot active={loading} color={dash.purple} />
        {error ? (
          <View style={{ paddingHorizontal: 16 }}>
            <ErrorText>{error}</ErrorText>
          </View>
        ) : null}

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void load()
                  .catch((e) =>
                    setError(e instanceof ApiError ? e.message : "Refresh failed")
                  )
                  .finally(() => setRefreshing(false));
              }}
            />
          }
        >
          <View style={styles.note}>
            <Ionicons name="information-circle" size={18} color={dash.blue} />
            <Text style={styles.noteText}>
              Revenue is totalled on the server from every payment record, per currency, using
              India time. No fabricated KPIs.
            </Text>
          </View>

          {!loading && revenue ? <AdminRevenueChart summary={revenue} /> : null}
        </ScrollView>

        <AdminTabBar />
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: dash.pageBg },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 8, gap: 4 },
  title: { fontSize: 24, fontWeight: "800", color: dash.text },
  sub: { color: dash.textMuted, fontSize: 13 },
  content: { padding: 16, gap: 12, paddingBottom: 24 },
  note: {
    flexDirection: "row",
    gap: 8,
    backgroundColor: dash.blueSoft,
    borderRadius: 14,
    padding: 12,
    alignItems: "flex-start",
  },
  noteText: { flex: 1, color: dash.text, fontSize: 12, lineHeight: 18 },
});
