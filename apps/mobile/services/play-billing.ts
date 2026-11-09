import type { PlayOffer, PlayPurchase, PlayPurchaseError } from "./play-billing-types";

export * from "./play-billing-types";

/** Web preview: Google Play Billing exists only in the Android app. */
export const playBillingSupported = false;

function unavailable(): never {
  throw new Error("Google Play subscriptions are available only in the Android app.");
}

export async function connectPlayBilling(): Promise<void> {
  unavailable();
}

export async function disconnectPlayBilling(): Promise<void> {}

export async function loadPlayOffers(_productIds: string[]): Promise<PlayOffer[]> {
  return [];
}

export function listenPlayPurchases(
  _onPurchase: (p: PlayPurchase) => void,
  _onError: (e: PlayPurchaseError) => void
): () => void {
  return () => undefined;
}

export async function startPlaySubscription(_offer: PlayOffer, _accountId: string): Promise<void> {
  unavailable();
}

export async function finishPlayPurchase(_purchase: PlayPurchase): Promise<void> {}

export async function getOwnedPlayPurchases(_productIds: string[]): Promise<PlayPurchase[]> {
  return [];
}

export async function openPlaySubscriptions(_productId: string | null, _packageName: string) {
  unavailable();
}
