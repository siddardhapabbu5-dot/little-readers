import { useCallback, useState } from "react";
import {
  ActivityIndicator,
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
import { AuthGate } from "../components/AuthGate";
import { ErrorText } from "../components/ui";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { adminColors, radii, shadow } from "../theme";

type PaymentRow = {
  id: string;
  amountCents: number;
  currency: string;
  status: string;
  purpose?: string | null;
  createdAt: string;
  user?: { name?: string; email?: string };
};

function formatMoney(amountMinor: number, currency: string) {
  const major = amountMinor / 100;
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "INR",
    }).format(major);
  } catch {
    return `${currency || "INR"} ${major.toFixed(2)}`;
  }
}

export default function AdminPaymentsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<PaymentRow[]>([]);

  const load = useCallback(async () => {
    const data = await apiRequest<PaymentRow[]>("/payments/admin?take=100");
    setRows(data);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setLoading(true);
        setError(null);
        try {
          await load();
        } catch (e) {
          setError(e instanceof ApiError ? e.message : "Could not load payments");
        } finally {
          setLoading(false);
        }
      })();
    }, [load])
  );

  async function onRefresh() {
    setRefreshing(true);
    setError(null);
    try {
      await load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not load payments");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <AuthGate roles={ROLE_SETS.admin}>
      <SafeAreaView style={styles.safe} edges={["top"]}>
        <View style={styles.header}>
          <Text style={styles.title}>Payments</Text>
          <Text style={styles.sub}>Live records from the payments API</Text>
        </View>

        {loading ? (
          <ActivityIndicator color={adminColors.primary} style={{ marginTop: 24 }} />
        ) : null}
        {error ? (
          <View style={{ paddingHorizontal: 20 }}>
            <ErrorText>{error}</ErrorText>
          </View>
        ) : null}

        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} />
          }
        >
          {!loading && !rows.length ? (
            <View style={[styles.card, shadow.soft]}>
              <Text style={styles.empty}>No payment records yet.</Text>
            </View>
          ) : null}

          {rows.map((p) => (
            <View key={p.id} style={[styles.card, shadow.soft]}>
              <View style={styles.rowTop}>
                <View style={styles.iconBubble}>
                  <Ionicons name="card" size={18} color={adminColors.payments} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.amount}>
                    {formatMoney(p.amountCents, p.currency)}
                  </Text>
                  <Text style={styles.meta}>
                    {p.user?.name ?? p.user?.email ?? "—"}
                    {p.purpose ? ` · ${p.purpose}` : ""}
                  </Text>
                </View>
                <View
                  style={[
                    styles.badge,
                    p.status === "SUCCEEDED"
                      ? styles.badgeOk
                      : p.status === "FAILED" || p.status === "REFUNDED"
                        ? styles.badgeBad
                        : styles.badgePending,
                  ]}
                >
                  <Text style={styles.badgeText}>{p.status}</Text>
                </View>
              </View>
              <Text style={styles.date}>
                {p.createdAt ? new Date(p.createdAt).toLocaleString() : ""}
              </Text>
            </View>
          ))}
        </ScrollView>

        <AdminTabBar />
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: adminColors.background },
  header: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 4 },
  title: { fontSize: 24, fontWeight: "800", color: adminColors.text },
  sub: { color: adminColors.textSecondary, fontSize: 14 },
  content: { padding: 16, gap: 10, paddingBottom: 24 },
  card: {
    backgroundColor: adminColors.card,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: adminColors.border,
    padding: 14,
    gap: 8,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  iconBubble: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: adminColors.paymentsSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  amount: { fontSize: 17, fontWeight: "800", color: adminColors.text },
  meta: { color: adminColors.textSecondary, fontSize: 13, marginTop: 2 },
  date: { color: adminColors.textSecondary, fontSize: 12 },
  badge: {
    borderRadius: radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeOk: { backgroundColor: adminColors.studentsSoft },
  badgeBad: { backgroundColor: "#FEE2E2" },
  badgePending: { backgroundColor: adminColors.paymentsSoft },
  badgeText: { fontSize: 11, fontWeight: "800", color: adminColors.text },
  empty: { color: adminColors.textSecondary, textAlign: "center" },
});
