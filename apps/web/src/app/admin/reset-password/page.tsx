"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Alert } from "@little-readers/ui";
import { MarketingPage } from "@/components/MarketingPage";
import { apiRequest, ApiClientError } from "@/lib/api";

const REQUIREMENTS = [
  { id: "len", label: "At least 12 characters", test: (p: string) => p.length >= 12 },
  { id: "upper", label: "One uppercase letter", test: (p: string) => /[A-Z]/.test(p) },
  { id: "lower", label: "One lowercase letter", test: (p: string) => /[a-z]/.test(p) },
  { id: "num", label: "One number", test: (p: string) => /[0-9]/.test(p) },
  {
    id: "special",
    label: "One special character",
    test: (p: string) => /[^A-Za-z0-9]/.test(p),
  },
] as const;

function AdminResetPasswordForm() {
  const params = useSearchParams();
  const token = useMemo(() => params.get("token") ?? "", [params]);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const score = REQUIREMENTS.filter((r) => r.test(password)).length;

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
    const failed = REQUIREMENTS.find((r) => !r.test(password));
    if (failed) {
      setError(`Password must include: ${failed.label.toLowerCase()}.`);
      return;
    }

    setLoading(true);
    try {
      const data = await apiRequest<{ message: string }>(
        "/admin/auth/reset-password",
        {
          method: "POST",
          body: JSON.stringify({ token, password, confirmPassword }),
        }
      );
      setSuccess(data.message);
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : "Could not reset password"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      style={{ display: "grid", gap: 12, marginTop: 20, maxWidth: 440 }}
    >
      {error ? <Alert tone="error">{error}</Alert> : null}
      {success ? <Alert tone="info">{success}</Alert> : null}

      <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>
        New Password
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            required
            disabled={loading || Boolean(success)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            style={toggleStyle}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
      </label>

      <label style={{ display: "grid", gap: 6, fontWeight: 700 }}>
        Confirm New Password
        <div style={{ display: "flex", gap: 8 }}>
          <input
            type={showConfirm ? "text" : "password"}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
            disabled={loading || Boolean(success)}
            style={{ ...inputStyle, flex: 1 }}
          />
          <button
            type="button"
            onClick={() => setShowConfirm((s) => !s)}
            style={toggleStyle}
          >
            {showConfirm ? "Hide" : "Show"}
          </button>
        </div>
      </label>

      {!success ? (
        <div
          style={{
            background: "#f4f7fb",
            borderRadius: 12,
            padding: 12,
            display: "grid",
            gap: 6,
          }}
        >
          <strong>Password strength: {score}/5</strong>
          <div style={{ display: "flex", gap: 4, height: 6 }}>
            {REQUIREMENTS.map((r, i) => (
              <div
                key={r.id}
                style={{
                  flex: 1,
                  borderRadius: 3,
                  background: i < score ? "#16A34A" : "#E4E4E7",
                }}
              />
            ))}
          </div>
          <strong>Password requirements</strong>
          {REQUIREMENTS.map((r) => (
            <span key={r.id} style={{ fontSize: 13 }}>
              {r.test(password) ? "✓" : "○"} {r.label}
            </span>
          ))}
        </div>
      ) : null}

      {!success ? (
        <button type="submit" disabled={loading} style={btnStyle}>
          {loading ? "Resetting…" : "Reset Password"}
        </button>
      ) : (
        <a href="/login" style={{ fontWeight: 800, color: "#1677E8" }}>
          Return to Admin Login
        </a>
      )}
    </form>
  );
}

export default function AdminResetPasswordPage() {
  return (
    <MarketingPage title="Reset Admin password">
      <p>
        Choose a strong new password. Previous Admin sessions are signed out
        after a successful reset.
      </p>
      <Suspense fallback={<p>Loading…</p>}>
        <AdminResetPasswordForm />
      </Suspense>
    </MarketingPage>
  );
}

const inputStyle: React.CSSProperties = {
  border: "2px solid #dbe7f5",
  borderRadius: 12,
  padding: "12px 14px",
  fontSize: 16,
};

const toggleStyle: React.CSSProperties = {
  border: "2px solid #dbe7f5",
  borderRadius: 12,
  padding: "0 12px",
  background: "#fff",
  fontWeight: 700,
  cursor: "pointer",
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
