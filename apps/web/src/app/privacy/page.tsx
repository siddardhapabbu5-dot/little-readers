"use client";

import {
  FormEvent,
  useEffect,
  useState,
  type CSSProperties,
} from "react";
import { MarketingPage } from "@/components/MarketingPage";
import { apiRequest, ApiClientError } from "@/lib/api";

type PublicPolicy = {
  published: boolean;
  message: string | null;
  policy: {
    version: string;
    title: string;
    content: string;
    effectiveDate?: string | null;
    legalBusinessName?: string | null;
    businessAddress?: string | null;
    country?: string | null;
    supportEmail?: string | null;
    supportPhone?: string | null;
    dataRetentionInfo?: string | null;
    deletionRequestContact?: string | null;
    parentalConsentExplanation?: string | null;
    childDataDisclosure?: string | null;
    learningDataDisclosure?: string | null;
    deviceDataDisclosure?: string | null;
    thirdPartyDisclosure?: string | null;
  } | null;
};

function Block({ title, body }: { title: string; body?: string | null }) {
  if (!body?.trim()) return null;
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: "1.15rem", marginBottom: 8 }}>{title}</h2>
      <p style={{ whiteSpace: "pre-wrap", margin: 0 }}>{body}</p>
    </section>
  );
}

export default function PrivacyPage() {
  const [data, setData] = useState<PublicPolicy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reqMsg, setReqMsg] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [reqName, setReqName] = useState("");
  const [reqStatus, setReqStatus] = useState<string | null>(null);
  const [reqError, setReqError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void apiRequest<PublicPolicy>("/privacy/policy")
      .then(setData)
      .catch((e) =>
        setError(
          e instanceof ApiClientError
            ? e.message
            : "Could not load privacy policy"
        )
      );
  }, []);

  async function onRequest(e: FormEvent) {
    e.preventDefault();
    setReqError(null);
    setReqStatus(null);
    setBusy(true);
    try {
      const res = await apiRequest<{ message?: string }>("/privacy/requests", {
        method: "POST",
        body: JSON.stringify({
          requesterEmail: reqEmail.trim(),
          requesterName: reqName.trim() || undefined,
          requestType: "ACCOUNT_DELETION",
          message: reqMsg.trim(),
        }),
      });
      setReqStatus(
        res.message ??
          "Request received for administrator review. Nothing was deleted automatically."
      );
      setReqMsg("");
    } catch (err) {
      setReqError(
        err instanceof ApiClientError ? err.message : "Could not submit request"
      );
    } finally {
      setBusy(false);
    }
  }

  const policy = data?.policy;

  return (
    <MarketingPage title={policy?.title?.trim() || "Privacy Policy"}>
      {error ? <p style={{ color: "#B91C1C" }}>{error}</p> : null}

      {!data ? (
        <p className="muted">Loading…</p>
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
              ? ` · Effective ${new Date(policy.effectiveDate).toLocaleDateString()}`
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

      <section
        style={{
          marginTop: 36,
          paddingTop: 24,
          borderTop: "1px solid #D9E4F5",
        }}
      >
        <h2 style={{ fontSize: "1.15rem", marginBottom: 8 }}>
          Submit a privacy request
        </h2>
        <p style={{ marginTop: 0 }}>
          Use this form to request account or data deletion review. Submission
          records a request only — no automatic deletion.
        </p>
        <form
          onSubmit={onRequest}
          style={{ display: "grid", gap: 10, maxWidth: 480 }}
        >
          <label style={{ display: "grid", gap: 4 }}>
            <span>Your name</span>
            <input
              value={reqName}
              onChange={(e) => setReqName(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Email</span>
            <input
              type="email"
              required
              value={reqEmail}
              onChange={(e) => setReqEmail(e.target.value)}
              style={inputStyle}
            />
          </label>
          <label style={{ display: "grid", gap: 4 }}>
            <span>Message</span>
            <textarea
              required
              minLength={10}
              rows={4}
              value={reqMsg}
              onChange={(e) => setReqMsg(e.target.value)}
              style={{ ...inputStyle, resize: "vertical" }}
            />
          </label>
          {reqError ? <p style={{ color: "#B91C1C", margin: 0 }}>{reqError}</p> : null}
          {reqStatus ? (
            <p style={{ color: "#047857", margin: 0, fontWeight: 600 }}>
              {reqStatus}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            style={{
              justifySelf: "start",
              background: "#1677E8",
              color: "#fff",
              border: "none",
              borderRadius: 999,
              padding: "10px 18px",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            {busy ? "Submitting…" : "Submit request"}
          </button>
        </form>
      </section>
    </MarketingPage>
  );
}

const inputStyle: CSSProperties = {
  border: "1px solid #C5D4EA",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 15,
};
