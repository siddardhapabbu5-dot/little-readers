import { NativeModules } from "react-native";
import { CheckoutCancelled, type CheckoutOptions, type CheckoutResult } from "./razorpay-types";

export { CheckoutCancelled };

type NativeSuccess = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

export async function openRazorpayCheckout(opts: CheckoutOptions): Promise<CheckoutResult> {
  if (!NativeModules.RNRazorpayCheckout) {
    throw new Error("This app version can't take payments yet. Please update Learn Wise.");
  }
  // Loaded lazily: the module registers native event listeners on import.
  const RazorpayCheckout = require("react-native-razorpay").default as {
    open: (o: Record<string, unknown>) => Promise<NativeSuccess>;
  };
  try {
    const res = await RazorpayCheckout.open({
      key: opts.keyId,
      order_id: opts.orderId,
      amount: opts.amountPaise,
      currency: opts.currency,
      name: "Learn Wise",
      description: opts.description,
      prefill: { email: opts.email ?? "", name: opts.name ?? "" },
      theme: { color: opts.themeColor },
    });
    return {
      orderId: res.razorpay_order_id,
      paymentId: res.razorpay_payment_id,
      signature: res.razorpay_signature,
    };
  } catch (e) {
    const err = e as { code?: number; description?: string };
    throw new CheckoutCancelled(err?.description || "Payment was not completed.");
  }
}
