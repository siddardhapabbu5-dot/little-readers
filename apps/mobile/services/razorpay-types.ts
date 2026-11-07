export type CheckoutOptions = {
  keyId: string;
  orderId: string;
  amountPaise: number;
  currency: string;
  description: string;
  email?: string;
  name?: string;
  themeColor: string;
};

export type CheckoutResult = { orderId: string; paymentId: string; signature: string };

/** Parent closed Razorpay or the payment failed before a signature was issued. */
export class CheckoutCancelled extends Error {}
