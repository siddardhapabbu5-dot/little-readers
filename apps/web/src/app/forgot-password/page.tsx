"use client";

import { FormEvent, useState } from "react";
import { Alert } from "@little-readers/ui";
import { MarketingPage } from "@/components/MarketingPage";
import { apiRequest, ApiClientError } from "@/lib/api";

type ForgotResult = {
  accepted: boolean;
  message: string;
  deliveryChannel?: string;
  devResetToken?: string;
};

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);
    setDevToken(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setError("Email address is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address");
      return;
    }

    setLoading(true);
    try {
      const data = await apiRequest<ForgotResult>("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: trimmed, client: "web" }),
      });
      if (!data.accepted) {
        setError(data.message);
        return;
      }
      setInfo(data.message);
      if (data.devResetToken) setDevToken(data.devResetToken);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not start password reset");
    } finally {
      setLoading(false);
    }
  }

  return (
    <MarketingPage title="Forgot password">
      <p>
        Enter the email for your Little Readers account. Success is shown only after
        the reset email is delivered (or logged in local non-production test mode).
      </p>
      <form
        onSubmit={onSubmit}
        style={{ display: "grid", gap: 12, marginTop: 20, maxWidth: 420 }}
      >
        {error ? <Alert tone="error">{error}</Alert> : null}
        {info ? <Alert tone="info">{info}</Alert> : null}
        <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>
          Email address
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            disabled={loading}
            style={{
              border: "2px solid #dbe7f5",
              borderRadius: 12,
              padding: "12px 14px",
              fontSize: 16,
            }}
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          style={{
            border: "none",
            borderRadius: 12,
            padding: "12px 16px",
            background: "#1677E8",
            color: "#fff",
            fontWeight: 800,
            cursor: "pointer",
          }}
        >
          {loading ? "Sending…" : "Send reset link"}
        </button>
        {devToken ? (
          <a href={`/reset-password?token=${encodeURIComponent(devToken)}`} style={{ fontWeight: 700 }}>
            Open reset page (test token)
          </a>
        ) : null}
        <a href="/login" style={{ fontWeight: 700, color: "#1677E8" }}>
          Back to login
        </a>
      </form>
    </MarketingPage>
  );
}
