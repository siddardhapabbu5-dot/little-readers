import type { Metadata } from "next";
import { MarketingPage } from "@/components/MarketingPage";
import { BusinessDetails } from "@/components/BusinessDetails";
import { getBusinessDetails } from "@/lib/public-data";

export const metadata: Metadata = {
  title: "Shipping & Delivery Policy – LEARN WISE",
};
export const revalidate = 300;

export default async function ShippingPolicyPage() {
  const details = await getBusinessDetails();
  return (
    <MarketingPage title="Shipping & Delivery Policy">
      <p style={{ marginTop: 0 }}>
        <strong>Effective:</strong> 9 November 2026
      </p>

      <h2 style={{ fontSize: "1.15rem" }}>1. Digital service – no physical shipping</h2>
      <p>
        LEARN WISE is an online learning service. We do not sell or ship any
        physical products, so no shipping charges apply and nothing is delivered
        to a postal address.
      </p>

      <h2 style={{ fontSize: "1.15rem" }}>2. How the service is delivered</h2>
      <p>
        After successful payment, your subscription is activated on your parent
        account automatically, usually within a few minutes. You can then use
        LEARN WISE on {details.website} and in the LEARN WISE Android app by
        logging in with the same account. A payment receipt is available in your
        account.
      </p>

      <h2 style={{ fontSize: "1.15rem" }}>3. Delays</h2>
      <p>
        In rare cases, activation may take up to 24 hours because of payment
        network delays. If your subscription is not active within 24 hours of
        payment, please contact us with your payment reference and we will
        activate it or refund the payment as described in our{" "}
        <a href="/refund-policy">Refund &amp; Cancellation Policy</a>.
      </p>

      <h2 style={{ fontSize: "1.15rem" }}>4. Service area</h2>
      <p>
        The service is offered to customers in India. Prices are charged in
        Indian Rupees (INR).
      </p>

      <h2 style={{ fontSize: "1.15rem" }}>5. Contact</h2>
      <BusinessDetails details={details} />
    </MarketingPage>
  );
}
