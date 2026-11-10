const SCRIPT_URL = "https://sdk.cashfree.com/js/v3/cashfree.js";

type CashfreeResult = { error?: { message?: string }; redirect?: boolean };
type CashfreeFactory = (o: { mode: "sandbox" | "production" }) => {
  checkout: (o: { paymentSessionId: string; redirectTarget?: "_modal" | "_self" }) => Promise<CashfreeResult>;
};

function loadScript(): Promise<CashfreeFactory> {
  const w = globalThis as unknown as { Cashfree?: CashfreeFactory };
  if (w.Cashfree) return Promise.resolve(w.Cashfree);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_URL;
    s.async = true;
    s.onload = () => (w.Cashfree ? resolve(w.Cashfree) : reject(new Error("Cashfree failed to load")));
    s.onerror = () => reject(new Error("Could not load Cashfree. Check your connection."));
    document.body.appendChild(s);
  });
}

/** Opens Cashfree's checkout window. Resolves when it closes; the server then decides what happened. */
export async function openCashfreeCheckout(opts: {
  paymentSessionId: string;
  orderId: string;
  mode: "sandbox" | "production";
}): Promise<{ redirected: boolean }> {
  const Cashfree = await loadScript();
  const result = await Cashfree({ mode: opts.mode }).checkout({
    paymentSessionId: opts.paymentSessionId,
    redirectTarget: "_modal",
  });
  return { redirected: Boolean(result.redirect) };
}
