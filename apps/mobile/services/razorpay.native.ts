import { CheckoutCancelled, type CheckoutOptions, type CheckoutResult } from "./razorpay-types";

export { CheckoutCancelled };

/** Store builds sell subscriptions through Google Play / App Store only; Razorpay stays on the website. */
export async function openRazorpayCheckout(_opts: CheckoutOptions): Promise<CheckoutResult> {
  throw new Error("In the app, subscribe through Google Play. Website payments are available on the Learn Wise website.");
}
