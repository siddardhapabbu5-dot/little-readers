import type { Metadata } from "next";
import { MarketingPage } from "@/components/MarketingPage";
import { BusinessDetails } from "@/components/BusinessDetails";
import { getBusinessDetails } from "@/lib/public-data";

export const metadata: Metadata = { title: "Contact Us – LEARN WISE" };
export const revalidate = 300;

export default async function ContactPage() {
  const details = await getBusinessDetails();
  return (
    <MarketingPage title="Contact Us">
      <p>
        We are happy to help with accounts, subscriptions, payments, refunds and
        learning questions.
      </p>
      <BusinessDetails details={details} />
      <h2 style={{ fontSize: "1.15rem", marginTop: 28 }}>Support hours</h2>
      <p style={{ marginTop: 0 }}>
        Monday to Saturday, 10:00 AM – 6:00 PM IST. We reply to emails within
        1–2 working days.
      </p>
      <h2 style={{ fontSize: "1.15rem" }}>Payment or refund questions</h2>
      <p style={{ marginTop: 0 }}>
        Please email us with your registered email address and the payment
        reference shown on your receipt. See our{" "}
        <a href="/refund-policy">Refund &amp; Cancellation Policy</a> for details.
      </p>
    </MarketingPage>
  );
}
