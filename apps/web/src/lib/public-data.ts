import { API_URL } from "./api";

export type PublicPolicy = {
  published: boolean;
  message: string | null;
  policy: {
    version: string;
    title: string;
    content: string;
    effectiveDate?: string | null;
    legalBusinessName?: string | null;
    businessAddress?: string | null;
    country?: string | null;
    supportEmail?: string | null;
    supportPhone?: string | null;
    dataRetentionInfo?: string | null;
    deletionRequestContact?: string | null;
    parentalConsentExplanation?: string | null;
    childDataDisclosure?: string | null;
    learningDataDisclosure?: string | null;
    deviceDataDisclosure?: string | null;
    thirdPartyDisclosure?: string | null;
  } | null;
};

export type PublicPlan = {
  code: string;
  label: string;
  durationMonths: number;
  amountPaise: number;
  taxPaise: number;
  totalPaise: number;
  currency: string;
};

export type BusinessDetails = {
  legalName: string;
  address: string | null;
  country: string | null;
  email: string;
  phone: string | null;
  website: string;
};

export const DEFAULT_SUPPORT_EMAIL = "littlereaders.otp@gmail.com";
export const WEBSITE_URL = "https://siwiapp.shop";

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { "X-Client-Platform": "web" },
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: T };
    return body.data ?? null;
  } catch {
    return null;
  }
}

export function getPublicPolicy() {
  return getJson<PublicPolicy>("/privacy/policy");
}

export async function getPublicPlans(): Promise<PublicPlan[]> {
  const data = await getJson<{ plans: PublicPlan[] }>("/payments/public-plans");
  return data?.plans ?? [];
}

export async function getBusinessDetails(): Promise<BusinessDetails> {
  const policy = (await getPublicPolicy())?.policy;
  return {
    legalName: policy?.legalBusinessName?.trim() || "SIWI",
    address: policy?.businessAddress?.trim() || null,
    country: policy?.country?.trim() || "India",
    email: policy?.supportEmail?.trim() || DEFAULT_SUPPORT_EMAIL,
    phone: policy?.supportPhone?.trim() || null,
    website: WEBSITE_URL,
  };
}

export function formatInr(paise: number) {
  const rupees = paise / 100;
  return `₹${rupees.toLocaleString("en-IN", {
    minimumFractionDigits: Number.isInteger(rupees) ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

export function durationText(months: number) {
  if (months === 1) return "1 month";
  if (months === 12) return "1 year (12 months)";
  return `${months} months`;
}
