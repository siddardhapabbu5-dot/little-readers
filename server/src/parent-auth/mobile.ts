import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

/** Normalize to E.164. Accepts 10-digit IN numbers or already-prefixed +91… */
export function normalizeMobileE164(
  raw: string,
  countryCode = env.DEFAULT_COUNTRY_CODE
): string {
  const digits = String(raw ?? "").replace(/\D/g, "");
  const cc = countryCode.replace(/\D/g, "") || "91";

  if (!digits) {
    throw new AppError("Enter a valid mobile number", 400, {
      code: "INVALID_MOBILE",
    });
  }

  let e164: string;
  if (String(raw).trim().startsWith("+") && digits.length >= 10) {
    e164 = `+${digits}`;
  } else if (digits.length === 10) {
    e164 = `+${cc}${digits}`;
  } else if (digits.length === 12 && digits.startsWith(cc)) {
    e164 = `+${digits}`;
  } else if (digits.length >= 10 && digits.length <= 15) {
    e164 = `+${digits}`;
  } else {
    throw new AppError("Enter a valid mobile number", 400, {
      code: "INVALID_MOBILE",
    });
  }

  if (!/^\+[1-9]\d{9,14}$/.test(e164)) {
    throw new AppError("Enter a valid mobile number", 400, {
      code: "INVALID_MOBILE",
    });
  }
  return e164;
}
