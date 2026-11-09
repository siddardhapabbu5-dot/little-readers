import type { Metadata } from "next";
import type { ReactNode } from "react";
import { APP_NAME, APP_TAGLINE } from "@little-readers/shared";
import "./globals.css";

export const metadata: Metadata = {
  title: `${APP_NAME} – ${APP_TAGLINE}`,
  description:
    "LEARN WISE by SIWI – a parent-guided Grade 1 reading and spelling learning app for children.",
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
              <a href="/pricing">Pricing</a>
              <a href="/about">About</a>
              <a href="/contact">Contact</a>
              <a href="/login">Login</a>
            </nav>
          </header>
          <main>{children}</main>
          <footer className="footer">
            <nav
              aria-label="Policies"
              style={{
                display: "flex",
                gap: 14,
                flexWrap: "wrap",
                justifyContent: "center",
                marginBottom: 8,
              }}
            >
              <a href="/about">About Us</a>
              <a href="/pricing">Pricing</a>
              <a href="/contact">Contact Us</a>
              <a href="/privacy">Privacy Policy</a>
              <a href="/terms">Terms &amp; Conditions</a>
              <a href="/refund-policy">Refund &amp; Cancellation</a>
              <a href="/shipping-policy">Shipping &amp; Delivery</a>
            </nav>
            © {new Date().getFullYear()} SIWI · {APP_NAME}. All rights reserved.
          </footer>
        </div>
      </body>
    </html>
  );
}
