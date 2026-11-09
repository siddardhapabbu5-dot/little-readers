"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@little-readers/ui";
import { apiRequest, ApiClientError } from "@/lib/api";
import { clearToken, getToken } from "@/lib/auth-storage";

type Plan = {
  purpose:
    | "FAMILY_MONTHLY"
    | "FAMILY_YEARLY"
    | "FAMILY_3_MONTH"
    | "FAMILY_6_MONTH"
    | "EXTRA_SEATS";
  code: string;
  label: string;
  description: string;
  billingPeriod: string;
  includedSeats: number;
  seatsPurchased: number;
  amountPaise: number;
  taxPaise: number;
  totalPaise: number;
  currency: string;
  planId?: string;
  durationMonths?: number;
};

type Catalog = {
  enabled: boolean;
  keyId: string | null;
  gateways?: { razorpay: boolean; cashfree: boolean };
  cashfreeMode?: "sandbox" | "production" | null;
  plans: Plan[];
  note: string | null;
};

type Gateway = "razorpay" | "cashfree";

type CashfreeCheckoutResult = {
  error?: { message?: string };
  redirect?: boolean;
  paymentDetails?: { paymentMessage?: string };
};

function formatMoney(paise: number, currency: string) {
  return `${currency} ${(paise / 100).toFixed(2)}`;
}

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => {
      open: () => void;
      on: (
        event: "payment.failed",
        cb: (resp: { error?: { description?: string; reason?: string } }) => void
      ) => void;
    };
    Cashfree?: (opts: { mode: "sandbox" | "production" }) => {
      checkout: (opts: {
        paymentSessionId: string;
        redirectTarget?: "_modal" | "_self";
      }) => Promise<CashfreeCheckoutResult>;
    };
  }
}

function loadCashfreeScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Cashfree) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://sdk.cashfree.com/js/v3/cashfree.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Cashfree Checkout"));
    document.body.appendChild(s);
  });
}

function loadRazorpayScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Razorpay) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("Failed to load Razorpay Checkout"));
    document.body.appendChild(s);
  });
}

