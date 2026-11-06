import { env } from "../config/env.js";

export type PlanPurpose =
  | "FAMILY_MONTHLY"
  | "FAMILY_3_MONTH"
  | "FAMILY_6_MONTH"
  | "FAMILY_YEARLY"
  | "EXTRA_SEATS";

export type CatalogPlan = {
  purpose: PlanPurpose;
  code: string;
  label: string;
  description: string;
  billingPeriod: "month" | "year" | "one_time";
  includedSeats: number;
  seatsPurchased: number;
  amountPaise: number;
  taxPaise: number;
  totalPaise: number;
  currency: string;
};

function numEnv(name: string, fallback?: number) {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function taxOn(amountPaise: number) {
  const bps = numEnv("TAX_RATE_BPS", env.TAX_RATE_BPS ?? 0) ?? 0;
  return Math.round((amountPaise * bps) / 10000);
}

function offer(
  purpose: PlanPurpose,
  amount: number | undefined,
  meta: Omit<
    CatalogPlan,
    "purpose" | "amountPaise" | "taxPaise" | "totalPaise" | "currency"
  >
): CatalogPlan | null {
  if (!amount || amount <= 0) return null;
  const taxPaise = taxOn(amount);
  return {
    purpose,
    ...meta,
    amountPaise: amount,
    taxPaise,
    totalPaise: amount + taxPaise,
    currency: env.PAYMENT_CURRENCY ?? "INR",
  };
}

export function listConfiguredPlans(): CatalogPlan[] {
  const plans: CatalogPlan[] = [];
  const monthlyAmt =
    numEnv("PLAN_FAMILY_MONTHLY_AMOUNT_PAISE", env.PLAN_FAMILY_MONTHLY_AMOUNT_PAISE) ?? 0;
  const yearlyAmt =
    numEnv("PLAN_FAMILY_YEARLY_AMOUNT_PAISE", env.PLAN_FAMILY_YEARLY_AMOUNT_PAISE) ?? 0;
  const extraAmt =
    numEnv("PLAN_EXTRA_SEAT_AMOUNT_PAISE", env.PLAN_EXTRA_SEAT_AMOUNT_PAISE) ?? 0;
  const monthly = offer("FAMILY_MONTHLY", monthlyAmt, {
    code: "FAMILY_MONTHLY",
    label: "Family Monthly",
    description: "Parent subscription with 2 included child seats (30 days).",
    billingPeriod: "month",
    includedSeats: 2,
    seatsPurchased: 0,
  });
  const yearly = offer("FAMILY_YEARLY", yearlyAmt, {
    code: "FAMILY_YEARLY",
    label: "Family Yearly",
    description: "Parent subscription with 2 included child seats (365 days).",
    billingPeriod: "year",
    includedSeats: 2,
    seatsPurchased: 0,
  });
  const extra = offer("EXTRA_SEATS", extraAmt, {
    code: "EXTRA_SEAT",
    label: "Additional child seat",
    description: "One add-on learning seat for an extra child (one-time).",
    billingPeriod: "one_time",
    includedSeats: 0,
    seatsPurchased: 1,
  });
  if (monthly) plans.push(monthly);
  if (yearly) plans.push(yearly);
  if (extra) plans.push(extra);
  return plans;
}

export function getPlan(purpose: PlanPurpose, seats = 1): CatalogPlan | null {
  const base = listConfiguredPlans().find((p) => p.purpose === purpose);
  if (!base) return null;
  if (purpose !== "EXTRA_SEATS") return base;
  const n = Math.max(1, Math.min(20, Math.floor(seats)));
  const amountPaise = base.amountPaise * n;
  const taxPaise = taxOn(amountPaise);
  return {
    ...base,
    seatsPurchased: n,
    amountPaise,
    taxPaise,
    totalPaise: amountPaise + taxPaise,
    label: n === 1 ? base.label : `${n} additional child seats`,
  };
}

export function paymentsEnabled() {
  const flag =
    process.env.PAYMENT_ENABLED === "true" ||
    process.env.PAYMENT_ENABLED === "1" ||
    env.PAYMENT_ENABLED;
  const keyId = process.env.RAZORPAY_KEY_ID || env.RAZORPAY_KEY_ID;
  const secret = process.env.RAZORPAY_KEY_SECRET || env.RAZORPAY_KEY_SECRET;
  // Env plan amounts OR published DB catalog (checked at order time) — keys + flag required.
  // Live stays off until PAYMENT_ENABLED=true is set explicitly.
  return Boolean(flag && keyId && secret);
}

export function publicKeyId() {
  return process.env.RAZORPAY_KEY_ID || env.RAZORPAY_KEY_ID || null;
}
