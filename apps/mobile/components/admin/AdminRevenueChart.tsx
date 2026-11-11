import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { dash } from "./dashboardTheme";

export type CurrencyRevenue = {
  daily: number;
  weekly: number;
  monthly: number;
  yearly: number;
  total: number;
  succeededCount: number;
  pending: number;
  pendingCount: number;
  stalePendingCount: number;
  points: Array<{ date: string; amountMinor: number }>;
};

/** `GET /payments/admin/revenue` — totals over every payment row, per currency, India time. */
export type RevenueSummary = {
  timezone: string;
  generatedAt: string;
  currencies: Record<string, CurrencyRevenue>;
};

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function formatMinor(amountMinor: number, currency: string) {
  const major = amountMinor / 100;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits: major % 1 === 0 ? 0 : 2,
    }).format(major);
  } catch {
    return `${currency} ${major.toFixed(2)}`;
  }
}

function weekday(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
}

/** Lightweight bar chart — no extra chart dependency required. */
export function AdminRevenueChart({ summary }: { summary: RevenueSummary }) {
  const inr = summary.currencies.INR;
  const php = summary.currencies.PHP;
  const max = Math.max(1, ...inr.points.map((p) => p.amountMinor));
  const stale = Object.values(summary.currencies).reduce((n, c) => n + c.stalePendingCount, 0);

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Revenue Analytics</Text>
      <Text style={styles.hint}>
        Successful payments, all records · days in India time · pending = checkouts started in the
        last 24 h
      </Text>

      <CurrencyKpis data={inr} currency="INR" />

      <View style={styles.chart}>
        {inr.points.map((p) => {
          const h = p.amountMinor > 0 ? Math.max(6, Math.round((p.amountMinor / max) * 88)) : 0;
          return (
            <View key={p.date} style={styles.barCol}>
              <Text style={styles.barValue} numberOfLines={1}>
                {p.amountMinor > 0 ? formatMinor(p.amountMinor, "INR") : "—"}
              </Text>
              <View style={styles.barTrack}>
                {h > 0 ? (
                  <LinearGradient
                    colors={[dash.headerStart, dash.headerEnd]}
                    style={[styles.barFill, { height: h }]}
                  />
                ) : (
                  <View style={styles.barEmpty} />
                )}
              </View>
              <Text style={styles.barLabel}>{weekday(p.date)}</Text>
            </View>
          );
        })}
      </View>

      {php ? (
        <>
          <Text style={styles.subheading}>Philippines (₱) — separate, not added to ₹</Text>
          <CurrencyKpis data={php} currency="PHP" />
        </>
      ) : null}

      {stale > 0 ? (
        <Text style={styles.hint}>
          {stale} checkout{stale === 1 ? "" : "s"} left unpaid for over 24 h (abandoned) — not counted
          as pending.
        </Text>
      ) : null}
    </View>
  );
}

function CurrencyKpis({ data, currency }: { data: CurrencyRevenue; currency: string }) {
  return (
    <View style={styles.kpiGrid}>
      <Kpi label="Today" value={formatMinor(data.daily, currency)} />
      <Kpi label="Last 7 days" value={formatMinor(data.weekly, currency)} />
      <Kpi label="This month" value={formatMinor(data.monthly, currency)} />
      <Kpi label="This year" value={formatMinor(data.yearly, currency)} />
      <Kpi
        label={`Total collections (${data.succeededCount})`}
        value={formatMinor(data.total, currency)}
      />
      <Kpi
        label={`Pending payments (${data.pendingCount})`}
        value={formatMinor(data.pending, currency)}
        muted
      />
    </View>
  );
}

function Kpi({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <View style={[styles.kpi, muted && styles.kpiMuted]}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={styles.kpiValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: dash.card,
    borderRadius: 22,
    padding: 16,
    gap: 12,
    shadowColor: "#4C1D95",
    shadowOpacity: 0.07,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },
  heading: { fontSize: 17, fontWeight: "800", color: dash.text },
  subheading: { fontSize: 13, fontWeight: "800", color: dash.text, marginTop: 4 },
  hint: { fontSize: 11, color: dash.textSoft, marginTop: -6 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpi: {
    width: "48%",
    backgroundColor: dash.pageBg,
    borderRadius: 14,
    padding: 10,
    gap: 4,
  },
  kpiMuted: { backgroundColor: "#FFF7ED" },
  kpiLabel: { fontSize: 11, fontWeight: "600", color: dash.textMuted },
  kpiValue: { fontSize: 15, fontWeight: "800", color: dash.text },
  chart: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 6,
    minHeight: 130,
    paddingTop: 8,
  },
  barCol: { flex: 1, alignItems: "center", gap: 4 },
  barTrack: {
    width: "100%",
    height: 96,
    justifyContent: "flex-end",
    alignItems: "center",
  },
  barFill: {
    width: "70%",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  barEmpty: { width: "70%", height: 2, borderRadius: 1, backgroundColor: dash.pageBg },
  barLabel: { fontSize: 10, fontWeight: "700", color: dash.textMuted },
  barValue: { fontSize: 8, color: dash.textSoft, height: 12 },
});
