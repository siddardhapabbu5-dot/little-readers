import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ErrorText, PrimaryButton, Title } from "../components/ui";
import { AuthGate } from "../components/AuthGate";
import { apiRequest, ApiError } from "../services/api";
import { ROLE_SETS } from "../services/auth-errors";
import { colors } from "../theme";

/** Cashfree redirect-based methods (net banking, some UPI apps) land here with the order id. */
export default function PaymentReturnScreen() {
  const { cf_order_id: orderId } = useLocalSearchParams<{ cf_order_id?: string }>();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) {
      setError("No payment to confirm.");
      return;
    }
    void (async () => {
      try {
        const res = await apiRequest<{ paymentId: string; processing?: boolean; message?: string }>(
          "/payments/cashfree/verify",
          { method: "POST", body: JSON.stringify({ orderId }) }
        );
        if (res.processing) {
          setNotice(res.message ?? "Your payment is being confirmed. Access starts automatically once it completes.");
          return;
        }
        router.replace(`/receipt/${res.paymentId}`);
      } catch (err) {
        setError(
          err instanceof ApiError && err.code === "PAYMENT_NOT_COMPLETED"
            ? "Payment was not completed. You have not been charged. You can try again."
            : err instanceof Error
              ? err.message
              : "Could not confirm the payment"
        );
      }
    })();
  }, [orderId, router]);

  return (
    <AuthGate roles={ROLE_SETS.parentFamily}>
      <SafeAreaView style={styles.safe}>
        <Card style={{ gap: 12, margin: 20 }}>
          <Title>Payment</Title>
          {!error && !notice ? (
            <>
              <ActivityIndicator color={colors.primary} />
              <Text style={styles.meta}>Confirming your payment with Cashfree…</Text>
            </>
          ) : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <ErrorText>{error}</ErrorText>
          {error || notice ? (
            <PrimaryButton label="Back to subscription" onPress={() => router.replace("/subscription")} />
          ) : null}
        </Card>
      </SafeAreaView>
    </AuthGate>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  meta: { color: colors.textMuted, lineHeight: 20, textAlign: "center" },
  notice: { color: colors.primaryDark, fontWeight: "700" },
});
