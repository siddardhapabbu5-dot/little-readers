"use client";

import { FormEvent, useState, type CSSProperties } from "react";
import { apiRequest, ApiClientError } from "@/lib/api";

export function PrivacyRequestForm() {
  const [reqMsg, setReqMsg] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [reqName, setReqName] = useState("");
  const [reqStatus, setReqStatus] = useState<string | null>(null);
  const [reqError, setReqError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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

  return (
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
  );
}

const inputStyle: CSSProperties = {
  border: "1px solid #C5D4EA",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 15,
};
