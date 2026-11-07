"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiRequest, ApiClientError } from "@/lib/api";
import { saveToken } from "@/lib/auth-storage";
import { resolvePostLoginPath } from "@/lib/auth-redirect";
import type { LoginResponse } from "@little-readers/types";

function safeNextPath(value: string | null): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//")) return null;
  return value;
}

const FEATURES = [
  {
    title: "Interactive Learning",
    body: "Reading, spelling & more",
    icon: "📘",
    tone: "pink",
  },
  {
    title: "Speech Recognition",
    body: "Practice pronunciation",
    icon: "🎙️",
    tone: "green",
  },
  {
    title: "Track Progress",
    body: "See improvement",
    icon: "📊",
    tone: "purple",
  },
  {
    title: "Earn Rewards",
    body: "Stars, badges & certificates",
    icon: "🏆",
    tone: "orange",
  },
] as const;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    email?: string;
    password?: string;
  }>({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [roleOpen, setRoleOpen] = useState(false);

  const next = useMemo(
    () => safeNextPath(searchParams.get("next")),
    [searchParams]
  );

  function validate(email: string, password: string) {
    const nextErrors: { email?: string; password?: string } = {};
    if (!email.trim()) nextErrors.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      nextErrors.email = "Enter a valid email";
    }
    if (!password) nextErrors.password = "Password is required";
    else if (password.length < 8) nextErrors.password = "Min 8 characters";
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    if (!validate(email, password)) return;

    setLoading(true);
    try {
      const data = await apiRequest<LoginResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      saveToken(data.tokens.accessToken);
      router.push(resolvePostLoginPath(data.user, next));
    } catch (err) {
      setError(
        err instanceof ApiClientError
          ? err.message
          : "Unable to log in. Please try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="lr-pro">
      <div className="lr-pro-bg" aria-hidden="true">
        <div className="lr-pro-sky" />
        <div className="lr-pro-sun" />
        <div className="lr-pro-rainbow" />
        <div className="lr-pro-cloud c1" />
        <div className="lr-pro-cloud c2" />
        <div className="lr-pro-cloud c3" />
        <div className="lr-pro-castle" />
        <div className="lr-pro-hill back" />
        <div className="lr-pro-hill mid" />
        <div className="lr-pro-hill front" />
        <div className="lr-pro-flowers" />
      </div>

      <header className="lr-pro-nav">
        <a className="lr-pro-brand" href="/">
          <span className="lr-pro-logo" aria-hidden="true">
            📖
          </span>
          <span>
            <strong>LEARN WISE</strong>
            <small>Read • Spell • Learn • Grow</small>
          </span>
        </a>

        <button
          type="button"
          className="lr-pro-burger"
          aria-expanded={menuOpen}
          aria-controls="lr-pro-menu"
          onClick={() => setMenuOpen((v) => !v)}
        >
          Menu
        </button>

        <nav
          id="lr-pro-menu"
          className={`lr-pro-links${menuOpen ? " open" : ""}`}
        >
          <a href="/">🏠 Home</a>
          <a href="/for-parents">💖 For Parents</a>
          <a href="/for-schools">🏫 For Schools</a>
          <a href="/about">⭐ About</a>
          <a href="/help">❓ Help</a>
        </nav>

        <div className="lr-pro-role">
          <button
            type="button"
            className="lr-pro-role-btn"
            aria-expanded={roleOpen}
            onClick={() => setRoleOpen((v) => !v)}
          >
            ⚙️ Super Admin ▾
          </button>
          {roleOpen ? (
            <div className="lr-pro-role-menu" role="menu">
              <a href="/login">Parent / Admin Login</a>
              <a href="/parent">Parent Dashboard</a>
              <a href="/teacher">Teacher</a>
              <a href="/school">School Admin</a>
              <a href="/super-admin">Super Admin</a>
              <a href="/kids">Kids / Student</a>
            </div>
          ) : null}
        </div>
      </header>

      <main className="lr-pro-main">
        <section className="lr-pro-hero">
          <h1>
            Welcome to <span>LEARN WISE!</span>
          </h1>
          <p>
            A fun and smart way for kids to{" "}
            <em className="t-purple">read</em>,{" "}
            <em className="t-orange">spell</em> and{" "}
            <em className="t-blue">learn</em> English!
          </p>

          <div className="lr-pro-hero-visual">
            <div className="lr-pro-letters" aria-hidden="true">
              <span className="a">A</span>
              <span className="b">B</span>
              <span className="c">C</span>
            </div>
            <img
              src="/images/kids-readers-classroom.png?v=3"
              alt="Children reading and learning together"
              className="lr-pro-kids"
              width={640}
              height={420}
            />
          </div>
        </section>

        <section className="lr-pro-card-wrap">
          <form className="lr-pro-card" onSubmit={onSubmit} noValidate>
            <div className="lr-pro-ribbon">Parent / Admin Login</div>
            <p className="lr-pro-card-sub">
              Access your account to track progress and manage learning.
            </p>

            {error ? (
              <div className="lr-pro-error" role="alert">
                {error}
              </div>
            ) : null}

            <label className="lr-pro-field">
              <span className="lr-pro-field-label">Email</span>
              <span className="lr-pro-input">
                <span aria-hidden="true">✉️</span>
                <input
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  placeholder="Enter your email address"
                  aria-invalid={Boolean(fieldErrors.email)}
                />
              </span>
              {fieldErrors.email ? (
                <span className="lr-pro-field-error">{fieldErrors.email}</span>
              ) : null}
            </label>

            <label className="lr-pro-field">
              <span className="lr-pro-field-label">Password</span>
              <span className="lr-pro-input">
                <span aria-hidden="true">🔒</span>
                <input
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  required
                  minLength={8}
                  placeholder="Enter your password"
                  aria-invalid={Boolean(fieldErrors.password)}
                />
                <button
                  type="button"
                  className="lr-pro-eye"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </span>
              {fieldErrors.password ? (
                <span className="lr-pro-field-error">{fieldErrors.password}</span>
              ) : null}
            </label>

            <button type="submit" className="lr-pro-submit" disabled={loading}>
              {loading ? "Signing in…" : "→ Log In"}
            </button>

            <div className="lr-pro-card-links">
              <span>
                Need an account? <a href="/register">Register</a>
              </span>
              <a href="/forgot-password">Forgot Password?</a>
            </div>
          </form>
        </section>

        <aside className="lr-pro-why">
          <h2>⭐ Why Choose LEARN WISE?</h2>
          <ul>
            {FEATURES.map((f) => (
              <li key={f.title} className={`tone-${f.tone}`}>
                <span className="lr-pro-why-icon" aria-hidden="true">
                  {f.icon}
                </span>
                <span>
                  <strong>{f.title}</strong>
                  <small>{f.body}</small>
                </span>
              </li>
            ))}
          </ul>
        </aside>
      </main>

      <footer className="lr-pro-footer">
        <div className="lr-pro-footer-links">
          <a href="/about">📚 About LEARN WISE</a>
          <a href="/privacy">🛡️ Privacy Policy</a>
          <a href="/terms">📄 Terms and Conditions</a>
          <a href="/contact">✉️ Contact</a>
        </div>
        <p>© {new Date().getFullYear()} LEARN WISE. All rights reserved.</p>
      </footer>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="lr-pro">
          <p style={{ textAlign: "center", padding: 48 }}>Loading login…</p>
        </div>
      }
    >
      <LoginForm />
    </Suspense>
  );
}
