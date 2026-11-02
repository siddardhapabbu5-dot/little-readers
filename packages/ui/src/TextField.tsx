import type { InputHTMLAttributes } from "react";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
}

export function TextField({ label, error, id, style, ...props }: TextFieldProps) {
  const fieldId = id ?? props.name;
  return (
    <label
      htmlFor={fieldId}
      style={{ display: "grid", gap: 6, fontWeight: 600, color: "#1f2937" }}
    >
      {label}
      <input
        id={fieldId}
        style={{
          border: error ? "2px solid #dc2626" : "2px solid #d1d5db",
          borderRadius: 12,
          padding: "12px 14px",
          fontSize: 16,
          outline: "none",
          ...style,
        }}
        {...props}
      />
      {error ? (
        <span style={{ color: "#dc2626", fontSize: 13, fontWeight: 500 }}>
          {error}
        </span>
      ) : null}
    </label>
  );
}
