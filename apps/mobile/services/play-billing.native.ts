import { Platform } from "react-native";
import type { Purchase } from "expo-iap";
import type { PlayOffer, PlayPurchase, PlayPurchaseError } from "./play-billing-types";

export * from "./play-billing-types";

/** Only the Play-distributed Android app sells subscriptions; iOS shows info text only. */
export const playBillingSupported = Platform.OS === "android";

// Loaded lazily so iOS never initialises the store module.
function iap() {
  return require("expo-iap") as typeof import("expo-iap");
}

let connected = false;

export async function connectPlayBilling() {
  if (!playBillingSupported) throw new Error("Google Play subscriptions are available only on Android.");
  if (connected) return;
  await iap().initConnection();
  connected = true;
}

export async function disconnectPlayBilling() {
  if (!connected) return;
  connected = false;
  await iap().endConnection().catch(() => undefined);
}

function toPlayPurchase(p: Purchase): PlayPurchase | null {
  const token = p.purchaseToken;
  if (!token) return null;
  return {
    productId: p.productId,
    purchaseToken: token,
    state: p.purchaseState,
    acknowledged: Boolean((p as { isAcknowledgedAndroid?: boolean | null }).isAcknowledgedAndroid),
    raw: p,
  };
}

export async function loadPlayOffers(productIds: string[]): Promise<PlayOffer[]> {
  if (!productIds.length) return [];
  const products = (await iap().fetchProducts({ skus: productIds, type: "subs" })) ?? [];
  const offers: PlayOffer[] = [];
  for (const product of products) {
    if (product.platform !== "android" || product.type !== "subs") continue;
    const sub = product as import("expo-iap").ProductSubscriptionAndroid;
    // Prefer the plain base plan (no offer id) so parents see the standard recurring price.
    const sorted = [...(sub.subscriptionOffers ?? [])].sort(
      (a, b) => Number(Boolean(a.id && a.id !== a.basePlanIdAndroid)) - Number(Boolean(b.id && b.id !== b.basePlanIdAndroid))
    );
    const offer = sorted.find((o) => o.offerTokenAndroid);
    if (!offer?.offerTokenAndroid) continue;
    const phases = offer.pricingPhasesAndroid?.pricingPhaseList ?? [];
    const recurring = phases[phases.length - 1];
    const intro = phases.length > 1 ? phases[0] : null;
    offers.push({
      productId: sub.id,
      offerToken: offer.offerTokenAndroid,
      basePlanId: offer.basePlanIdAndroid ?? null,
      title: sub.title || sub.displayName || sub.id,
      displayPrice: recurring?.formattedPrice ?? offer.displayPrice ?? sub.displayPrice,
      billingPeriod: recurring?.billingPeriod ?? null,
      introText: intro
        ? `${Number(intro.priceAmountMicros) === 0 ? "Free" : intro.formattedPrice} for ${intro.billingPeriod}`
        : null,
    });
  }
  return offers;
}

export function listenPlayPurchases(
  onPurchase: (p: PlayPurchase) => void,
  onError: (e: PlayPurchaseError) => void
) {
  const mod = iap();
  const a = mod.purchaseUpdatedListener((p) => {
    const mapped = toPlayPurchase(p);
    if (mapped) onPurchase(mapped);
  });
  const b = mod.purchaseErrorListener((e) => {
    onError({
      cancelled: String(e.code) === String(mod.ErrorCode.UserCancelled),
      message: e.message || "The purchase could not be completed.",
    });
  });
  return () => {
    a.remove();
    b.remove();
  };
}

export async function startPlaySubscription(offer: PlayOffer, accountId: string) {
  await iap().requestPurchase({
    type: "subs",
    request: {
      google: {
        skus: [offer.productId],
        subscriptionOffers: [{ sku: offer.productId, offerToken: offer.offerToken }],
        obfuscatedAccountId: accountId,
      },
    },
  });
}

/** Call only after the server has verified the purchase. */
export async function finishPlayPurchase(purchase: PlayPurchase) {
  await iap()
    .finishTransaction({ purchase: purchase.raw as Purchase, isConsumable: false })
    .catch(() => undefined);
}

export async function getOwnedPlayPurchases(productIds: string[]) {
  const list = (await iap().getAvailablePurchases()) ?? [];
  return list
    .map(toPlayPurchase)
    .filter((p): p is PlayPurchase => Boolean(p && productIds.includes(p.productId)));
}

export async function openPlaySubscriptions(productId: string | null, packageName: string) {
  await iap().deepLinkToSubscriptions({
    skuAndroid: productId ?? undefined,
    packageNameAndroid: packageName,
  });
}
