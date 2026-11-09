import { CheckoutCancelled, type CheckoutOptions, type CheckoutResult } from "./razorpay-types";

export { CheckoutCancelled };

/** The Android / iOS apps never take website payments; Android subscribes through Google Play. */
export async function openRazorpayCheckout(_opts: CheckoutOptions): Promise<CheckoutResult> {
  throw new Error("Website checkout is not available in the app.");
}
