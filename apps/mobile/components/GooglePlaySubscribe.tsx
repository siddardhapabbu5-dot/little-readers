import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Linking, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Card, ErrorText, PrimaryButton, SoftButton } from "./ui";
import { apiRequest, ApiError } from "../services/api";
import {
  billingPeriodLabel,
  connectPlayBilling,
  disconnectPlayBilling,
  finishPlayPurchase,
  getOwnedPlayPurchases,
  listenPlayPurchases,
  loadPlayOffers,
  openPlaySubscriptions,
  startPlaySubscription,
  type PlayOffer,
  type PlayPurchase,
} from "../services/play-billing";
import { colors, radii, shadow } from "../theme";

type PlayConfig = {
  enabled: boolean;
  packageName: string;
  products: { productId: string; months: number; includedSeats: number }[];
  obfuscatedAccountId: string;
  canPurchase: boolean;
  blockedReason: string | null;
  requiresAgreements: boolean;
  currentProvider: string | null;
  currentExpiresAt: string | null;
};

type VerifyResult = { status: string; eligible: boolean; pending: boolean; productId: string };

const PURCHASE_SAFE_MSG =
  "We couldn't confirm your purchase yet. Your payment is safe — tap “Restore purchases” in a minute.";

export function GooglePlaySubscribe({
  currentProductId,
  onEntitlementChanged,
}: {
  currentProductId: string | null;
  onEntitlementChanged: () => Promise<void> | void;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<PlayConfig | null>(null);
  const [offers, setOffers] = useState<PlayOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const changed = useRef(onEntitlementChanged);
  changed.current = onEntitlementChanged;

  const loadConfig = useCallback(async () => {
    try {
      const cfg = await apiRequest<PlayConfig>("/payments/google-play/config");
      setConfig(cfg);
      return cfg;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not load subscription options.");
      return null;
    }
  }, []);

  const verifyAndFinish = useCallback(async (p: PlayPurchase) => {
    try {
      const res = await apiRequest<VerifyResult>("/payments/google-play/verify", {
        method: "POST",
        body: JSON.stringify({ productId: p.productId, purchaseToken: p.purchaseToken }),
      });
      if (res.pending) {
        setNotice("Your payment is pending with Google Play. Access starts automatically once it completes.");
        return;
      }
      await finishPlayPurchase(p);
      setNotice(res.eligible ? "Thank you! Your subscription is active." : `Subscription status: ${res.status}.`);
      setError(null);
      await changed.current();
      await loadConfig();
    } catch (err) {
      if (err instanceof ApiError && err.status < 500) setError(err.message);
      else setError(PURCHASE_SAFE_MSG);
    }
  }, [loadConfig]);

  useFocusEffect(
    useCallback(() => {
      void loadConfig();
    }, [loadConfig])
  );

  useEffect(() => {
    let stop: (() => void) | null = null;
    let alive = true;
    void (async () => {
      const cfg = await loadConfig();
      if (!cfg?.enabled) {
        setLoading(false);
        return;
      }
      try {
        await connectPlayBilling();
        if (!alive) return;
        stop = listenPlayPurchases(
          (p) => {
            setBusy(null);
            if (p.state === "pending") {
              setNotice("Your payment is pending with Google Play. Access starts automatically once it completes.");
            } else if (p.state === "purchased") {
              void verifyAndFinish(p);
            }
          },
          (e) => {
            setBusy(null);
            if (e.cancelled) setNotice("Purchase cancelled. You have not been charged.");
            else setError(e.message);
          }
        );
        const ids = cfg.products.map((x) => x.productId);
        const loaded = await loadPlayOffers(ids);
        setOffers(loaded.sort((a, b) => ids.indexOf(a.productId) - ids.indexOf(b.productId)));
        // Finish any purchase that completed while the app was closed.
        const owned = await getOwnedPlayPurchases(ids);
        for (const p of owned) {
          if (p.state === "purchased" && !p.acknowledged) await verifyAndFinish(p);
        }
      } catch {
        if (alive) setError("Google Play is not available on this device right now.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
      stop?.();
      void disconnectPlayBilling();
    };
  }, [loadConfig, verifyAndFinish]);

  async function subscribe(offer: PlayOffer) {
    if (!config) return;
    setError(null);
    setNotice(null);
    if (config.requiresAgreements) {
      router.push("/agreements?store=google_play");
      return;
    }
    setBusy(offer.productId);
    try {
      await startPlaySubscription(offer, config.obfuscatedAccountId);
    } catch (err) {
      setBusy(null);
      setError(err instanceof Error ? err.message : "Could not open Google Play.");
    }
  }

  async function restore() {
    if (!config) return;
    setBusy("restore");
    setError(null);
    setNotice(null);
    try {
      const owned = await getOwnedPlayPurchases(config.products.map((p) => p.productId));
      const ready = owned.filter((p) => p.state === "purchased");
      if (!ready.length) {
        setNotice("No Google Play subscription was found for the Google account on this phone.");
        return;
      }
      const res = await apiRequest<{ results: (VerifyResult & { error?: string })[] }>(
        "/payments/google-play/restore",
        {
          method: "POST",
          body: JSON.stringify({
            purchases: ready.map((p) => ({ productId: p.productId, purchaseToken: p.purchaseToken })),
          }),
        }
      );
      for (const p of ready) {
        const r = res.results.find((x) => x.productId === p.productId && !x.error && !x.pending);
        if (r) await finishPlayPurchase(p);
      }
      const restored = res.results.filter((r) => !r.error);
      setNotice(
        restored.length
          ? "Your Google Play subscription has been restored."
          : "This Google Play subscription belongs to a different LEARN WISE account."
      );
      await changed.current();
      await loadConfig();
    } catch (err) {
      setError(err instanceof ApiError && err.status < 500 ? err.message : PURCHASE_SAFE_MSG);
    } finally {
      setBusy(null);
    }
  }

  async function manage() {
    if (!config) return;
    try {
      await openPlaySubscriptions(currentProductId, config.packageName);
    } catch {
      await Linking.openURL(
        `https://play.google.com/store/account/subscriptions?package=${encodeURIComponent(config.packageName)}`
      ).catch(() => undefined);
    }
  }

  if (loading && !config) {
    return (
      <Card>
        <ActivityIndicator color={colors.primary} />
      </Card>
    );
  }

  if (!config?.enabled) {
    return (
      <Card style={{ gap: 6 }}>
        <Text style={styles.section}>Subscribe</Text>
        <Text style={styles.note}>Subscriptions are not open yet. Please check back soon.</Text>
        <ErrorText>{error}</ErrorText>
      </Card>
    );
  }

  const blockedText =
    config.blockedReason === "ALREADY_SUBSCRIBED_GOOGLE_PLAY"
      ? "You're subscribed through Google Play. Use “Manage in Google Play” to change or cancel."
      : config.blockedReason === "ACTIVE_SUBSCRIPTION_OTHER_PROVIDER"
        ? `Your current plan is active${config.currentExpiresAt ? ` until ${new Date(config.currentExpiresAt).toLocaleDateString()}` : ""}. You can subscribe here after it ends.`
        : null;

  return (
    <Card style={{ gap: 12 }}>
      <Text style={styles.section}>Subscribe with Google Play</Text>
      <ErrorText>{error}</ErrorText>
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {blockedText ? <Text style={styles.note}>{blockedText}</Text> : null}

      {!offers.length && !loading ? (
        <Text style={styles.note}>Subscription plans are not available from Google Play right now.</Text>
      ) : null}

      {offers.map((o) => {
        const seats = config.products.find((p) => p.productId === o.productId)?.includedSeats;
        return (
          <View key={o.productId} style={[styles.planCard, shadow.soft]}>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={styles.planName}>{o.title.replace(/\s*\(.*\)\s*$/, "")}</Text>
                {seats ? <Text style={styles.planDesc}>Includes {seats} child seats</Text> : null}
                {o.introText ? <Text style={styles.planDesc}>{o.introText}, then:</Text> : null}
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={styles.price}>{o.displayPrice}</Text>
                <Text style={styles.priceNote}>{billingPeriodLabel(o.billingPeriod)}</Text>
              </View>
            </View>
            <PrimaryButton
              label={config.requiresAgreements ? "Review agreements" : "Subscribe"}
              onPress={() => void subscribe(o)}
              loading={busy === o.productId}
              disabled={!config.canPurchase || busy !== null}
            />
          </View>
        );
      })}

      <Text style={styles.small}>
        Billed through your Google Play account. Renews automatically at the price shown until you cancel in
        Google Play. You can cancel anytime; access continues until the end of the period you paid for.
      </Text>

      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <SoftButton label="Restore purchases" onPress={() => busy === null && void restore()} />
        <SoftButton label="Manage in Google Play" onPress={() => void manage()} />
      </View>
      <Text style={styles.small}>Refunds for Google Play purchases follow Google Play's refund policy.</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  section: { fontWeight: "800", fontSize: 16, color: colors.text },
  note: { color: colors.textMuted, lineHeight: 20 },
  notice: { color: colors.primaryDark, fontWeight: "700" },
  small: { color: colors.textMuted, fontSize: 12, lineHeight: 17 },
  planCard: {
    backgroundColor: "#fff",
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 12,
  },
  planName: { fontWeight: "800", fontSize: 17, color: colors.text },
  planDesc: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
  price: { fontWeight: "800", fontSize: 20, color: colors.primaryDark },
  priceNote: { color: colors.textMuted, fontSize: 11, fontWeight: "600", marginTop: 2 },
});
