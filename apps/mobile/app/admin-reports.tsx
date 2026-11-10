import { useCallback, useMemo, useState } from "react";
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
import { AdminRevenueChart } from "../components/admin/AdminRevenueChart";
import { dash } from "../components/admin/dashboardTheme";
import { AuthGate } from "../components/AuthGate";
import { ErrorText, LoadingSlot } from "../components/ui";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";

type PaymentRow = {
  amountCents: number;
  currency: string;
  status: string;
  createdAt: string;
};

function formatMoney(amountMinor: number, currency: string) {
  const major = amountMinor / 100;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 0,
    }).format(major);
  } catch {
    return `₹${major.toFixed(0)}`;
  }
}

function sumSucceeded(rows: PaymentRow[], from: Date, to = new Date()) {
  return rows
    .filter((p) => {
      if (p.status !== "SUCCEEDED" || !p.createdAt) return false;
      const t = new Date(p.createdAt).getTime();
      return t >= from.getTime() && t <= to.getTime();
    })
    .reduce((n, p) => n + (p.amountCents ?? 0), 0);
}

/**
 * Reports tab — no dedicated reports API yet.
 * Shows live revenue analytics from payments (real data only).
 */
export default function AdminReportsScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payments, setPayments] = useState<PaymentRow[]>([]);

  const load = useCallback(async () => {
    const data = await apiRequest<PaymentRow[]>("/payments/admin?take=100");
    setPayments(data);
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

  const currency = payments.find((p) => p.currency)?.currency || "INR";

  const revenue = useMemo(() => {
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const weekStart = new Date(dayStart);
    weekStart.setDate(weekStart.getDate() - 6);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);
    const daily = sumSucceeded(payments, dayStart, now);
    const weekly = sumSucceeded(payments, weekStart, now);
    const monthly = sumSucceeded(payments, monthStart, now);
    const yearly = sumSucceeded(payments, yearStart, now);
    const total = payments
      .filter((p) => p.status === "SUCCEEDED")
      .reduce((n, p) => n + p.amountCents, 0);
    const pending = payments
      .filter((p) => p.status === "PENDING")
      .reduce((n, p) => n + p.amountCents, 0);
    const points = [];
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(dayStart);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      points.push({
        label: d.toLocaleDateString(undefined, { weekday: "short" }).slice(0, 2),
        amountMinor: sumSucceeded(payments, d, new Date(next.getTime() - 1)),
      });
    }
    return {
      daily: formatMoney(daily, currency),
      weekly: formatMoney(weekly, currency),
      monthly: formatMoney(monthly, currency),
      yearly: formatMoney(yearly, currency),
      total: formatMoney(total, currency),
      pending: formatMoney(pending, currency),
      points,
    };
  }, [payments, currency]);

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
              No dedicated Admin reports endpoint exists yet. This screen shows revenue
              derived from `GET /payments/admin` only — no fabricated KPIs.
            </Text>
          </View>

          {!loading ? (
            <AdminRevenueChart
              points={revenue.points}
              currency={currency}
              daily={revenue.daily}
              weekly={revenue.weekly}
              monthly={revenue.monthly}
              yearly={revenue.yearly}
              total={revenue.total}
              pending={revenue.pending}
            />
          ) : null}
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
