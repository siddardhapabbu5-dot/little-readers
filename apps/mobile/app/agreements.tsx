import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, Field, PrimaryButton, SoftButton, Title } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { RequireParentGate } from "../components/RequireParentGate";
import { RegistrationSteps } from "../components/RegistrationSteps";
import { API_URL, apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { openCashfreeCheckout } from "../services/cashfree";
import { CheckoutCancelled, openRazorpayCheckout } from "../services/razorpay";
import { getUser } from "../services/secure";
import { colors, radii } from "../theme";

type AgreementDoc = {
  type: string;
  slug: string;
  title: string;
  statement: string;
  available: boolean;
  current: { id: string; version: string; effectiveDate: string; publishedAt: string } | null;
  accepted: boolean;
  acceptedVersion: string | null;
  acceptedAt: string | null;
};

type AgreementStatus = {
  documents: AgreementDoc[];
  allPublished: boolean;
  allAccepted: boolean;
  marketingOptIn: boolean;
};

type Order = {
  paymentId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  keyId: string;
  plan?: { label?: string; name?: string; durationMonths?: number };
};

type Gateways = { razorpay: boolean; cashfree: boolean };

type CashfreeOrder = {
  paymentId: string;
  orderId: string;
  paymentSessionId: string;
  mode: "sandbox" | "production";
};

function formatWhen(value: string | null) {
  if (!value) return "";
  return new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function AgreementsScreen() {
  const params = useLocalSearchParams<{ planId?: string; store?: string }>();
  // Website checkout runs only in the web preview; the apps return to the store subscription screen.
  const planId = Platform.OS === "web" ? params.planId : undefined;
  const storeFlow = params.store === "google_play" || (Platform.OS !== "web" && Boolean(params.planId));
  const router = useRouter();
  const [status, setStatus] = useState<AgreementStatus | null>(null);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [marketing, setMarketing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [paying, setPaying] = useState(false);
  const [gateways, setGateways] = useState<Gateways>({ razorpay: true, cashfree: false });
  const [needPhone, setNeedPhone] = useState(false);
  const [phone, setPhone] = useState("");

  const load = useCallback(async () => {
    try {
      const s = await apiRequest<AgreementStatus>("/agreements");
      setStatus(s);
      setChecked({});
      setMarketing(false);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load agreements");
    }
    if (planId) {
      const catalog = await apiRequest<{ keyId: string | null; gateways?: Gateways }>("/payments/plans").catch(
        () => null
      );
      if (catalog) setGateways(catalog.gateways ?? { razorpay: Boolean(catalog.keyId), cashfree: false });
    }
  }, [planId]);

  async function payWithCashfree() {
    if (!planId) return;
    setPaying(true);
    setError(null);
    setNotice(null);
    try {
      const order = await apiRequest<CashfreeOrder>("/payments/cashfree/orders", {
        method: "POST",
        body: JSON.stringify({ planId, phone: phone.trim() || undefined, returnTo: "app" }),
      });
      setNeedPhone(false);
      const { redirected } = await openCashfreeCheckout({
        paymentSessionId: order.paymentSessionId,
        mode: order.mode,
      });
      if (redirected) return;
      // Whatever the window reported, only Cashfree's own record (checked by the server) grants access.
      const verified = await apiRequest<{ processing?: boolean; message?: string }>("/payments/cashfree/verify", {
        method: "POST",
        body: JSON.stringify({ orderId: order.orderId }),
      });
      if (verified?.processing) {
        setNotice(verified.message ?? "Your payment is being confirmed. Access starts automatically once it completes.");
        return;
      }
      router.replace(`/receipt/${order.paymentId}`);
    } catch (err) {
      if (err instanceof ApiError && err.code === "PHONE_REQUIRED") {
        setNeedPhone(true);
        setError("Cashfree needs a 10-digit mobile number. Enter it below and tap Pay again.");
      } else if (err instanceof ApiError && err.code === "PAYMENT_NOT_COMPLETED") {
        setNotice("Payment was not completed. You have not been charged. You can try again.");
      } else if (err instanceof ApiError && err.code === "PLAN_PRICES_NOT_CONFIGURED") {
        setError("Online payments are not open yet. Your agreements are saved — please try again later.");
      } else {
        setError(err instanceof Error ? err.message : "Payment failed");
      }
    } finally {
      setPaying(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  async function view(doc: AgreementDoc) {
    if (!doc.current) return;
    try {
      const link = await apiRequest<{ path: string }>(
        `/agreements/versions/${doc.current.id}/link`,
        { method: "POST" }
      );
      const url = `${API_URL}${link.path}`;
      if (Platform.OS === "web") window.open(url, "_blank", "noopener");
      else await Linking.openURL(url);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open the document");
    }
  }

  async function pay() {
    if (!planId) {
      router.replace("/parent");
      return;
    }
    setPaying(true);
    setError(null);
    setNotice(null);
    let order: Order | null = null;
    try {
      order = await apiRequest<Order>("/payments/orders", {
        method: "POST",
        body: JSON.stringify({ planId }),
      });
      const user = await getUser<{ email?: string; name?: string }>();
      const months = order.plan?.durationMonths;
      const result = await openRazorpayCheckout({
        keyId: order.keyId,
        orderId: order.orderId,
        amountPaise: order.amountPaise,
        currency: order.currency,
        description: months ? `${months}-month subscription` : "Subscription",
        email: user?.email,
        name: user?.name,
        themeColor: colors.primary,
      });
      const verified = await apiRequest<{ processing?: boolean; message?: string }>("/payments/verify", {
        method: "POST",
        body: JSON.stringify(result),
      });
      if (verified?.processing) {
        setNotice(verified.message ?? "Your payment is being confirmed. Access starts automatically once it completes.");
        return;
      }
      router.replace(`/receipt/${order.paymentId}`);
    } catch (err) {
      if (err instanceof CheckoutCancelled && order) {
        await apiRequest("/payments/cancel", {
          method: "POST",
          body: JSON.stringify({ orderId: order.orderId }),
        }).catch(() => undefined);
        setNotice(`${err.message} You have not been charged. You can try again.`);
      } else if (err instanceof ApiError && err.code === "PLAN_PRICES_NOT_CONFIGURED") {
        setError("Online payments are not open yet. Your agreements are saved — please try again later.");
      } else {
        setError(err instanceof Error ? err.message : "Payment failed");
      }
    } finally {
      setPaying(false);
    }
  }

  async function acceptAndContinue() {
    if (!status) return;
    setBusy(true);
    setError(null);
    try {
      const next = await apiRequest<AgreementStatus>("/agreements/accept", {
        method: "POST",
        body: JSON.stringify({
          versionIds: status.documents.map((d) => d.current!.id),
          marketingOptIn: marketing,
        }),
      });
      setStatus(next);
      setChecked({});
      // With two gateways the parent picks one on the accepted card below.
      if (planId && !(gateways.razorpay && gateways.cashfree)) {
        await (gateways.cashfree && !gateways.razorpay ? payWithCashfree() : pay());
      } else if (storeFlow) router.replace("/subscription");
      else router.replace("/parent");
    } catch (err) {
      if (err instanceof ApiError && err.code === "AGREEMENTS_OUTDATED") await load();
      setError(err instanceof ApiError ? err.message : "Could not save your acceptance");
    } finally {
      setBusy(false);
    }
  }

  const docs = status?.documents ?? [];
  const allTicked = docs.length > 0 && docs.every((d) => checked[d.type]);
  const alreadyAccepted = Boolean(status?.allAccepted);

  return (
    <AuthGate roles={ROLE_SETS.parentFamily}>
      <RequireParentGate>
        <SafeAreaView style={styles.safe}>
          <ScrollView contentContainerStyle={styles.content}>
            <SoftButton label="← Back" onPress={() => !paying && router.back()} />
            <RegistrationSteps step={paying ? 6 : 5} />
            <Title>Learn Wise – Agreements</Title>
            <Text style={styles.meta}>
              Please read each document and tick every box to continue.
            </Text>
            <ErrorText>{error}</ErrorText>
            {notice ? <Text style={styles.notice}>{notice}</Text> : null}

            {!status ? <ActivityIndicator color={colors.primary} /> : null}

            {status && !status.allPublished ? (
              <Card>
                <Text style={styles.meta}>
                  Learn Wise is still publishing its agreements. Please try again later.
                </Text>
              </Card>
            ) : null}

            {status?.allPublished && alreadyAccepted ? (
              <Card style={{ gap: 10 }}>
                <Text style={styles.section}>You've accepted the current agreements</Text>
                {docs.map((d) => (
                  <View key={d.type} style={styles.acceptedRow}>
                    <Ionicons name="checkmark-circle" size={20} color={colors.success} />
                    <View style={{ flex: 1 }}>
                      <Text style={styles.docTitle}>{d.title}</Text>
                      <Text style={styles.small}>
                        v{d.acceptedVersion} · accepted {formatWhen(d.acceptedAt)}
                      </Text>
                    </View>
                    <SoftButton label="View" onPress={() => void view(d)} />
                  </View>
                ))}
                {planId ? (
                  <View style={{ gap: 8 }}>
                    {needPhone ? (
                      <Field
                        label="Mobile number for Cashfree"
                        value={phone}
                        onChangeText={setPhone}
                        keyboardType="phone-pad"
                        maxLength={13}
                        placeholder="10-digit mobile"
                      />
                    ) : null}
                    {gateways.razorpay && gateways.cashfree ? (
                      <>
                        <PrimaryButton label="Pay with Razorpay" onPress={() => void pay()} loading={paying} />
                        <PrimaryButton
                          label="Pay with Cashfree (UPI, cards, net banking)"
                          onPress={() => void payWithCashfree()}
                          loading={paying}
                        />
                      </>
                    ) : (
                      <PrimaryButton
                        label="Continue to payment"
                        onPress={() => void (gateways.cashfree && !gateways.razorpay ? payWithCashfree() : pay())}
                        loading={paying}
                      />
                    )}
                  </View>
                ) : storeFlow ? (
                  <PrimaryButton label="Back to subscription" onPress={() => router.replace("/subscription")} />
                ) : (
                  <PrimaryButton label="Done" onPress={() => router.replace("/parent")} />
                )}
              </Card>
            ) : null}

            {status?.allPublished && !alreadyAccepted ? (
              <>
                {docs.map((d) => {
                  const on = Boolean(checked[d.type]);
                  return (
                    <Card key={d.type} style={{ gap: 10 }}>
                      <View style={styles.docHead}>
                        <Text style={[styles.docTitle, { flex: 1 }]}>{d.title}</Text>
                        <Text style={styles.small}>v{d.current?.version}</Text>
                      </View>
                      {d.acceptedVersion && !d.accepted ? (
                        <Text style={styles.updated}>
                          Updated since you accepted v{d.acceptedVersion}
                        </Text>
                      ) : null}
                      <SoftButton label="View document" onPress={() => void view(d)} />
                      <Checkbox
                        checked={on}
                        label={d.statement}
                        onPress={() => setChecked((c) => ({ ...c, [d.type]: !c[d.type] }))}
                      />
                    </Card>
                  );
                })}

                <Card style={{ gap: 8 }}>
                  <Text style={styles.small}>Optional</Text>
                  <Checkbox
                    checked={marketing}
                    label="Send me Learn Wise news, tips and offers by email. (You can still subscribe without this.)"
                    onPress={() => setMarketing((m) => !m)}
                  />
                </Card>

                <Text style={styles.small}>
                  We save the date, time and version of each document you accept for future
                  verification.
                </Text>
                <PrimaryButton
                  label="Accept & Continue"
                  onPress={() => void acceptAndContinue()}
                  loading={busy || paying}
                  disabled={!allTicked}
                />
                {!allTicked ? (
                  <Text style={[styles.small, { textAlign: "center" }]}>
                    Tick all four agreements to continue.
                  </Text>
                ) : null}
              </>
            ) : null}
          </ScrollView>
        </SafeAreaView>
      </RequireParentGate>
    </AuthGate>
  );
}

function Checkbox({
  checked,
  label,
  onPress,
}: {
  checked: boolean;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      style={styles.checkRow}
    >
      <Ionicons
        name={checked ? "checkbox" : "square-outline"}
        size={24}
        color={checked ? colors.primary : colors.textMuted}
      />
      <Text style={styles.checkText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  meta: { color: colors.textMuted, lineHeight: 20 },
  small: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  section: { fontWeight: "800", fontSize: 16, color: colors.text },
  notice: { color: colors.primaryDark, fontWeight: "700" },
  docHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  docTitle: { fontWeight: "800", fontSize: 16, color: colors.text },
  updated: {
    alignSelf: "flex-start",
    backgroundColor: "#FEF3C7",
    color: "#92400E",
    fontWeight: "700",
    fontSize: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.pill,
  },
  checkRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  checkText: { flex: 1, color: colors.text, lineHeight: 21, fontWeight: "600" },
  acceptedRow: { flexDirection: "row", alignItems: "center", gap: 10 },
});
