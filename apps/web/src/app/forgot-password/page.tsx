"use client";

import { FormEvent, useState } from "react";
import { Alert } from "@little-readers/ui";
import { MarketingPage } from "@/components/MarketingPage";

/**
 * Password reset email delivery is not configured yet.
 * This page validates input and guides users without faking a successful reset.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setInfo(null);

    const trimmed = email.trim();
    if (!trimmed) {
      setError("Email address is required");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Enter a valid email address");
      return;
    }

    setInfo(
      "Password reset by email is not enabled yet. Please contact your school administrator or support for help accessing your account."
    );
  }

  return (
    <MarketingPage title="Forgot password">
      <p>
        Enter the email for your Little Readers parent or admin account. We will
        not pretend a reset email was sent until email delivery is configured.
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
          Continue
        </button>
        <a href="/login" style={{ fontWeight: 700, color: "#1677E8" }}>
          Back to login
        </a>
      </form>
    </MarketingPage>
  );
}
