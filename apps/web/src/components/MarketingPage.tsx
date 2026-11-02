import type { ReactNode } from "react";

export function MarketingPage({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div style={{ maxWidth: 760, margin: "40px auto", padding: "0 20px 48px" }}>
      <p style={{ marginBottom: 8 }}>
        <a href="/login" style={{ fontWeight: 700, color: "#1677E8" }}>
          ← Back to login
        </a>
      </p>
      <h1 style={{ color: "#17345E", marginTop: 0 }}>{title}</h1>
      <div style={{ color: "#17345E", lineHeight: 1.6, fontSize: "1.05rem" }}>
        {children}
      </div>
    </div>
  );
}
