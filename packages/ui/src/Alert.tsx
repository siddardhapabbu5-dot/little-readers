import type { ReactNode } from "react";

type Tone = "info" | "success" | "error";

export interface AlertProps {
  children: ReactNode;
  tone?: Tone;
}

const tones: Record<Tone, React.CSSProperties> = {
  info: { background: "#e0f2fe", color: "#075985", borderColor: "#7dd3fc" },
  success: { background: "#dcfce7", color: "#166534", borderColor: "#86efac" },
  error: { background: "#fee2e2", color: "#991b1b", borderColor: "#fca5a5" },
};

export function Alert({ children, tone = "info" }: AlertProps) {
  return (
    <div
      role="alert"
      style={{
        border: "1px solid",
        borderRadius: 12,
        padding: "12px 14px",
        fontWeight: 600,
        ...tones[tone],
      }}
    >
      {children}
    </div>
  );
}
