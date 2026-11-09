import type { Metadata } from "next";
import { MarketingPage } from "@/components/MarketingPage";
import { PrivacyRequestForm } from "@/components/PrivacyRequestForm";
import { getPublicPolicy } from "@/lib/public-data";

export const metadata: Metadata = { title: "Privacy Policy – LEARN WISE" };
export const revalidate = 300;

function Block({ title, body }: { title: string; body?: string | null }) {
  if (!body?.trim()) return null;
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: "1.15rem", marginBottom: 8 }}>{title}</h2>
      <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{body}</p>
    </section>
  );
}

export default async function PrivacyPage() {
  const data = await getPublicPolicy();
  const policy = data?.policy;

  return (
    <MarketingPage title={policy?.title?.trim() || "Privacy Policy"}>
      {!data ? (
        <p style={{ color: "#B91C1C" }}>
          Could not load the privacy policy right now. Please refresh the page.
        </p>
      ) : !data.published || !policy ? (
        <div
          style={{
            background: "#FFF7ED",
            border: "1px solid #FED7AA",
            borderRadius: 12,
            padding: 16,
          }}
        >
          <p style={{ margin: 0, fontWeight: 700 }}>Policy not published yet</p>
          <p style={{ marginTop: 8, marginBottom: 0 }}>
            {data.message ??
              "An approved privacy policy has not been published. Registration and parental consent require a published policy. Administrators can complete and publish content from Admin → Settings → Privacy & Compliance."}
          </p>
        </div>
      ) : (
        <>
          <p style={{ marginTop: 0 }}>
            <strong>Version:</strong> {policy.version}
            {policy.effectiveDate
              ? ` · Effective ${new Date(policy.effectiveDate).toLocaleDateString("en-IN")}`
              : null}
          </p>

          {(policy.legalBusinessName ||
            policy.businessAddress ||
            policy.country ||
            policy.supportEmail ||
            policy.supportPhone) && (
            <section style={{ marginTop: 16 }}>
              <h2 style={{ fontSize: "1.15rem", marginBottom: 8 }}>
                Business details
              </h2>
              {policy.legalBusinessName ? (
                <p style={{ margin: "4px 0" }}>{policy.legalBusinessName}</p>
              ) : null}
              {policy.businessAddress ? (
                <p style={{ margin: "4px 0", whiteSpace: "pre-wrap" }}>
                  {policy.businessAddress}
                </p>
              ) : null}
              {policy.country ? (
                <p style={{ margin: "4px 0" }}>{policy.country}</p>
              ) : null}
              {policy.supportEmail ? (
                <p style={{ margin: "4px 0" }}>
                  Support:{" "}
                  <a href={`mailto:${policy.supportEmail}`}>
                    {policy.supportEmail}
                  </a>
                </p>
              ) : null}
              {policy.supportPhone ? (
                <p style={{ margin: "4px 0" }}>Phone: {policy.supportPhone}</p>
              ) : null}
            </section>
          )}

          <section style={{ marginTop: 24 }}>
            <h2 style={{ fontSize: "1.15rem", marginBottom: 8 }}>Policy</h2>
            <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{policy.content}</p>
          </section>

          <Block
            title="Parent/guardian consent"
            body={policy.parentalConsentExplanation}
          />
          <Block
            title="Child data collection"
            body={policy.childDataDisclosure}
          />
          <Block title="Learning data" body={policy.learningDataDisclosure} />
          <Block
            title="Device information"
            body={policy.deviceDataDisclosure}
          />
          <Block
            title="Third-party services"
            body={policy.thirdPartyDisclosure}
          />
          <Block title="Data retention" body={policy.dataRetentionInfo} />

          {policy.deletionRequestContact ? (
            <section style={{ marginTop: 24 }}>
              <h2 style={{ fontSize: "1.15rem", marginBottom: 8 }}>
                Account / data deletion requests
              </h2>
              <p style={{ margin: 0 }}>
                Contact: {policy.deletionRequestContact}. Requests are reviewed by
                an administrator; accounts and learning history are not deleted
                automatically.
              </p>
            </section>
          ) : null}
        </>
      )}

      <PrivacyRequestForm />
    </MarketingPage>
  );
}
