import type { CFErrorResponse } from "react-native-cashfree-pg-sdk";

type CashfreeSdk = typeof import("react-native-cashfree-pg-sdk");
type CashfreeContract = typeof import("cashfree-pg-api-contract");

/** Opens Cashfree's checkout. Resolves when it closes; the server then decides what happened. */
export async function openCashfreeCheckout(opts: {
  paymentSessionId: string;
  orderId: string;
  mode: "sandbox" | "production";
}): Promise<{ redirected: boolean }> {
  let sdk: CashfreeSdk;
  let contract: CashfreeContract;
  try {
    // Loaded lazily: the SDK registers native event listeners on import.
    sdk = require("react-native-cashfree-pg-sdk") as CashfreeSdk;
    contract = require("cashfree-pg-api-contract") as CashfreeContract;
  } catch {
    throw new Error("This app version can't take Cashfree payments yet. Please update Learn Wise.");
  }
  const { CFPaymentGatewayService } = sdk;
  const { CFSession, CFEnvironment } = contract;
  const env = opts.mode === "production" ? CFEnvironment.PRODUCTION : CFEnvironment.SANDBOX;
  return new Promise((resolve, reject) => {
    const done = () => {
      CFPaymentGatewayService.removeCallback();
      resolve({ redirected: false });
    };
    CFPaymentGatewayService.setCallback({
      onVerify: () => done(),
      // Cancelled or failed: the server's verify call reports it to the parent.
      onError: (_error: CFErrorResponse) => done(),
    });
    try {
      CFPaymentGatewayService.doWebPayment(new CFSession(opts.paymentSessionId, opts.orderId, env));
    } catch (e) {
      CFPaymentGatewayService.removeCallback();
      reject(e instanceof Error ? e : new Error("Could not open Cashfree."));
    }
  });
}
