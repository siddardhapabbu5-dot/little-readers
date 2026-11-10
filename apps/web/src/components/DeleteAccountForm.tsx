"use client";

import { FormEvent, useState, type CSSProperties } from "react";
import { apiRequest, ApiClientError } from "@/lib/api";

type Receipt = { reference: string; message: string };

export function DeleteAccountForm() {
  const [countryCode, setCountryCode] = useState("+91");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await apiRequest<Receipt>("/privacy/deletion-requests", {
        method: "POST",
        body: JSON.stringify({
          mobile: mobile.trim(),
          countryCode,
          email: email.trim() || undefined,
          name: name.trim() || undefined,
          reason: reason.trim() || undefined,
        }),
      });
      setReceipt(res);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not submit your request. Please try again."
      );
    } finally {
      setBusy(false);
    }
  }

  if (receipt) {
    return (
      <section style={boxStyle} role="status" aria-live="polite">
        <h2 style={{ fontSize: "1.15rem", margin: "0 0 8px", color: "#047857" }}>
          ✅ Request received
        </h2>
        <p style={{ margin: "0 0 8px" }}>{receipt.message}</p>
        <p style={{ margin: 0 }}>
          Reference: <strong>{receipt.reference}</strong>. Please keep it for your records. We will
          contact you once your request has been verified.
        </p>
      </section>
    );
  }

  return (
    <section style={{ ...boxStyle, marginTop: 32 }}>
      <h2 style={{ fontSize: "1.15rem", margin: "0 0 8px" }}>Account deletion request</h2>
      <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, maxWidth: 480 }}>
        <div style={labelStyle}>
          <label htmlFor="delete-account-mobile">Registered mobile number *</label>
          <div style={{ display: "flex", gap: 8 }}>
            <select
              aria-label="Country code"
              value={countryCode}
              onChange={(e) => setCountryCode(e.target.value)}
              style={{ ...inputStyle, width: 96 }}
            >
              <option value="+91">🇮🇳 +91</option>
              <option value="+63">🇵🇭 +63</option>
              <option value="+971">🇦🇪 +971</option>
              <option value="+65">🇸🇬 +65</option>
              <option value="+44">🇬🇧 +44</option>
              <option value="+1">🇺🇸 +1</option>
              <option value="+61">🇦🇺 +61</option>
            </select>
            <input
              id="delete-account-mobile"
              type="tel"
              inputMode="tel"
              autoComplete="tel-national"
              required
              minLength={6}
              maxLength={20}
              value={mobile}
              onChange={(e) => setMobile(e.target.value)}
              placeholder="Mobile number"
              style={{ ...inputStyle, flex: 1 }}
            />
          </div>
        </div>
        <label style={labelStyle}>
          <span>Parent email (if your account has one)</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          <span>Parent name (optional)</span>
          <input
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={inputStyle}
          />
        </label>
        <label style={labelStyle}>
          <span>Reason (optional)</span>
          <textarea
            rows={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </label>
        <label style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          <input
            type="checkbox"
            required
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            style={{ marginTop: 4 }}
          />
          <span>
            I am the parent or guardian on this account. I understand that after verification my
            account, child profiles and learning data will be permanently deleted.
          </span>
        </label>
        {error ? <p style={{ color: "#B91C1C", margin: 0 }}>{error}</p> : null}
        <button
          type="submit"
          disabled={busy || !confirmed}
          style={{
            justifySelf: "start",
            background: busy || !confirmed ? "#93B8EC" : "#DC2626",
            color: "#fff",
            border: "none",
            borderRadius: 999,
            padding: "10px 18px",
            fontWeight: 700,
            cursor: busy || !confirmed ? "not-allowed" : "pointer",
          }}
        >
          {busy ? "Submitting…" : "Request account deletion"}
        </button>
      </form>
    </section>
  );
}

const boxStyle: CSSProperties = {
  marginTop: 32,
  padding: 20,
  border: "1px solid #D9E4F5",
  borderRadius: 12,
  background: "#F8FBFF",
};

const labelStyle: CSSProperties = { display: "grid", gap: 4 };

const inputStyle: CSSProperties = {
  border: "1px solid #C5D4EA",
  borderRadius: 8,
  padding: "10px 12px",
  fontSize: 15,
};
