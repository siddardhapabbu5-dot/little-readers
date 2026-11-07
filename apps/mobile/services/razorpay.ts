import { CheckoutCancelled, type CheckoutOptions, type CheckoutResult } from "./razorpay-types";

export { CheckoutCancelled };

const SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayCtor = new (o: Record<string, unknown>) => { open: () => void };

function loadScript(): Promise<RazorpayCtor> {
  const w = globalThis as unknown as { Razorpay?: RazorpayCtor };
  if (w.Razorpay) return Promise.resolve(w.Razorpay);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => (w.Razorpay ? resolve(w.Razorpay) : reject(new Error("Razorpay failed to load")));
    s.onerror = () => reject(new Error("Could not load Razorpay. Check your connection."));
    document.body.appendChild(s);
  });
}

export async function openRazorpayCheckout(opts: CheckoutOptions): Promise<CheckoutResult> {
  const Razorpay = await loadScript();
  return new Promise((resolve, reject) => {
    const rzp = new Razorpay({
      key: opts.keyId,
      order_id: opts.orderId,
      amount: opts.amountPaise,
      currency: opts.currency,
      name: "LEARN WISE",
      description: opts.description,
      prefill: { email: opts.email ?? "", name: opts.name ?? "" },
      theme: { color: opts.themeColor },
      handler: (r: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) =>
        resolve({
          orderId: r.razorpay_order_id,
          paymentId: r.razorpay_payment_id,
          signature: r.razorpay_signature,
        }),
      modal: { ondismiss: () => reject(new CheckoutCancelled("Payment was cancelled.")) },
    });
    rzp.open();
  });
}
