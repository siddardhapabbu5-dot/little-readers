import type { Metadata } from "next";
import { MarketingPage } from "@/components/MarketingPage";
import { durationText, formatInr, getPublicPlans } from "@/lib/public-data";

export const metadata: Metadata = { title: "Pricing – LEARN WISE" };
export const revalidate = 300;

export default async function PricingPage() {
  const plans = await getPublicPlans();
  return (
    <MarketingPage title="Pricing">
      <p style={{ marginTop: 0 }}>
        LEARN WISE is a digital learning subscription for parents. One payment
        unlocks the Grade 1 reading and spelling programme (listening, spelling,
        quizzes, matching, revision, games, rewards and certificates) on our
        website and Android app for the chosen period.
      </p>

      {plans.length === 0 ? (
        <p className="muted">
          Plans are being updated. Please check again shortly or{" "}
          <a href="/contact">contact us</a>.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            margin: "20px 0",
          }}
        >
          {plans.map((plan) => (
            <div
              key={plan.code}
              style={{
                background: "white",
                border: "1px solid #D9E4F5",
                borderRadius: 14,
                padding: 16,
              }}
            >
              <strong>{plan.label}</strong>
              <div style={{ fontSize: "1.6rem", fontWeight: 800, margin: "6px 0" }}>
                {formatInr(plan.totalPaise || plan.amountPaise)}
              </div>
              <div className="muted">Access for {durationText(plan.durationMonths)}</div>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ fontSize: "1.15rem" }}>How billing works</h2>
      <ul>
        <li>All prices are in Indian Rupees (INR) and include applicable taxes.</li>
        <li>
          Each plan is a one-time prepaid payment. Plans do <strong>not</strong>{" "}
          renew automatically and you are never charged again without choosing a
          new plan.
        </li>
        <li>Access starts immediately after successful payment.</li>
        <li>
          Payments are processed securely by Razorpay (UPI, cards, net banking and
          wallets). We never see or store your card details.
        </li>
        <li>
          Refunds and cancellations follow our{" "}
          <a href="/refund-policy">Refund &amp; Cancellation Policy</a>.
        </li>
      </ul>
      <p>
        To subscribe, <a href="/login">log in</a> or <a href="/register">create a
        parent account</a>, then open <strong>Subscription</strong>.
      </p>
    </MarketingPage>
  );
}
