import type { Metadata } from "next";
import { MarketingPage } from "@/components/MarketingPage";
import { BusinessDetails } from "@/components/BusinessDetails";
import { getBusinessDetails } from "@/lib/public-data";

export const metadata: Metadata = { title: "About Us – LEARN WISE" };
export const revalidate = 300;

export default async function AboutPage() {
  const details = await getBusinessDetails();
  return (
    <MarketingPage title="About LEARN WISE">
      <p>
        LEARN WISE is a parent-guided English reading and spelling app for Grade 1
        children, operated by {details.legalName} in India.
      </p>
      <p>
        Children learn 750 everyday words across 10 topics through short
        activities – listening, spelling, quizzes, matching and revision – and
        earn stars, achievements and certificates as they progress. Parents
        manage child profiles, track progress and control settings and payments
        behind a parent PIN.
      </p>
      <p>
        LEARN WISE works on our website, the LEARN WISE Android app and Android
        TV. There are no ads, no chat and no public child profiles.
      </p>
      <h2 style={{ fontSize: "1.15rem", marginTop: 28 }}>Business details</h2>
      <BusinessDetails details={details} />
    </MarketingPage>
  );
}
