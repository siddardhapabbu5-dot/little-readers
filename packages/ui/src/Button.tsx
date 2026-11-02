import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variant = "primary" | "secondary" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: Variant;
  loading?: boolean;
}

const styles: Record<Variant, React.CSSProperties> = {
  primary: {
    background: "linear-gradient(135deg, #ff7a59, #ffb347)",
    color: "#1a1a1a",
  },
  secondary: {
    background: "#e8f4ff",
    color: "#0b3d66",
  },
  danger: {
    background: "#ffe5e5",
    color: "#8b0000",
  },
};

export function Button({
  children,
  variant = "primary",
  loading = false,
  disabled,
  style,
  ...props
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      style={{
        border: "none",
        borderRadius: 14,
        padding: "12px 20px",
        fontSize: 16,
        fontWeight: 700,
        cursor: disabled || loading ? "not-allowed" : "pointer",
        opacity: disabled || loading ? 0.7 : 1,
        ...styles[variant],
        ...style,
      }}
      {...props}
    >
      {loading ? "Please wait…" : children}
    </button>
  );
}
