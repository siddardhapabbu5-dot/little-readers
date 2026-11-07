"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, TextField } from "@little-readers/ui";
import { apiRequest, ApiClientError } from "@/lib/api";
import { saveToken } from "@/lib/auth-storage";
import { EmailOtpVerify } from "@/components/EmailOtpVerify";
import type { RegisterResponse } from "@little-readers/types";

type PublicPrivacy = {
  published: boolean;
  message: string | null;
  policy: { version: string; title: string; publicUrl?: string | null } | null;
};

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [privacy, setPrivacy] = useState<PublicPrivacy | null>(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptPrivacy, setAcceptPrivacy] = useState(false);
  const [parentalConsent, setParentalConsent] = useState(false);
  const [email, setEmail] = useState("");
  const [emailToken, setEmailToken] = useState<string | null>(null);
  const [verifiedEmail, setVerifiedEmail] = useState<string | null>(null);
  const emailVerified = Boolean(emailToken) && verifiedEmail === email.trim().toLowerCase();

  useEffect(() => {
    void apiRequest<PublicPrivacy>("/privacy/policy")
      .then(setPrivacy)
      .catch(() =>
        setPrivacy({
          published: false,
          message:
            "Could not load privacy policy status. Registration requires a published policy.",
          policy: null,
        })
      );
  }, []);

  const policyReady = Boolean(privacy?.published && privacy.policy?.version);
  const privacyHref = privacy?.policy?.publicUrl || "/privacy";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!policyReady) {
      setError(
        privacy?.message ??
          "Registration is unavailable until the Privacy Policy is published."
      );
      return;
    }
    if (!emailVerified) {
      setError("Verify your email with the 6-digit code before creating the account.");
      return;
    }
    if (!acceptTerms || !acceptPrivacy || !parentalConsent) {
      setError(
        "Please review and accept Terms, Privacy Policy, and parental confirmation."
      );
      return;
    }

    setLoading(true);
    const form = new FormData(event.currentTarget);
    const mobile = String(form.get("mobile") ?? "").trim();
    const payload = {
      name: String(form.get("name") ?? ""),
      email: email.trim(),
      password: String(form.get("password") ?? ""),
      ...(mobile ? { mobile } : {}),
      emailVerificationToken: emailToken,
      acceptTerms,
      acceptPrivacy,
      parentalConsent,
      privacyPolicyVersion: privacy!.policy!.version,
    };

    try {
      const data = await apiRequest<RegisterResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      saveToken(data.tokens.accessToken);
      router.push("/parent");
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message);
      } else {
        setError("Unable to register. Is the API running?");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card-form" onSubmit={onSubmit}>
      <h1 style={{ margin: 0 }}>Parent registration</h1>
      <p className="muted" style={{ margin: 0 }}>
        Create an account to manage child profiles. Consent checkboxes start
        unchecked and must be selected explicitly.
      </p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      {!policyReady ? (
        <Alert tone="error">
          {privacy?.message ??
            "Privacy Policy not published yet. Registration is disabled until an administrator publishes an approved policy."}
        </Alert>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Privacy Policy {privacy?.policy?.version}
          {privacy?.policy?.title ? ` · ${privacy.policy.title}` : ""}
        </p>
      )}
      <TextField label="Full name" name="name" required autoComplete="name" />
      <TextField
        label="Email"
        name="email"
        type="email"
        required
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      {emailVerified ? (
        <p style={{ margin: 0, color: "#15803d", fontWeight: 700 }}>✓ Email verified</p>
      ) : (
        <EmailOtpVerify
          email={email}
          purpose="REGISTER"
          disabled={loading}
          onVerified={(token) => {
            setEmailToken(token);
            setVerifiedEmail(email.trim().toLowerCase());
          }}
        />
      )}
      <TextField
        label="Password"
        name="password"
        type="password"
        required
        autoComplete="new-password"
        minLength={8}
      />
      <TextField
        label="Mobile number (optional, for contact only)"
        name="mobile"
        type="tel"
        autoComplete="tel"
        placeholder="e.g. 9876543210"
      />
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={acceptTerms}
          disabled={!policyReady || loading}
          onChange={(e) => setAcceptTerms(e.target.checked)}
        />
        <span>
          I accept the{" "}
          <a href="/terms" target="_blank" rel="noreferrer">
            Terms of Service
          </a>
          .
        </span>
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={acceptPrivacy}
          disabled={!policyReady || loading}
          onChange={(e) => setAcceptPrivacy(e.target.checked)}
        />
        <span>
          I accept the{" "}
          <a href={privacyHref} target="_blank" rel="noreferrer">
            Privacy Policy
          </a>
          {privacy?.policy?.version ? ` (version ${privacy.policy.version})` : ""}.
        </span>
      </label>
      <label className="checkbox-row">
        <input
          type="checkbox"
          checked={parentalConsent}
          disabled={!policyReady || loading}
          onChange={(e) => setParentalConsent(e.target.checked)}
        />
        <span>
          I confirm I am a parent/guardian and consent to create learning
          profiles for my children.
        </span>
      </label>
      <Button type="submit" loading={loading} disabled={!policyReady || !emailVerified}>
        Create account
      </Button>
      <p className="muted">
        Already registered? <a href="/login">Log in</a>
      </p>
    </form>
  );
}
