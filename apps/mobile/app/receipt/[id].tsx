import { useCallback, useState } from "react";
import { ActivityIndicator, Platform, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, PrimaryButton, SoftButton, Title } from "../../components/ui";
import { AuthGate } from "../../components/AuthGate";
import { RegistrationSteps } from "../../components/RegistrationSteps";
import { apiRequest, ApiError } from "../../services/api";
import { ROLE_SETS } from "../../services/auth-errors";
import { colors } from "../../theme";

type Receipt = {
  receiptNumber: string;
  paidAt: string;
  parentName: string | null;
  parentEmail: string;
  childNames?: string[];
  planName: string;
  durationMonths: number | null;
  seatsPurchased: number;
  amountPaise: number;
  taxPaise: number;
  totalPaise: number;
  currency: string;
  razorpayOrderId: string | null;
  razorpayPaymentId: string | null;
  subscriptionStartsAt?: string | null;
  subscriptionEndsAt?: string | null;
  validUntil: string | null;
};

function money(paise: number, currency: string) {
  const symbol = currency === "INR" ? "₹" : `${currency} `;
  return `${symbol}${(paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function planLabel(r: Receipt) {
  const looksLikeCode = /^[A-Z0-9_\- ]+$/.test(r.planName);
  if (!looksLikeCode) return r.planName;
  const n = r.durationMonths;
  if (n === 12) return "1 Year";
  if (n) return n === 1 ? "Monthly" : `${n} Months`;
  return r.planName.replace(/[_-]+/g, " ");
}

const STACKED = new Set(["Payment ID", "Order ID"]);

function day(value: string | null) {
  return value ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" }) : "—";
}

export default function ReceiptScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          setReceipt(await apiRequest<Receipt>(`/payments/${id}/receipt`));
          setError(null);
        } catch (err) {
          setError(err instanceof ApiError ? err.message : "Could not load the receipt");
        }
      })();
    }, [id])
  );

  const rows: [string, string][] = receipt
    ? [
        ["Receipt no.", receipt.receiptNumber],
        ["Payment date", new Date(receipt.paidAt).toLocaleString()],
        ["Parent", receipt.parentName || receipt.parentEmail],
        ["Email", receipt.parentEmail],
        ...(receipt.childNames?.length
          ? ([[receipt.childNames.length > 1 ? "Children" : "Child", receipt.childNames.join(", ")]] as [string, string][])
          : []),
        ["Plan", planLabel(receipt)],
        ...(receipt.durationMonths
          ? ([["Duration", `${receipt.durationMonths} month${receipt.durationMonths === 1 ? "" : "s"}`]] as [string, string][])
          : []),
        ["Starts", day(receipt.subscriptionStartsAt ?? null)],
        ["Expires", day(receipt.subscriptionEndsAt ?? receipt.validUntil)],
        ["Amount", money(receipt.amountPaise, receipt.currency)],
        ...(receipt.taxPaise
          ? ([["Tax", money(receipt.taxPaise, receipt.currency)]] as [string, string][])
          : []),
        ["Total paid", money(receipt.totalPaise, receipt.currency)],
        ["Payment ID", receipt.razorpayPaymentId ?? "—"],
        ["Order ID", receipt.razorpayOrderId ?? "—"],
      ]
    : [];

  async function share() {
    if (!receipt) return;
    const text = ["LEARN WISE – Payment Receipt", ...rows.map(([k, v]) => `${k}: ${v}`)].join("\n");
    await Share.share({ message: text, title: `Receipt ${receipt.receiptNumber}` }).catch(
      () => undefined
    );
  }

  return (
    <AuthGate roles={ROLE_SETS.parentFamily}>
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.content}>
          <RegistrationSteps step={7} />
          <ErrorText>{error}</ErrorText>
          {!receipt && !error ? <ActivityIndicator color={colors.primary} /> : null}
          {receipt ? (
            <>
              <View style={styles.hero}>
                <Ionicons name="checkmark-circle" size={56} color={colors.success} />
                <Title>Payment successful</Title>
                <Text style={styles.meta}>Verified by LEARN WISE. Your subscription is active.</Text>
              </View>
              <Card style={{ gap: 10 }}>
                {rows.map(([k, v]) =>
                  STACKED.has(k) ? (
                    <View key={k} style={{ gap: 2 }}>
                      <Text style={styles.label}>{k}</Text>
                      <Text style={styles.idValue} selectable>
                        {v}
                      </Text>
                    </View>
                  ) : (
                    <View key={k} style={styles.row}>
                      <Text style={styles.label}>{k}</Text>
                      <Text
                        style={[styles.value, k === "Total paid" && styles.total]}
                        selectable
                      >
                        {v}
                      </Text>
                    </View>
                  )
                )}
              </Card>
              <SoftButton label="Share receipt" onPress={() => void share()} />
            </>
          ) : null}
          <PrimaryButton label="Go to parent dashboard" onPress={() => router.replace("/parent")} />
        </ScrollView>
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, gap: 12, paddingBottom: 40 },
  hero: { alignItems: "center", gap: 6, paddingVertical: 8 },
  meta: { color: colors.textMuted, textAlign: "center" },
  row: { flexDirection: "row", justifyContent: "space-between", gap: 12 },
  label: { color: colors.textMuted, fontWeight: "600", flexShrink: 0 },
  idValue: {
    color: colors.text,
    fontWeight: "600",
    fontSize: 12,
    ...(Platform.OS === "web" ? ({ wordBreak: "break-all" } as object) : {}),
  },
  value: { color: colors.text, fontWeight: "700", flexShrink: 1, textAlign: "right" },
  total: { color: colors.primaryDark, fontSize: 17, fontWeight: "800" },
});
