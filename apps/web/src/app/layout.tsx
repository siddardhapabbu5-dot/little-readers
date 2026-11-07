import type { Metadata } from "next";
import type { ReactNode } from "react";
import { APP_NAME, APP_TAGLINE } from "@little-readers/shared";
import "./globals.css";

export const metadata: Metadata = {
  title: `${APP_NAME} – ${APP_TAGLINE}`,
  description:
    "Premium educational SaaS for children aged 3–12: reading, spelling, phonics and speech practice.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="shell">
          <header className="nav">
            <a className="brand" href="/">
              {APP_NAME}
            </a>
            <nav style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <a href="/login">Login</a>
              <a href="/parent">Parent</a>
              <a href="/kids">Kids</a>
              <a href="/student">Student</a>
              <a href="/teacher">Teacher</a>
              <a href="/school">School</a>
              <a href="/super-admin">Super Admin</a>
            </nav>
          </header>
          <main>{children}</main>
          <footer className="footer">
            {APP_NAME} · Multi-school SaaS · Phase 1 architecture foundation
          </footer>
        </div>
      </body>
    </html>
  );
}
