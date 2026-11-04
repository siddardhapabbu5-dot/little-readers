import { StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { dash } from "./dashboardTheme";

export type RevenuePoint = { label: string; amountMinor: number };

type Props = {
  points: RevenuePoint[];
  currency: string;
  daily: string;
  weekly: string;
  monthly: string;
  yearly: string;
  total: string;
  pending: string;
};

function formatMinor(amountMinor: number, currency: string) {
  const major = amountMinor / 100;
  try {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: currency || "INR",
      maximumFractionDigits: 0,
    }).format(major);
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(0)}`;
  }
}

/** Lightweight bar chart — no extra chart dependency required. */
export function AdminRevenueChart({
  points,
  currency,
  daily,
  weekly,
  monthly,
  yearly,
  total,
  pending,
}: Props) {
  const max = Math.max(1, ...points.map((p) => p.amountMinor));

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>Revenue Analytics</Text>
      <Text style={styles.hint}>From live payment records (SUCCEEDED / PENDING)</Text>

      <View style={styles.kpiGrid}>
        <Kpi label="Daily" value={daily} />
        <Kpi label="Weekly" value={weekly} />
        <Kpi label="Monthly" value={monthly} />
        <Kpi label="Yearly" value={yearly} />
        <Kpi label="Total collections" value={total} wide />
        <Kpi label="Pending payments" value={pending} wide muted />
      </View>

      <View style={styles.chart}>
        {points.map((p) => {
          const h = Math.max(6, Math.round((p.amountMinor / max) * 88));
          return (
            <View key={p.label} style={styles.barCol}>
              <Text style={styles.barValue} numberOfLines={1}>
                {p.amountMinor > 0 ? formatMinor(p.amountMinor, currency).replace(/\.00$/, "") : "—"}
              </Text>
              <View style={styles.barTrack}>
                <LinearGradient
                  colors={[dash.headerStart, dash.headerEnd]}
                  style={[styles.barFill, { height: h }]}
                />
              </View>
              <Text style={styles.barLabel}>{p.label}</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function Kpi({
  label,
  value,
  wide,
  muted,
}: {
  label: string;
  value: string;
  wide?: boolean;
  muted?: boolean;
}) {
  return (
    <View style={[styles.kpi, wide && styles.kpiWide, muted && styles.kpiMuted]}>
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
  hint: { fontSize: 11, color: dash.textSoft, marginTop: -6 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpi: {
    width: "48%",
    backgroundColor: dash.pageBg,
    borderRadius: 14,
    padding: 10,
    gap: 4,
  },
  kpiWide: { width: "48%" },
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
    minHeight: 6,
  },
  barLabel: { fontSize: 10, fontWeight: "700", color: dash.textMuted },
  barValue: { fontSize: 8, color: dash.textSoft, height: 12 },
});
