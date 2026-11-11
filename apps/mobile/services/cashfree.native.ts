/** Store builds sell subscriptions through Google Play / App Store only; Cashfree stays on the website. */
export async function openCashfreeCheckout(_opts: {
  paymentSessionId: string;
  orderId: string;
  mode: "sandbox" | "production";
}): Promise<{ redirected: boolean }> {
  throw new Error("In the app, subscribe through Google Play. Website payments are available on the Learn Wise website.");
}
