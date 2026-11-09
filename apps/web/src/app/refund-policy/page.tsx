import type { Metadata } from "next";
import { MarketingPage } from "@/components/MarketingPage";
import { BusinessDetails } from "@/components/BusinessDetails";
import { getBusinessDetails } from "@/lib/public-data";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy – LEARN WISE",
};
export const revalidate = 300;

export default async function RefundPolicyPage() {
  const details = await getBusinessDetails();
  return (
    <MarketingPage title="Refund & Cancellation Policy">
      <p style={{ marginTop: 0 }}>
        <strong>Effective:</strong> 9 November 2026
      </p>
      <p>
        This policy applies to LEARN WISE subscriptions purchased on{" "}
        {details.website} or in the LEARN WISE app, operated by{" "}
        {details.legalName}.
      </p>

      <h2 style={{ fontSize: "1.15rem" }}>1. What you buy</h2>
      <p>
        LEARN WISE sells digital learning subscriptions (Monthly, 3 Months, 6
        Months and 1 Year). Each plan is a one-time prepaid payment for access to
        the learning programme for the chosen period. Plans do not renew
        automatically. Current prices are listed on our{" "}
        <a href="/pricing">Pricing</a> page.
      </p>

      <h2 style={{ fontSize: "1.15rem" }}>2. Cancellation</h2>
      <p>
        You can stop using LEARN WISE at any time. Because plans do not renew
        automatically, no further payment is taken after your plan ends. If you
        cancel before the end of a paid period, your access continues until that
        period ends.
      </p>

      <h2 style={{ fontSize: "1.15rem" }}>3. Refund eligibility</h2>
      <ul>
        <li>
          <strong>7-day refund:</strong> you may request a full refund within 7
          days of your first purchase if you are not satisfied with the service.
        </li>
        <li>
          <strong>Duplicate or failed payments:</strong> if you were charged more
          than once for the same plan, or money was debited but your subscription
          was not activated, the extra or failed amount is refunded in full.
        </li>
        <li>
          <strong>Service problems:</strong> if a technical problem on our side
          stops you from using the service and we cannot fix it, we will refund
          the unused part of your plan.
        </li>
        <li>
          After 7 days from purchase, payments are non-refundable except in the
          cases above.
        </li>
      </ul>

      <h2 style={{ fontSize: "1.15rem" }}>4. How to request a refund</h2>
      <p>
        Email <a href={`mailto:${details.email}`}>{details.email}</a> from your
        registered email address with the subject &ldquo;Refund request&rdquo;,
        and include the payment reference shown on your receipt.
      </p>

      <h2 style={{ fontSize: "1.15rem" }}>5. Refund processing time</h2>
      <p>
        Approved refunds are processed within 5–7 working days to the original
        payment method (UPI, card, net banking or wallet) through our payment
        partner Razorpay. Your bank may take a few additional days to show the
        credit. When a refund is issued, access for that plan ends.
      </p>

      <h2 style={{ fontSize: "1.15rem" }}>6. Contact</h2>
      <BusinessDetails details={details} />
    </MarketingPage>
  );
}
