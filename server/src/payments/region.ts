/** Where the parent pays from. IN = INR plan price; PH = the plan's Philippines price in PHP. */
export type PriceRegion = "IN" | "PH";

export const PRICE_REGIONS = ["IN", "PH"] as const;

/** Default region suggested from the parent's mobile; the app may override it. */
export function regionFromMobile(mobileE164: string | null | undefined): PriceRegion {
  return mobileE164?.replace(/\s/g, "").startsWith("+63") ? "PH" : "IN";
}