export default function ParentCheckoutPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [extraSeats, setExtraSeats] = useState(1);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"pick" | "pending" | "success" | "failure">(
    "pick"
  );
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null);
  const [gateway, setGateway] = useState<Gateway>("razorpay");
  const [phone, setPhone] = useState("");

  const load = useCallback(async (t: string) => {
    const data = await apiRequest<Catalog>("/payments/plans", { token: t });
    setCatalog(data);
    const first = data.plans[0];
    if (first) {
      setSelectedKey(first.planId ?? first.code ?? first.purpose);
    }
    const gw = data.gateways ?? { razorpay: Boolean(data.keyId), cashfree: false };
    if (!gw.razorpay && gw.cashfree) setGateway("cashfree");
  }, []);

  const confirmCashfree = useCallback(async (t: string, orderId: string) => {
    setBusy(true);
    setPhase("pending");
    setError(null);
    try {
      const verified = await apiRequest<{ processing?: boolean; message?: string }>(
        "/payments/cashfree/verify",
        { method: "POST", token: t, body: JSON.stringify({ orderId }) }
      );
      setPhase("success");
      setMessage(
        verified?.processing
          ? verified.message ?? "Your payment is being confirmed. Access starts automatically once it completes."
          : "Payment successful and verified. Your subscription / seats are now active."
      );
    } catch (e) {
      setPhase("failure");
      setError(
        e instanceof ApiClientError ? e.message : "Verification failed — access was not granted"
      );
    } finally {
      setPendingOrderId(null);
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const t = getToken();
    if (!t) {
      router.replace("/login?next=/parent/checkout");
      return;
    }
    setToken(t);
    void load(t).catch((e) => setError(String(e.message ?? e)));
    // Cashfree redirect-based methods (net banking, some UPI apps) return here with the order id.
    const returned = new URLSearchParams(window.location.search).get("cf_order_id");
    if (returned) {
      window.history.replaceState(null, "", window.location.pathname);
      void confirmCashfree(t, returned);
    }
  }, [router, load, confirmCashfree]);

  async function startCashfreeCheckout() {
    if (!token || !plan || !catalog) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setPhase("pending");
    let orderId: string | null = null;
    try {
      const order = await apiRequest<{
        orderId: string;
        paymentSessionId: string;
        mode: "sandbox" | "production";
      }>("/payments/cashfree/orders", {
        method: "POST",
        token,
        body: JSON.stringify({
          planId: plan.planId,
          purpose: plan.planId ? undefined : plan.purpose,
          seats: plan.purpose === "EXTRA_SEATS" ? extraSeats : undefined,
          phone: phone.trim() || undefined,
          returnTo: "web",
        }),
      });
      orderId = order.orderId;
      setPendingOrderId(order.orderId);
      await loadCashfreeScript();
      if (!window.Cashfree) throw new Error("Cashfree Checkout unavailable");
      const result = await window.Cashfree({ mode: order.mode }).checkout({
        paymentSessionId: order.paymentSessionId,
        redirectTarget: "_modal",
      });
      if (result.redirect) return;
      // Closing the window or a failed attempt still asks the server: only Cashfree's record decides.
      await confirmCashfree(token, order.orderId);
    } catch (e) {
      setPhase("failure");
      setError(e instanceof ApiClientError ? e.message : String(e));
      if (orderId) {
        void apiRequest("/payments/cancel", {
          method: "POST",
          token,
          body: JSON.stringify({ orderId }),
        }).catch(() => undefined);
      }
      setBusy(false);
    }
  }

  const gateways = catalog?.gateways ?? {
    razorpay: Boolean(catalog?.keyId),
    cashfree: false,
  };
  const plan =
    catalog?.plans.find(
      (p) => (p.planId ?? p.code ?? p.purpose) === selectedKey
    ) ?? null;
  const orderPlan =
    plan?.purpose === "EXTRA_SEATS"
      ? {
          ...plan,
          seatsPurchased: extraSeats,
          amountPaise:
            (plan.amountPaise / Math.max(1, plan.seatsPurchased)) * extraSeats,
          taxPaise:
            Math.round(
              (((plan.amountPaise / Math.max(1, plan.seatsPurchased)) *
                extraSeats *
                plan.taxPaise) /
                Math.max(1, plan.amountPaise || 1))
            ) || plan.taxPaise * extraSeats,
          totalPaise: 0,
        }
      : plan;

  // Prefer server totals for EXTRA_SEATS via order response; preview uses catalog unit.
  const previewTotal =
    plan?.purpose === "EXTRA_SEATS"
      ? (plan.totalPaise / Math.max(1, plan.seatsPurchased)) * extraSeats
      : (plan?.totalPaise ?? 0);

  async function startCheckout() {
    if (!token || !plan) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    setPhase("pending");
    let orderId: string | null = null;
    try {
      const order = await apiRequest<{
        orderId: string;
        amountPaise: number;
        currency: string;
        keyId: string | null;
        paymentId: string;
        plan: Plan;
      }>("/payments/orders", {
        method: "POST",
        token,
        body: JSON.stringify({
          planId: plan.planId,
          purpose: plan.planId ? undefined : plan.purpose,
          seats: plan.purpose === "EXTRA_SEATS" ? extraSeats : undefined,
        }),
      });

      if (!order.keyId) {
        throw new Error("Razorpay key missing");
      }

      orderId = order.orderId;
      setPendingOrderId(order.orderId);
      await loadRazorpayScript();
      if (!window.Razorpay) throw new Error("Razorpay Checkout unavailable");

      await new Promise<void>((resolve, reject) => {
        let lastFailure: string | null = null;
        const rzp = new window.Razorpay!({
          key: order.keyId,
          amount: order.amountPaise,
          currency: order.currency,
          name: "LEARN WISE",
          description: order.plan.label,
          order_id: order.orderId,
          handler: async (response: {
            razorpay_order_id: string;
            razorpay_payment_id: string;
            razorpay_signature: string;
          }) => {
            try {
              const verified = await apiRequest<{ processing?: boolean; message?: string }>(
                "/payments/verify",
                {
                  method: "POST",
                  token,
                  body: JSON.stringify({
                    orderId: response.razorpay_order_id,
                    paymentId: response.razorpay_payment_id,
                    signature: response.razorpay_signature,
                  }),
                }
              );
              setPhase("success");
              setMessage(
                verified?.processing
                  ? verified.message ?? "Your payment is being confirmed. Access starts automatically once it completes."
                  : "Payment successful and verified. Your subscription / seats are now active."
              );
              setPendingOrderId(null);
              resolve();
            } catch (e) {
              setPhase("failure");
              setError(
                e instanceof ApiClientError
                  ? e.message
                  : "Verification failed — access was not granted"
              );
              reject(e);
            }
          },
          modal: {
            ondismiss: () => {
              void apiRequest("/payments/cancel", {
                method: "POST",
                token,
                body: JSON.stringify({ orderId: order.orderId }),
              }).catch(() => undefined);
              setPhase("failure");
              setError(
                lastFailure
                  ? `Payment failed: ${lastFailure}. Nothing was activated; if money was debited, the bank will reverse it.`
                  : "Payment cancelled. Nothing was charged or activated."
              );
              setPendingOrderId(null);
              resolve();
            },
          },
        });
        rzp.on("payment.failed", (resp) => {
          lastFailure =
            resp.error?.description ?? resp.error?.reason ?? "the bank declined the payment";
        });
        rzp.open();
      });
    } catch (e) {
      setPhase("failure");
      setError(e instanceof ApiClientError ? e.message : String(e));
      if (orderId && token) {
        void apiRequest("/payments/cancel", {
          method: "POST",
          token,
          body: JSON.stringify({ orderId }),
        }).catch(() => undefined);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ maxWidth: 720, margin: "32px auto", padding: 20, display: "grid", gap: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
        <div>
          <p style={{ margin: 0, opacity: 0.7, fontWeight: 700 }}>Parent</p>
          <h1 style={{ margin: "6px 0 0" }}>Subscription checkout</h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/parent">Dashboard</Link>
          <Button
            variant="secondary"
            onClick={() => {
              clearToken();
              router.push("/login");
            }}
          >
            Sign out
          </Button>
        </div>
      </div>

      {error ? <Alert tone="error">{error}</Alert> : null}
      {message ? <Alert tone="success">{message}</Alert> : null}

      {phase === "success" ? (
        <div className="panel">
          <strong>Payment successful</strong>
          <p>Entitlements update only after the server verifies the payment with the gateway.</p>
          <Link href="/parent">Back to parent dashboard</Link>
        </div>
      ) : null}

      {phase === "pending" && busy ? (
        <Alert tone="info">
          {gateway === "cashfree" ? "Opening secure Cashfree checkout…" : "Opening secure Razorpay checkout…"}
        </Alert>
      ) : null}

      {phase === "failure" && !busy ? (
        <div className="panel">
          <strong>Payment not completed</strong>
          <p>No seats or subscription changes were applied without verification.</p>
          <Button onClick={() => setPhase("pick")}>Try again</Button>
        </div>
      ) : null}

      {catalog && !catalog.enabled ? (
        <Alert tone="info">
          {catalog.note ??
            "Checkout unavailable until plan prices and Razorpay sandbox keys are configured."}
        </Alert>
      ) : null}

      {catalog?.enabled ? (
        <>
          <div className="panel" style={{ display: "grid", gap: 10 }}>
            <strong>Available plans</strong>
            {catalog.plans.map((p) => {
              const key = p.planId ?? p.code ?? p.purpose;
              return (
                <label
                  key={key}
                  style={{ display: "flex", gap: 10, alignItems: "flex-start" }}
                >
                  <input
                    type="radio"
                    name="plan"
                    checked={selectedKey === key}
                    onChange={() => setSelectedKey(key)}
                  />
                  <span>
                    <strong>{p.label}</strong> —{" "}
                    {formatMoney(p.totalPaise, p.currency)}
                    <div style={{ fontSize: 13, opacity: 0.75 }}>
                      {p.description}
                    </div>
                    {p.includedSeats ? (
                      <div style={{ fontSize: 12 }}>
                        Includes {p.includedSeats} child seat
                        {p.includedSeats === 1 ? "" : "s"}
                      </div>
                    ) : null}
                    {p.taxPaise > 0 ? (
                      <div style={{ fontSize: 12 }}>
                        Base {formatMoney(p.amountPaise, p.currency)} + tax{" "}
                        {formatMoney(p.taxPaise, p.currency)}
                      </div>
                    ) : null}
                  </span>
                </label>
              );
            })}
            {plan?.purpose === "EXTRA_SEATS" ? (
              <label>
                Extra seats:{" "}
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={extraSeats}
                  onChange={(e) => setExtraSeats(Number(e.target.value) || 1)}
                />
              </label>
            ) : null}
          </div>

          <div className="panel">
            <strong>Order summary</strong>
            <p style={{ margin: "8px 0" }}>
              {orderPlan?.label ?? "—"}
              {plan?.purpose === "EXTRA_SEATS" ? ` × ${extraSeats}` : ""}
            </p>
            <p style={{ margin: 0 }}>
              Total (incl. tax if configured):{" "}
              <strong>
                {plan ? formatMoney(previewTotal, plan.currency) : "—"}
              </strong>
            </p>
            {gateways.razorpay && gateways.cashfree ? (
              <fieldset style={{ border: "1px solid #e5e7eb", borderRadius: 10, padding: 10, margin: "8px 0" }}>
                <legend style={{ fontWeight: 700, fontSize: 14 }}>Pay with</legend>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="radio"
                    name="gateway"
                    checked={gateway === "razorpay"}
                    onChange={() => setGateway("razorpay")}
                  />
                  Razorpay
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <input
                    type="radio"
                    name="gateway"
                    checked={gateway === "cashfree"}
                    onChange={() => setGateway("cashfree")}
                  />
                  Cashfree (UPI, cards, net banking, wallets)
                </label>
              </fieldset>
            ) : null}
            {gateway === "cashfree" ? (
              <label style={{ display: "grid", gap: 4, fontSize: 14, margin: "8px 0" }}>
                Mobile number (needed by Cashfree if not on your account)
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={13}
                  placeholder="10-digit mobile"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  style={{ padding: 8, borderRadius: 8, border: "1px solid #d1d5db" }}
                />
              </label>
            ) : null}
            <p style={{ fontSize: 13, opacity: 0.75 }}>
              Subscription activates only after the server confirms the payment with{" "}
              {gateway === "cashfree" ? "Cashfree" : "Razorpay"}.
              {gateway === "cashfree" && catalog.cashfreeMode === "sandbox"
                ? " Cashfree is in test mode — no real money is charged."
                : ""}
            </p>
            <Button
              disabled={busy || !plan || !catalog.enabled}
              onClick={() =>
                void (gateway === "cashfree" ? startCashfreeCheckout() : startCheckout())
              }
            >
              {gateway === "cashfree" ? "Pay securely with Cashfree" : "Pay securely with Razorpay"}
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}
