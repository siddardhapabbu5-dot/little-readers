"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, TextField } from "@little-readers/ui";
import { apiRequest, ApiClientError } from "@/lib/api";
import { saveToken } from "@/lib/auth-storage";
import type { RegisterResponse } from "@little-readers/types";

export default function RegisterPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    const form = new FormData(event.currentTarget);
    const payload = {
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      acceptTerms: form.get("acceptTerms") === "on",
      acceptPrivacy: form.get("acceptPrivacy") === "on",
      parentalConsent: form.get("parentalConsent") === "on",
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
        Create an account to manage child profiles. Subscription billing arrives
        in Phase 8.
      </p>
      {error ? <Alert tone="error">{error}</Alert> : null}
      <TextField label="Full name" name="name" required autoComplete="name" />
      <TextField
        label="Email"
        name="email"
        type="email"
        required
        autoComplete="email"
      />
      <TextField
        label="Password"
        name="password"
        type="password"
        required
        autoComplete="new-password"
        minLength={8}
      />
      <label className="checkbox-row">
        <input type="checkbox" name="acceptTerms" required />
        <span>I accept the Terms of Service</span>
      </label>
      <label className="checkbox-row">
        <input type="checkbox" name="acceptPrivacy" required />
        <span>I accept the Privacy Policy</span>
      </label>
      <label className="checkbox-row">
        <input type="checkbox" name="parentalConsent" required />
        <span>
          I confirm I am a parent/guardian and consent to create learning
          profiles for my children
        </span>
      </label>
      <Button type="submit" loading={loading}>
        Create account
      </Button>
      <p className="muted">
        Already registered? <a href="/login">Log in</a>
      </p>
    </form>
  );
}
