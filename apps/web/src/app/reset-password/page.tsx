"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert } from "@little-readers/ui";
import { MarketingPage } from "@/components/MarketingPage";
import { apiRequest, ApiClientError } from "@/lib/api";

function ResetPasswordForm() {
  const params = useSearchParams();
  const token = useMemo(() => params.get("token") ?? "", [params]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    if (!token || token.length < 20) {
      setError("This reset link is missing or invalid.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const data = await apiRequest<{ message: string }>("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password, confirmPassword }),
      });
      setSuccess(data.message);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not reset password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: "grid", gap: 12, marginTop: 20, maxWidth: 420 }}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="info">{success}</Alert> : null}
      <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>
        New password
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="new-password"
          required
          disabled={loading || Boolean(success)}
          style={inputStyle}
        />
      </label>
      <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>
        Confirm password
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
          disabled={loading || Boolean(success)}
          style={inputStyle}
        />
      </label>
      {!success ? (
        <button type="submit" disabled={loading} style={btnStyle}>
          {loading ? "Updating…" : "Update password"}
        </button>
      ) : (
        <a href="/login" style={{ fontWeight: 800, color: "#1677E8" }}>
          Back to login
        </a>
      )}
    </form>
  );
}

const inputStyle = {
  border: "2px solid #dbe7f5",
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 16,
} as const;

const btnStyle = {
  border: "none",
  borderRadius: 12,
  padding: "12px 16px",
  background: "#1677E8",
  color: "#fff",
  fontWeight: 800,
  cursor: "pointer",
} as const;

export default function ResetPasswordPage() {
  return (
    <MarketingPage title="Reset password">
      <p>Choose a new password for your Little Readers account.</p>
      <Suspense fallback={<p>Loading…</p>}>
        <ResetPasswordForm />
      </Suspense>
      <p style={{ marginTop: 16 }}>
        <a href="/login" style={{ fontWeight: 700, color: "#1677E8" }}>
          Back to login
        </a>
      </p>
    </MarketingPage>
  );
}
