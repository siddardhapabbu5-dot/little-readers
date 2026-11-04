import { useCallback, useState } from "react";
import { Linking, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, SoftButton, Title } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { getUser } from "../services/secure";
import { colors } from "../theme";

type Plan = {
  purpose: string;
  label: string;
  description: string;
  totalPaise: number;
  currency: string;
  seatsPurchased: number;
  includedSeats: number;
};

type Catalog = {
  enabled: boolean;
  plans: Plan[];
  note: string | null;
};

type Pay = {
  id: string;
  purpose: string;
  status: string;
  amountCents: number;
  currency: string;
  provider: string;
  seatsPurchased: number;
  createdAt: string;
  paidAt: string | null;
};

const WEB_CHECKOUT =
  process.env.EXPO_PUBLIC_WEB_APP_URL?.replace(/\/$/, "") || "http://localhost:3100";

export default function SubscriptionScreen() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [payments, setPayments] = useState<Pay[]>([]);
  const [adminList, setAdminList] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          const me = await apiRequest("/subscriptions/me");
          setData(me);
          const [plans, history] = await Promise.all([
            apiRequest<Catalog>("/payments/plans").catch(() => null),
            apiRequest<Pay[]>("/payments/me").catch(() => []),
          ]);
          if (plans) setCatalog(plans);
          setPayments(history);
          const user = await getUser<{ role: string }>();
          if (user?.role === "ADMIN" || user?.role === "SUPER_ADMIN") {
            setAdminList(await apiRequest("/subscriptions/admin"));
          }
          setError(null);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Failed");
        }
      })();
    }, [])
  );

  const sub = data?.subscription;

  async function openWebCheckout() {
    const url = `${WEB_CHECKOUT}/parent/checkout`;
    await Linking.openURL(url);
  }

  return (
    <AuthGate roles={ROLE_SETS.parentFamily}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <SoftButton label="← Back" onPress={() => router.back()} />
          <Title>Subscription</Title>
          <ErrorText>{error}</ErrorText>

          <Card style={{ gap: 8 }}>
            {sub ? (
              <>
                <Row label="Plan" value={sub.plan} />
                <Row label="Status" value={sub.status} />
                <Row label="Started" value={new Date(sub.startedAt).toLocaleDateString()} />
                <Row label="Expires" value={new Date(sub.expiresAt).toLocaleDateString()} />
                <Text
                  style={{
                    marginTop: 8,
                    fontWeight: "800",
                    color: data?.eligible ? colors.success : colors.danger,
                  }}
                >
                  {data?.eligible ? "Eligible for learning" : data?.reason}
                </Text>
              </>
            ) : (
              <Text>No subscription found.</Text>
            )}

            {data?.seats ? (
              <View style={{ gap: 6, marginTop: 8 }}>
                <Text style={styles.section}>Child seats</Text>
                <Row
                  label="Seats used"
                  value={`${data.seats.assigned}/${data.seats.capacity}`}
                />
                <Row label="Included" value={String(data.seats.included)} />
                <Row label="Add-on seats" value={String(data.seats.extra)} />
                <Row label="Available" value={String(data.seats.available)} />
                {(
                  data.seats.children as {
                    id: string;
                    displayName: string;
                    hasLearningSeat: boolean;
                  }[]
                )?.map((c) => (
                  <Text key={c.id} style={{ fontWeight: "700" }}>
                    {c.displayName}: {c.hasLearningSeat ? "Seat active" : "Needs seat"}
                  </Text>
                ))}
              </View>
            ) : null}

            <SoftButton label="Manage children / seats" onPress={() => router.push("/parent")} />
          </Card>

          <Card style={{ gap: 8 }} color="#EEF2FF">
            <Text style={styles.section}>Plans &amp; checkout</Text>
            {catalog?.enabled ? (
              catalog.plans.map((p) => (
                <View key={p.purpose} style={{ gap: 2, marginBottom: 6 }}>
                  <Text style={{ fontWeight: "800" }}>{p.label}</Text>
                  <Text style={styles.note}>
                    {p.currency} {(p.totalPaise / 100).toFixed(2)} · {p.description}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={styles.note}>
                {catalog?.note ??
                  "Checkout unavailable until plan prices and Razorpay keys are configured."}
              </Text>
            )}
            <Text style={styles.note}>
              {Platform.OS === "web"
                ? "Complete payment on the website checkout (same backend)."
                : "Store-distributed apps may require Apple/Google billing later. This build opens the website Razorpay checkout — it does not claim native IAP."}
            </Text>
            <SoftButton label="Open website checkout" onPress={() => void openWebCheckout()} />
          </Card>

          <Card style={{ gap: 8 }}>
            <Text style={styles.section}>Payment history</Text>
            {!payments.length ? (
              <Text style={styles.note}>No payments yet.</Text>
            ) : (
              payments.slice(0, 20).map((p) => (
                <Text key={p.id} style={{ fontWeight: "700" }}>
                  {p.purpose} · {p.status} · {p.currency} {(p.amountCents / 100).toFixed(2)}
                  {p.seatsPurchased ? ` · +${p.seatsPurchased} seats` : ""}
                </Text>
              ))
            )}
          </Card>

          {adminList ? (
            <View style={{ gap: 8 }}>
              <Text style={styles.section}>Admin overview</Text>
              <SoftButton
                label="Open seat grant / revoke"
                onPress={() => router.push("/admin-seats")}
              />
              {adminList.slice(0, 15).map((s) => (
                <Card key={s.id}>
                  <Text style={{ fontWeight: "700" }}>
                    {s.user?.email} · {s.plan} · {s.status}
                  </Text>
                  {s.seats ? (
                    <Text>
                      Seats {s.seats.assigned}/{s.seats.capacity} · extra {s.seats.extra}
                    </Text>
                  ) : null}
                </Card>
              ))}
            </View>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </AuthGate>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  section: { fontWeight: "800", fontSize: 16, color: colors.text },
  note: { color: colors.textMuted, lineHeight: 20 },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  label: { color: colors.textMuted, fontWeight: "600" },
  value: { color: colors.text, fontWeight: "800" },
});
