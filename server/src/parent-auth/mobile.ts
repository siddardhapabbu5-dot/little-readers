import {
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";

/** Map "+91" / "91" / "IN" style hints to an ISO country when possible. */
function countryFromCallingCodeHint(countryCode?: string): CountryCode | undefined {
  const raw = String(countryCode ?? "").trim();
  if (!raw) return undefined;
  if (/^[A-Za-z]{2}$/.test(raw)) {
    return raw.toUpperCase() as CountryCode;
  }
  const digits = raw.replace(/\D/g, "");
  // Common defaults used by this product — prefer IN for +91 to preserve
  // existing Indian accounts. Other shared codes (e.g. +1) need national
  // number parsing with an explicit ISO from the client when possible.
  if (digits === "91") return "IN";
  if (digits === "44") return "GB";
  if (digits === "971") return "AE";
  if (digits === "61") return "AU";
  if (digits === "65") return "SG";
  if (digits === "1") return "US";
  return undefined;
}

/**
 * Normalize to E.164 using libphonenumber-js.
 * Accepts national numbers with a country calling-code hint, or already-prefixed E.164.
 * Existing Indian +91 accounts keep the same E.164 when re-normalized.
 */
export function normalizeMobileE164(
  raw: string,
  countryCode = env.DEFAULT_COUNTRY_CODE
): string {
  const input = String(raw ?? "").trim();
  if (!input) {
    throw new AppError("Enter a valid mobile number", 400, {
      code: "INVALID_MOBILE",
    });
  }

  const hintIso = countryFromCallingCodeHint(countryCode);
  const defaultIso = countryFromCallingCodeHint(env.DEFAULT_COUNTRY_CODE) ?? "IN";

  let phone = input.startsWith("+")
    ? parsePhoneNumberFromString(input)
    : parsePhoneNumberFromString(input, hintIso ?? defaultIso);

  // Fallback: if national parse failed, try concatenating calling code digits.
  if (!phone || !phone.isValid()) {
    const ccDigits = String(countryCode ?? "").replace(/\D/g, "") || "91";
    const nationalDigits = input.replace(/\D/g, "");
    if (nationalDigits) {
      phone = parsePhoneNumberFromString(`+${ccDigits}${nationalDigits}`);
    }
  }

  if (!phone || !phone.isValid()) {
    throw new AppError("Enter a valid mobile number", 400, {
      code: "INVALID_MOBILE",
    });
  }

  const e164 = phone.number;
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
    throw new AppError("Enter a valid mobile number", 400, {
      code: "INVALID_MOBILE",
    });
  }
  return e164;
}
