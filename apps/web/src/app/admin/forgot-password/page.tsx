"use client";

import { FormEvent, useState } from "react";
import { Alert } from "@little-readers/ui";
import { MarketingPage } from "@/components/MarketingPage";
import { apiRequest, ApiClientError } from "@/lib/api";

type ForgotResult = {
  message: string;
  devResetToken?: string;
};

export default function AdminForgotPasswordPage() {
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

    setLoading(true);
    try {
      const data = await apiRequest<ForgotResult>("/admin/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: trimmed, client: "web" }),
      });
      setInfo(data.message);
      if (data.devResetToken) setDevToken(data.devResetToken);
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Could not start password reset"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <MarketingPage title="Admin forgot password">
      <p>
        Enter your Admin email. If an account exists, a reset link is sent
        (expires in 15 minutes). We never email your password.
      </p>
      <form
        onSubmit={onSubmit}
        style={{ display: "grid", gap: 12, marginTop: 20, maxWidth: 420 }}
      >
        {error ? <Alert tone="error">{error}</Alert> : null}
        {info ? <Alert tone="info">{info}</Alert> : null}
        <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>
          Admin email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
            disabled={loading}
            style={inputStyle}
          />
        </label>
        <button type="submit" disabled={loading} style={btnStyle}>
          {loading ? "Sending…" : "Send reset link"}
        </button>
        {devToken ? (
          <a
            href={`/admin/reset-password?token=${encodeURIComponent(devToken)}`}
            style={{ fontWeight: 800, color: "#1677E8" }}
          >
            Open reset screen (test token)
          </a>
        ) : null}
        <a href="/login" style={{ fontWeight: 700, color: "#1677E8" }}>
          Return to login
        </a>
      </form>
    </MarketingPage>
  );
}

const inputStyle: React.CSSProperties = {
  border: "2px solid #dbe7f5",
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 16,
};

const btnStyle: React.CSSProperties = {
  border: 0,
  borderRadius: 999,
  padding: "12px 18px",
  background: "#1677E8",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
};
