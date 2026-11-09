/**
 * Payment feature flags. Every flag defaults to OFF and is read at call time so an
 * operator change (or a test) takes effect without code changes.
 *
 *   PAYMENT_ENABLED              master switch for all new purchases
 *   RAZORPAY_ENABLED             website Razorpay checkout
 *   RAZORPAY_LIVE_ENABLED        allow rzp_live_ keys (otherwise only rzp_test_)
 *   GOOGLE_PLAY_BILLING_ENABLED  Android Google Play Billing verification
 *   CASHFREE_ENABLED             website Cashfree checkout
 *   CASHFREE_LIVE_ENABLED        allow CASHFREE_ENV=production (otherwise sandbox only)
 */
function on(value: string | undefined) {
  return value === "true" || value === "1";
}

export function paymentMasterEnabled() {
  return on(process.env.PAYMENT_ENABLED);
}

export function razorpayCheckoutFlagOn() {
  return paymentMasterEnabled() && on(process.env.RAZORPAY_ENABLED);
}

export function razorpayLiveAllowed() {
  return on(process.env.RAZORPAY_LIVE_ENABLED);
}

export function googlePlayBillingEnabled() {
  return paymentMasterEnabled() && on(process.env.GOOGLE_PLAY_BILLING_ENABLED);
}

export function cashfreeCheckoutFlagOn() {
  return paymentMasterEnabled() && on(process.env.CASHFREE_ENABLED);
}

export function cashfreeLiveAllowed() {
  return on(process.env.CASHFREE_LIVE_ENABLED);
}

export function paymentFlagSummary() {
  return {
    paymentEnabled: paymentMasterEnabled(),
    razorpayEnabled: razorpayCheckoutFlagOn(),
    razorpayLiveEnabled: razorpayLiveAllowed(),
    googlePlayBillingEnabled: googlePlayBillingEnabled(),
    cashfreeEnabled: cashfreeCheckoutFlagOn(),
    cashfreeLiveEnabled: cashfreeLiveAllowed(),
  };
}
