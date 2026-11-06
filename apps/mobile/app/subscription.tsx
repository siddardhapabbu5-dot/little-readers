import { useCallback, useState } from "react";
import {
  Alert,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, PrimaryButton, SoftButton, Title } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { getUser } from "../services/secure";
import { colors, radii, shadow } from "../theme";

type Plan = {
  purpose: string;
  label?: string;
  name?: string;
  code?: string;
  description?: string | null;
  totalPaise: number;
  amountPaise?: number;
  taxPaise?: number;
  currency: string;
  seatsPurchased?: number;
  includedSeats?: number;
  planId?: string;
  id?: string;
  durationMonths?: number;
  applicableLevel?: string;
};

function durationLabel(months?: number) {
  if (months === 1) return "Monthly";
  if (months === 3) return "3 Months";
  if (months === 6) return "6 Months";
  if (months === 12) return "1 Year";
  if (months && months > 0) return `${months} Months`;
  return "Plan";
}

/** Hide test stamps / raw codes — show a parent-friendly title. */
function planTitle(p: Plan) {
  const raw = (p.label ?? p.name ?? "").trim();
  const stripped = raw
    .replace(/\b\d{10,}\b/g, "")
    .replace(/\bL\d+\b/gi, "")
    .replace(/\b\d+mo\b/gi, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const looksTechnical =
    !stripped ||
    stripped.length < 3 ||
    /renamed/i.test(stripped) ||
    /^\d/.test(stripped);
  if (looksTechnical) return durationLabel(p.durationMonths);
  return stripped;
}

function formatInr(paise: number) {
  const rupees = paise / 100;
  return rupees % 1 === 0
    ? `₹${rupees.toLocaleString("en-IN")}`
    : `₹${rupees.toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;
}

type Catalog = {
  enabled: boolean;
  plans: Plan[];
  note: string | null;
  dbCatalog?: boolean;
};

type PublishedLevel = {
  id: string;
  code: string;
  label: string;
  startGrade: number | null;
  endGrade: number | null;
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
  process.env.EXPO_PUBLIC_WEB_APP_URL?.replace(/\/$/, "") ||
  "https://siwiapp.shop";

export default function SubscriptionScreen() {
  const router = useRouter();
  const [data, setData] = useState<any>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [levels, setLevels] = useState<PublishedLevel[]>([]);
  const [selectedLevelId, setSelectedLevelId] = useState<string | null>(null);
  const [payments, setPayments] = useState<Pay[]>([]);
  const [adminList, setAdminList] = useState<any[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          const me = await apiRequest("/subscriptions/me");
          setData(me);
          setLoadingCatalog(true);
          const [pubLevels, history] = await Promise.all([
            apiRequest<PublishedLevel[]>("/parent/catalog/levels").catch(
              () => []
            ),
            apiRequest<Pay[]>("/payments/me").catch(() => []),
          ]);
          setLevels(pubLevels);
          const levelId = selectedLevelId ?? pubLevels[0]?.id ?? undefined;
          if (!selectedLevelId && pubLevels[0]?.id) {
            setSelectedLevelId(pubLevels[0].id);
          }
          const plans = await apiRequest<Catalog>(
            `/payments/plans${levelId ? `?levelId=${levelId}` : ""}`
          ).catch(() => null);
          if (plans) setCatalog(plans);
          setPayments(history);
          const user = await getUser<{ role: string }>();
          if (user?.role === "ADMIN" || user?.role === "SUPER_ADMIN") {
            setAdminList(await apiRequest("/subscriptions/admin"));
          }
          setError(null);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Failed");
        } finally {
          setLoadingCatalog(false);
        }
      })();
    }, [selectedLevelId])
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
            {sub && data?.eligible && sub.status !== "CANCELLED" ? (
              <SoftButton
                label="Cancel renewal"
                onPress={() => {
                  const run = () => {
                    void (async () => {
                      try {
                        const res = await apiRequest<{ message?: string }>(
                          "/subscriptions/cancel",
                          { method: "POST", body: JSON.stringify({}) }
                        );
                        setError(null);
                        const me = await apiRequest("/subscriptions/me");
                        setData(me);
                        const msg =
                          res.message ??
                          "Access continues until the current period ends.";
                        if (Platform.OS === "web") {
                          globalThis.alert?.(msg);
                        } else {
                          Alert.alert("Subscription cancelled", msg);
                        }
                      } catch (err) {
                        setError(
                          err instanceof ApiError
                            ? err.message
                            : "Could not cancel subscription"
                        );
                      }
                    })();
                  };
                  if (Platform.OS === "web") {
                    if (
                      globalThis.confirm?.(
                        "Cancel renewal? Access continues until expiry."
                      )
                    ) {
                      run();
                    }
                    return;
                  }
                  Alert.alert(
                    "Cancel renewal?",
                    "Access continues until the current period ends.",
                    [
                      { text: "Keep", style: "cancel" },
                      { text: "Cancel renewal", style: "destructive", onPress: run },
                    ]
                  );
                }}
              />
            ) : null}
          </Card>

          <Card style={{ gap: 14 }}>
            <View style={{ gap: 4 }}>
              <Text style={styles.section}>Choose a plan</Text>
              <Text style={styles.note}>
                Pick a learning level, then select a subscription duration.
              </Text>
            </View>

            {loadingCatalog ? (
              <Text style={styles.note}>Loading plans…</Text>
            ) : null}

            {levels.length ? (
              <View style={{ gap: 8 }}>
                <Text style={styles.fieldLabel}>Learning level</Text>
                <View style={styles.chipRow}>
                  {levels.map((l) => {
                    const on = selectedLevelId === l.id;
                    const range =
                      l.startGrade != null
                        ? `Grades ${l.startGrade}–${l.endGrade}`
                        : null;
                    return (
                      <Pressable
                        key={l.id}
                        onPress={() => setSelectedLevelId(l.id)}
                        style={[styles.chip, on && styles.chipOn]}
                      >
                        <Text style={[styles.chipTitle, on && styles.chipTitleOn]}>
                          {l.label}
                        </Text>
                        {range ? (
                          <Text
                            style={[styles.chipMeta, on && styles.chipMetaOn]}
                          >
                            {range}
                          </Text>
                        ) : null}
                      </Pressable>
                    );
                  })}
                </View>
              </View>
            ) : (
              <Text style={styles.note}>
                No published levels yet. Ask Admin to publish Academic Setup
                levels.
              </Text>
            )}

            {catalog?.plans?.length ? (
              <View style={{ gap: 10 }}>
                {[...catalog.plans]
                  .sort(
                    (a, b) =>
                      (a.durationMonths ?? 999) - (b.durationMonths ?? 999)
                  )
                  .map((p) => {
                  const key = p.planId ?? p.id ?? p.code ?? p.purpose;
                  const title = planTitle(p);
                  const duration = durationLabel(p.durationMonths);
                  const desc =
                    p.description?.trim() &&
                    p.description.trim().toLowerCase() !== title.toLowerCase()
                      ? p.description.trim()
                      : null;
                  return (
                    <View key={key} style={[styles.planCard, shadow.soft]}>
                      <View style={styles.planTop}>
                        <View style={{ flex: 1, gap: 4 }}>
                          <View style={styles.badge}>
                            <Text style={styles.badgeText}>{duration}</Text>
                          </View>
                          <Text style={styles.planName}>{title}</Text>
                          {desc ? (
                            <Text style={styles.planDesc} numberOfLines={2}>
                              {desc}
                            </Text>
                          ) : (
                            <Text style={styles.planDesc}>
                              Full access for {duration.toLowerCase()}
                            </Text>
                          )}
                        </View>
                        <View style={styles.priceBlock}>
                          <Text style={styles.price}>{formatInr(p.totalPaise)}</Text>
                          {p.taxPaise && p.taxPaise > 0 ? (
                            <Text style={styles.priceNote}>incl. tax</Text>
                          ) : (
                            <Text style={styles.priceNote}>total</Text>
                          )}
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : (
              <Text style={styles.note}>
                {catalog?.note ??
                  "No published subscription plans for this level."}
              </Text>
            )}

            <Text style={styles.checkoutHint}>
              {Platform.OS === "web"
                ? "Pay securely on the website checkout."
                : "Checkout opens in your browser. Prices come from the server."}
            </Text>
            <PrimaryButton
              label="Continue to checkout"
              onPress={() => void openWebCheckout()}
            />
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
  fieldLabel: {
    fontWeight: "700",
    fontSize: 13,
    color: colors.textMuted,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    backgroundColor: colors.primarySoft,
    borderRadius: radii.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "transparent",
    minWidth: 108,
  },
  chipOn: {
    backgroundColor: colors.primary,
    borderColor: colors.primaryDark,
  },
  chipTitle: { fontWeight: "800", color: colors.primaryDark, fontSize: 14 },
  chipTitleOn: { color: "#fff" },
  chipMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  chipMetaOn: { color: "rgba(255,255,255,0.85)" },
  planCard: {
    backgroundColor: "#fff",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
  },
  planTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  badge: {
    alignSelf: "flex-start",
    backgroundColor: colors.mintSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
  },
  badgeText: {
    color: colors.mintDeep,
    fontWeight: "800",
    fontSize: 11,
    letterSpacing: 0.2,
  },
  planName: {
    fontWeight: "800",
    fontSize: 17,
    color: colors.text,
  },
  planDesc: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
  },
  priceBlock: { alignItems: "flex-end", minWidth: 88 },
  price: {
    fontWeight: "800",
    fontSize: 20,
    color: colors.primaryDark,
  },
  priceNote: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: "600",
    marginTop: 2,
  },
  checkoutHint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  label: { color: colors.textMuted, fontWeight: "600" },
  value: { color: colors.text, fontWeight: "800" },
});
