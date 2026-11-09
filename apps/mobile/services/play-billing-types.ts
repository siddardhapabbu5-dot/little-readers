export type PlayOffer = {
  productId: string;
  offerToken: string;
  basePlanId: string | null;
  title: string;
  /** Google-formatted recurring price, e.g. "₹199.00". */
  displayPrice: string;
  /** ISO-8601 billing period of the recurring phase, e.g. "P1M". */
  billingPeriod: string | null;
  /** Introductory / trial phase text when Google offers one. */
  introText: string | null;
};

export type PlayPurchase = {
  productId: string;
  purchaseToken: string;
  state: "pending" | "purchased" | "unknown";
  acknowledged: boolean;
  /** Opaque store object; pass back to finishPlayPurchase. */
  raw: unknown;
};

export type PlayPurchaseError = { cancelled: boolean; message: string };

export function billingPeriodLabel(period: string | null) {
  switch (period) {
    case "P1W":
      return "per week";
    case "P1M":
      return "per month";
    case "P3M":
      return "every 3 months";
    case "P6M":
      return "every 6 months";
    case "P1Y":
      return "per year";
    default:
      return "";
  }
}
