import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from "libphonenumber-js";

export type CountryOption = {
  iso: CountryCode;
  name: string;
  callingCode: string;
  flag: string;
  label: string;
};

const displayNames =
  typeof Intl !== "undefined" && "DisplayNames" in Intl
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;

export function countryFlag(iso: string): string {
  const code = iso.toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) return "🏳️";
  return String.fromCodePoint(
    ...[...code].map((c) => 127397 + c.charCodeAt(0))
  );
}

export function countryName(iso: CountryCode): string {
  try {
    return displayNames?.of(iso) ?? iso;
  } catch {
    return iso;
  }
}

let cachedCountries: CountryOption[] | null = null;

export function listCountries(): CountryOption[] {
  if (cachedCountries) return cachedCountries;
  cachedCountries = getCountries()
    .map((iso) => {
      const callingCode = `+${getCountryCallingCode(iso)}`;
      const name = countryName(iso);
      const flag = countryFlag(iso);
      return {
        iso,
        name,
        callingCode,
        flag,
        label: `${flag} ${name} (${callingCode})`,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
  return cachedCountries;
}

export const DEFAULT_COUNTRY_ISO: CountryCode = "IN";

export function findCountry(iso: CountryCode): CountryOption {
  return (
    listCountries().find((c) => c.iso === iso) ?? {
      iso: DEFAULT_COUNTRY_ISO,
      name: "India",
      callingCode: "+91",
      flag: countryFlag("IN"),
      label: `${countryFlag("IN")} India (+91)`,
    }
  );
}

export function validateNationalPhone(
  national: string,
  country: CountryCode
): { ok: true; e164: string; callingCode: string } | { ok: false; error: string } {
  const trimmed = String(national ?? "").trim();
  if (!trimmed) {
    return { ok: false, error: "Enter a valid mobile number." };
  }

  const phone = parsePhoneNumberFromString(trimmed, country);
  if (!phone || !phone.isValid()) {
    const cc = findCountry(country).callingCode;
    return {
      ok: false,
      error: `Enter a valid mobile number for ${countryName(country)} (${cc}).`,
    };
  }

  return {
    ok: true,
    e164: phone.number,
    callingCode: `+${phone.countryCallingCode}`,
  };
}

/** National digits only for the text field (no country calling code). */
export function sanitizeNationalInput(value: string, maxLen = 15): string {
  return value.replace(/\D/g, "").slice(0, maxLen);
}
