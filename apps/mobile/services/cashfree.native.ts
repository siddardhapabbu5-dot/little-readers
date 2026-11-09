/** Website-only gateway: the Android / iOS apps sell subscriptions through the app store. */
export async function openCashfreeCheckout(_opts: {
  paymentSessionId: string;
  mode: "sandbox" | "production";
}): Promise<{ redirected: boolean }> {
  throw new Error("Cashfree checkout is only available on the Learn Wise website.");
}
