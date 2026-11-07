"use client";

import { FormEvent, useState } from "react";
import { Alert, Button, TextField } from "@little-readers/ui";
import { MarketingPage } from "@/components/MarketingPage";
import { EmailOtpVerify } from "@/components/EmailOtpVerify";
import { apiRequest, ApiClientError } from "@/lib/api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onReset(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const data = await apiRequest<{ message: string }>("/auth/reset-password-otp", {
        method: "POST",
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          verificationToken: token,
          password,
          confirmPassword,
        }),
      });
      setSuccess(data.message);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not reset password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <MarketingPage title="Forgot password">
      <p>
        {token
          ? "Email verified. Choose a new password (at least 8 characters, with a letter and a number)."
          : "Enter the email for your LEARN WISE account. We'll send a 6-digit verification code to it."}
      </p>
      <div style={{ display: "grid", gap: 12, marginTop: 20, maxWidth: 420 }}>
        {!token ? (
          <>
            <TextField
              label="Email address"
              name="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <EmailOtpVerify email={email} purpose="RESET_PASSWORD" onVerified={setToken} />
          </>
        ) : success ? (
          <>
            <Alert tone="success">{success}</Alert>
            <a href="/login" style={{ fontWeight: 700, color: "#1677E8" }}>
              Go to login
            </a>
          </>
        ) : (
          <form onSubmit={onReset} style={{ display: "grid", gap: 12 }}>
            {error ? <Alert tone="error">{error}</Alert> : null}
            <TextField
              label="New password"
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={8}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <TextField
              label="Confirm password"
              name="confirmPassword"
              type="password"
              autoComplete="new-password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
            <Button type="submit" loading={loading}>
              Update password
            </Button>
          </form>
        )}
        {!success ? (
          <a href="/login" style={{ fontWeight: 700, color: "#1677E8" }}>
            Back to login
          </a>
        ) : null}
      </div>
    </MarketingPage>
  );
}
