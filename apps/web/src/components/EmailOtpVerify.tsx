"use client";

import { useEffect, useState } from "react";
import { Alert, Button, TextField } from "@little-readers/ui";
import { apiRequest, ApiClientError } from "@/lib/api";

type Purpose = "REGISTER" | "RESET_PASSWORD";

/** Send code → enter 6 digits → verify. Mirrors the mobile EmailOtpVerify component. */
export function EmailOtpVerify({
  email,
  purpose,
  disabled,
  onVerified,
}: {
  email: string;
  purpose: Purpose;
  disabled?: boolean;
  onVerified: (verificationToken: string) => void;
}) {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [resendIn, setResendIn] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const normalized = email.trim().toLowerCase();
  const codeSent = sentTo !== null && sentTo === normalized;

  async function send() {
    setError(null);
    setInfo(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
      setError("Enter a valid email address first.");
      return;
    }
    setBusy(true);
    try {
      const data = await apiRequest<{ message: string; resendInSec: number; expiresInSec: number }>(
        "/auth/email-otp/send",
        { method: "POST", body: JSON.stringify({ email: normalized, purpose }) }
      );
      setSentTo(normalized);
      setCode("");
      setResendIn(data.resendInSec ?? 60);
      setInfo(
        `${data.message} The code expires in ${Math.round((data.expiresInSec ?? 300) / 60)} minutes.`
      );
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not send the code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError(null);
    setInfo(null);
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    setBusy(true);
    try {
      const data = await apiRequest<{ verificationToken: string }>("/auth/email-otp/verify", {
        method: "POST",
        body: JSON.stringify({ email: normalized, purpose, otp: code }),
      });
      onVerified(data.verificationToken);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not verify the code. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  const locked = Boolean(disabled) || busy;

  return (
    <div style={{ display: "grid", gap: 10 }}>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {info ? <Alert tone="info">{info}</Alert> : null}
      {codeSent ? (
        <>
          <TextField
            label={`6-digit code sent to ${sentTo}`}
            name="emailOtp"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            disabled={locked}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void verify();
              }
            }}
          />
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <Button loading={busy} disabled={locked} onClick={() => void verify()}>
              Verify
            </Button>
            <Button
              variant="secondary"
              disabled={locked || resendIn > 0}
              onClick={() => void send()}
            >
              {resendIn > 0 ? `Resend code in ${resendIn}s` : "Resend code"}
            </Button>
          </div>
        </>
      ) : (
        <Button
          variant="secondary"
          loading={busy}
          disabled={locked || resendIn > 0}
          onClick={() => void send()}
        >
          {resendIn > 0 ? `Send code in ${resendIn}s` : "Send verification code"}
        </Button>
      )}
    </div>
  );
}
