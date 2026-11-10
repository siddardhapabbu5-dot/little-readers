import type { ReactNode } from "react";

interface PortalShellProps {
  title: string;
  portalLabel: string;
  phaseReady: string;
  children?: ReactNode;
  tone?: "light" | "dark" | "student";
}

export function PortalShell({
  title,
  portalLabel,
  phaseReady,
  children,
  tone = "light",
}: PortalShellProps) {
  const background =
    tone === "dark"
      ? "linear-gradient(160deg,#0f172a,#1e293b)"
      : tone === "student"
        ? "radial-gradient(circle at top left,#ffe8a3,#ffd6e7 40%,#cdefff 100%)"
        : "linear-gradient(160deg,#f8fafc,#eef6ff)";

  const color = tone === "dark" ? "#e2e8f0" : "#1f2937";

  return (
    <div style={{ minHeight: "100vh", background, color, padding: "clamp(12px, 4vw, 24px)" }}>
      <div
        style={{
          maxWidth: 920,
          margin: "clamp(8px, 4vw, 32px) auto",
          background: tone === "dark" ? "#111827" : "rgba(255,255,255,0.95)",
          borderRadius: 18,
          padding: "clamp(16px, 5vw, 28px)",
          boxShadow: "0 12px 40px rgba(15,23,42,0.12)",
        }}
      >
        <p style={{ margin: 0, fontWeight: 700, opacity: 0.7 }}>{portalLabel}</p>
        <h1 style={{ margin: "8px 0 12px" }}>{title}</h1>
        <p style={{ marginTop: 0, opacity: 0.85 }}>
          Phase 1 foundation shell only. {phaseReady}
        </p>
        <p style={{ fontSize: 14, opacity: 0.75 }}>
          No fake dashboard statistics are shown. Live school data arrives in later
          phases with real API connections and tenant isolation.
        </p>
        {children}
      </div>
    </div>
  );
}
