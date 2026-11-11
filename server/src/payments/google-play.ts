import { createHash, createSign, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import type { PaymentPurpose, Prisma, SubscriptionStatus } from "@prisma/client";
import { getAgreementStatus } from "../agreements/agreements.service.js";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { auditEventExists, recordSubscriptionAudit } from "../subscriptions/audit.js";
import {
  entitlementSubscription,
  isSubscriptionRecordEligible,
} from "../subscriptions/subscription.service.js";
import { googlePlayBillingEnabled } from "./flags.js";
import { isGrandfatheredFamilyRow } from "../learning/grade-access.js";
import { resolvePurchaseTarget } from "./payment.service.js";

const ANDROID_PUBLISHER = "https://androidpublisher.googleapis.com/androidpublisher/v3/applications";
const PUBLISHER_SCOPE = "https://www.googleapis.com/auth/androidpublisher";
const DEFAULT_PACKAGE = "com.littlereaders.app";
const DEFAULT_PRODUCTS = "learnwise_monthly:1,learnwise_3month:3,learnwise_6month:6,learnwise_yearly:12";

/** Subset of the Play Developer API SubscriptionPurchaseV2 resource used here. */
export type PlaySubscriptionV2 = {
  subscriptionState?: string;
  regionCode?: string;
  latestOrderId?: string;
  linkedPurchaseToken?: string;
  acknowledgementState?: string;
  testPurchase?: Record<string, unknown>;
  externalAccountIdentifiers?: { obfuscatedExternalAccountId?: string };
  lineItems?: Array<{
    productId?: string;
    expiryTime?: string;
    latestSuccessfulOrderId?: string;
    autoRenewingPlan?: {
      autoRenewEnabled?: boolean;
      recurringPrice?: { currencyCode?: string; units?: string; nanos?: number };
    };
    offerDetails?: { basePlanId?: string; offerId?: string };
  }>;
};

export type GooglePlayApi = {
  getSubscriptionV2(packageName: string, purchaseToken: string): Promise<PlaySubscriptionV2>;
  acknowledge(packageName: string, productId: string, purchaseToken: string): Promise<void>;
};

class PlayApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export function googlePlayPackageName() {
  return process.env.GOOGLE_PLAY_PACKAGE_NAME?.trim() || DEFAULT_PACKAGE;
}

export function googlePlayProducts(): Array<{ productId: string; months: number }> {
  const raw = process.env.GOOGLE_PLAY_PRODUCT_IDS?.trim() || DEFAULT_PRODUCTS;
  return raw
    .split(",")
    .map((part) => {
      const [id, months] = part.split(":").map((s) => s.trim());
      return { productId: id, months: Number(months) };
    })
    .filter((p) => /^[a-z0-9._]+$/.test(p.productId) && [1, 3, 6, 12].includes(p.months));
}

export function purchaseTokenRef(purchaseToken: string) {
  return `gp_${createHash("sha256").update(purchaseToken).digest("hex")}`;
}

// --- Google API client (service account, no extra dependency) ---------------------------------

type ServiceAccount = { client_email: string; private_key: string; token_uri?: string };

function loadServiceAccount(): ServiceAccount {
  const file = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_FILE?.trim();
  const inline = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON?.trim();
  const raw = file ? readFileSync(file, "utf8") : inline;
  if (!raw) {
    throw new AppError("Google Play verification is not configured.", 503, {
      code: "GOOGLE_PLAY_NOT_CONFIGURED",
    });
  }
  const parsed = JSON.parse(raw) as ServiceAccount;
  if (!parsed.client_email || !parsed.private_key) {
    throw new AppError("Google Play verification is not configured.", 503, {
      code: "GOOGLE_PLAY_NOT_CONFIGURED",
    });
  }
  return parsed;
}

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString("base64url");
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken() {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const sa = loadServiceAccount();
  const tokenUri = sa.token_uri || "https://oauth2.googleapis.com/token";
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({ iss: sa.client_email, scope: PUBLISHER_SCOPE, aud: tokenUri, iat: now, exp: now + 3600 })
  );
  const signer = createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const assertion = `${header}.${claims}.${b64url(signer.sign(sa.private_key))}`;
  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new PlayApiError("Google auth failed", res.status >= 500 ? 502 : 503);
  const json = (await res.json()) as { access_token: string; expires_in?: number };
  cachedToken = { value: json.access_token, expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000 };
  return cachedToken.value;
}

const realApi: GooglePlayApi = {
  async getSubscriptionV2(packageName, purchaseToken) {
    const url = `${ANDROID_PUBLISHER}/${encodeURIComponent(packageName)}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${await accessToken()}` } });
    if (!res.ok) throw new PlayApiError("Google Play lookup failed", res.status);
    return (await res.json()) as PlaySubscriptionV2;
  },
  async acknowledge(packageName, productId, purchaseToken) {
    const url = `${ANDROID_PUBLISHER}/${encodeURIComponent(packageName)}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`;
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
      body: "{}",
    });
    if (!res.ok) throw new PlayApiError("Google Play acknowledge failed", res.status);
  },
};

let api: GooglePlayApi = realApi;

/** Tests only: replace the Google API with a mock (pass null to restore). */
export function setGooglePlayApiForTests(mock: GooglePlayApi | null) {
  api = mock ?? realApi;
  cachedToken = null;
}

// --- State mapping ------------------------------------------------------------------------------

function mapState(state: string | undefined): SubscriptionStatus {
  switch (state) {
    case "SUBSCRIPTION_STATE_ACTIVE":
      return "ACTIVE";
    case "SUBSCRIPTION_STATE_IN_GRACE_PERIOD":
      return "GRACE";
    case "SUBSCRIPTION_STATE_ON_HOLD":
    case "SUBSCRIPTION_STATE_PAUSED":
      return "SUSPENDED";
    case "SUBSCRIPTION_STATE_CANCELED":
      return "CANCELLED";
    case "SUBSCRIPTION_STATE_PENDING":
      return "PENDING";
    default:
      return "EXPIRED";
  }
}

const PURPOSE_BY_MONTHS: Record<number, PaymentPurpose> = {
  1: "FAMILY_MONTHLY",
  3: "FAMILY_3_MONTH",
  6: "FAMILY_6_MONTH",
  12: "FAMILY_YEARLY",
};

function priceMinorUnits(price?: { units?: string; nanos?: number }) {
  if (!price) return 0;
  return Number(price.units ?? 0) * 100 + Math.round((price.nanos ?? 0) / 10_000_000);
}

async function fetchPurchase(purchaseToken: string) {
  try {
    return await api.getSubscriptionV2(googlePlayPackageName(), purchaseToken);
  } catch (e) {
    if (e instanceof AppError) throw e;
    const status = (e as { status?: number }).status;
    if (status === 400 || status === 404 || status === 410) {
      throw new AppError("This Google Play purchase could not be verified.", 400, {
        code: "INVALID_PURCHASE_TOKEN",
      });
    }
    throw new AppError("Google Play is not reachable right now. Please try again.", 502, {
      code: "GOOGLE_PLAY_UNAVAILABLE",
    });
  }
}

// --- Core: apply Google's verified state to our entitlement -------------------------------------

type ProcessInput = {
  purchaseToken: string;
  /** Parent making the request (verify endpoint). Absent for RTDN. */
  expectedUserId?: string;
  source: "google_play_verify" | "google_play_rtdn" | "google_play_restore";
  providerEventId?: string;
  /** RTDN SUBSCRIPTION_REVOKED: access ends now regardless of expiryTime. */
  revoked?: boolean;
  notificationType?: number;
  /** Child + grade this purchase unlocks (verify / restore from the app). */
  target?: { childId: string; levelId: string };
};

export async function processGooglePlaySubscription(input: ProcessInput) {
  const purchase = await fetchPurchase(input.purchaseToken);
  const line = purchase.lineItems?.[0];
  const productId = line?.productId ?? "";
  const product = googlePlayProducts().find((p) => p.productId === productId);
  if (!product) {
    throw new AppError("Unknown subscription product.", 400, { code: "UNKNOWN_PRODUCT" });
  }
  const providerRef = purchaseTokenRef(input.purchaseToken);
  const obfuscated = purchase.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null;
  const now = new Date();

  let status = mapState(purchase.subscriptionState);
  let expiresAt = line?.expiryTime ? new Date(line.expiryTime) : now;
  if (input.revoked) {
    status = "EXPIRED";
    expiresAt = now;
  }
  const verificationStatus = purchase.testPurchase ? "VERIFIED_TEST" : "VERIFIED";
  const autoRenewing = line?.autoRenewingPlan?.autoRenewEnabled ?? false;
  const orderId = line?.latestSuccessfulOrderId ?? purchase.latestOrderId ?? null;

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.subscription.findUnique({ where: { providerRef } });
    if (existing) {
      await tx.$executeRaw`SELECT id FROM "Subscription" WHERE id = ${existing.id} FOR UPDATE`;
    }

    const ownerId = existing?.userId ?? obfuscated ?? input.expectedUserId ?? null;
    if (!ownerId) return { ignored: true as const, reason: "no account linked to purchase" };
    if (input.expectedUserId && ownerId !== input.expectedUserId) {
      throw new AppError("This Google Play purchase belongs to a different account.", 403, {
        code: "PURCHASE_ACCOUNT_MISMATCH",
      });
    }
    if (obfuscated && existing && obfuscated !== existing.userId) {
      throw new AppError("This Google Play purchase belongs to a different account.", 403, {
        code: "PURCHASE_ACCOUNT_MISMATCH",
      });
    }
    const owner = await tx.user.findUnique({ where: { id: ownerId }, select: { id: true } });
    if (!owner) return { ignored: true as const, reason: "account not found" };

    const fromStatus = existing?.status ?? null;
    // A row created by an RTDN before the app verified has no child yet; grandfathered family rows stay family.
    const attachTarget =
      existing && input.target && existing.childId === null && !isGrandfatheredFamilyRow(existing)
        ? input.target
        : null;
    let subscriptionId: string;
    if (existing) {
      const updated = await tx.subscription.update({
        where: { id: existing.id },
        data: {
          ...(attachTarget
            ? { childId: attachTarget.childId, levelId: attachTarget.levelId, includedSeats: 1, extraSeats: 0 }
            : {}),
          status,
          expiresAt,
          productId,
          autoRenewing,
          countryCode: purchase.regionCode ?? existing.countryCode,
          verificationStatus,
          verifiedAt: now,
          graceEndsAt: status === "GRACE" ? expiresAt : null,
          cancelledAt: status === "CANCELLED" ? existing.cancelledAt ?? now : null,
        },
      });
      subscriptionId = updated.id;
    } else {
      const current = await entitlementSubscription(ownerId, tx);
      const plan = await tx.subscriptionPlan.findFirst({
        where: { durationMonths: product.months, isActive: true, isPublished: true },
        orderBy: { sortOrder: "asc" },
        select: { code: true, includedSeats: true },
      });
      const target = input.target && ownerId === input.expectedUserId ? input.target : null;
      const created = await tx.subscription.create({
        data: {
          userId: ownerId,
          ...(target ? { childId: target.childId, levelId: target.levelId } : {}),
          plan: plan?.code ?? productId,
          status,
          startedAt: now,
          expiresAt,
          provider: "google_play",
          providerRef,
          providerToken: input.purchaseToken,
          productId,
          autoRenewing,
          countryCode: purchase.regionCode ?? null,
          verificationStatus,
          verifiedAt: now,
          graceEndsAt: status === "GRACE" ? expiresAt : null,
          cancelledAt: status === "CANCELLED" ? now : null,
          includedSeats: target ? 1 : plan?.includedSeats ?? 2,
          extraSeats: !target && current && isSubscriptionRecordEligible(current, now) ? current.extraSeats : 0,
        },
      });
      subscriptionId = created.id;
    }

    if (purchase.linkedPurchaseToken) {
      const oldRef = purchaseTokenRef(purchase.linkedPurchaseToken);
      await tx.subscription.updateMany({
        where: { providerRef: oldRef, userId: ownerId, status: { not: "EXPIRED" } },
        data: { status: "EXPIRED", expiresAt: now, graceEndsAt: null },
      });
    }

    const paidState = status === "ACTIVE" || status === "GRACE" || status === "CANCELLED";
    let paymentId: string | null = null;
    if (orderId && paidState && !input.revoked) {
      const paymentRef = `gp_order:${orderId}`;
      const seen = await tx.payment.findUnique({ where: { providerRef: paymentRef } });
      if (seen) {
        paymentId = seen.id;
      } else {
        const price = line?.autoRenewingPlan?.recurringPrice;
        const payment = await tx.payment.create({
          data: {
            userId: ownerId,
            subscriptionId,
            amountCents: priceMinorUnits(price),
            currency: price?.currencyCode ?? "INR",
            status: "SUCCEEDED",
            provider: "google_play",
            providerRef: paymentRef,
            paidAt: now,
            purpose: PURPOSE_BY_MONTHS[product.months] ?? "FAMILY_MONTHLY",
            planCode: productId,
            metadataJson: JSON.stringify({
              basePlanId: line?.offerDetails?.basePlanId ?? null,
              test: Boolean(purchase.testPurchase),
            }),
          },
        });
        paymentId = payment.id;
      }
    }
    if (input.revoked && orderId) {
      await tx.payment.updateMany({
        where: { providerRef: `gp_order:${orderId}`, status: "SUCCEEDED" },
        data: { status: "REFUNDED" },
      });
    }

    const changed = !existing || fromStatus !== status || existing.expiresAt.getTime() !== expiresAt.getTime();
    if (changed || input.providerEventId) {
      await recordSubscriptionAudit(
        {
          userId: ownerId,
          subscriptionId,
          paymentId,
          provider: "google_play",
          source: input.source,
          eventType: input.revoked
            ? "REVOKED"
            : existing
              ? input.notificationType
                ? `RTDN_${input.notificationType}`
                : "STATE_REFRESH"
              : "PURCHASE_VERIFIED",
          providerEventId: input.providerEventId ?? null,
          fromStatus,
          toStatus: status,
          details: {
            productId,
            expiresAt: expiresAt.toISOString(),
            autoRenewing,
            orderId,
            test: Boolean(purchase.testPurchase),
            googleState: purchase.subscriptionState ?? null,
          },
        },
        tx
      );
    }
    return { ignored: false as const, userId: ownerId, subscriptionId };
  });

  if (result.ignored) return result;

  let acknowledged = purchase.acknowledgementState === "ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED";
  if (!acknowledged && (status === "ACTIVE" || status === "GRACE")) {
    try {
      await api.acknowledge(googlePlayPackageName(), productId, input.purchaseToken);
      acknowledged = true;
    } catch (e) {
      // Google allows 3 days; the next verify / RTDN retries. Never log the token.
      console.warn("[google-play] acknowledge failed", { subscriptionId: result.subscriptionId, error: (e as Error).message });
    }
  }
  if (acknowledged) {
    await prisma.subscription.updateMany({
      where: { id: result.subscriptionId, acknowledgedAt: null },
      data: { acknowledgedAt: new Date() },
    });
  }

  const eligible = isSubscriptionRecordEligible(
    { status, expiresAt, graceEndsAt: status === "GRACE" ? expiresAt : null, cancelledAt: null },
    new Date()
  );
  return {
    ignored: false as const,
    subscriptionId: result.subscriptionId,
    status,
    productId,
    expiresAt,
    autoRenewing,
    eligible,
    acknowledged,
    testPurchase: Boolean(purchase.testPurchase),
  };
}

// --- Endpoints ---------------------------------------------------------------------------------

function assertEnabled() {
  if (!googlePlayBillingEnabled()) {
    throw new AppError("Google Play subscriptions are not open yet.", 503, {
      code: "GOOGLE_PLAY_DISABLED",
    });
  }
}

export async function getGooglePlayConfig(userId: string) {
  const enabled = googlePlayBillingEnabled();
  const products = googlePlayProducts();
  const plans = await prisma.subscriptionPlan.findMany({
    where: { isActive: true, isPublished: true, durationMonths: { in: products.map((p) => p.months) } },
    orderBy: { sortOrder: "asc" },
    select: { durationMonths: true, includedSeats: true },
  });
  const current = await entitlementSubscription(userId);
  const active = current && isSubscriptionRecordEligible(current) ? current : null;
  const agreements = await getAgreementStatus(userId);

  let blockedReason: string | null = null;
  if (!enabled) blockedReason = "GOOGLE_PLAY_DISABLED";
  else if (active?.provider === "google_play") blockedReason = "ALREADY_SUBSCRIBED_GOOGLE_PLAY";
  else if (active) blockedReason = "ACTIVE_SUBSCRIPTION_OTHER_PROVIDER";

  return {
    enabled,
    packageName: googlePlayPackageName(),
    products: products.map((p) => ({
      productId: p.productId,
      months: p.months,
      includedSeats: plans.find((pl) => pl.durationMonths === p.months)?.includedSeats ?? 2,
    })),
    obfuscatedAccountId: userId,
    canPurchase: blockedReason === null,
    blockedReason,
    requiresAgreements: !agreements.allAccepted,
    currentProvider: active?.provider ?? null,
    currentExpiresAt: active?.expiresAt ?? null,
  };
}

export async function verifyGooglePlayPurchase(
  userId: string,
  input: { productId: string; purchaseToken: string; childId?: string },
  source: "google_play_verify" | "google_play_restore" = "google_play_verify"
) {
  assertEnabled();
  if (!googlePlayProducts().some((p) => p.productId === input.productId)) {
    throw new AppError("Unknown subscription product.", 400, { code: "UNKNOWN_PRODUCT" });
  }
  const purchaseTarget = input.childId ? await resolvePurchaseTarget(userId, input.childId) : null;
  const out = await processGooglePlaySubscription({
    purchaseToken: input.purchaseToken,
    expectedUserId: userId,
    source,
    target: purchaseTarget
      ? { childId: purchaseTarget.child.id, levelId: purchaseTarget.level.id }
      : undefined,
  });
  if (out.ignored) {
    throw new AppError("This Google Play purchase could not be linked to your account.", 400, {
      code: "PURCHASE_NOT_LINKED",
    });
  }
  if (out.productId !== input.productId) {
    throw new AppError("Purchase does not match the selected plan.", 400, { code: "PRODUCT_MISMATCH" });
  }
  return {
    status: out.status,
    eligible: out.eligible,
    productId: out.productId,
    expiresAt: out.expiresAt,
    autoRenewing: out.autoRenewing,
    acknowledged: out.acknowledged,
    pending: out.status === "PENDING",
  };
}

export function rtdnTokenValid(given: unknown) {
  const expected = process.env.GOOGLE_PLAY_RTDN_TOKEN?.trim();
  if (!expected || typeof given !== "string" || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

type RtdnBody = { message?: { data?: string; messageId?: string; message_id?: string } };
type DeveloperNotification = {
  packageName?: string;
  subscriptionNotification?: { notificationType?: number; purchaseToken?: string; subscriptionId?: string };
  voidedPurchaseNotification?: { purchaseToken?: string; orderId?: string; productType?: number };
  testNotification?: unknown;
};

const SUBSCRIPTION_REVOKED = 12;

/**
 * Pub/Sub push handler. Returns normally (HTTP 200) for anything that should not be retried;
 * throws a 5xx AppError only for transient failures so Pub/Sub redelivers.
 */
export async function handleGooglePlayRtdn(body: RtdnBody) {
  const messageId = body.message?.messageId ?? body.message?.message_id;
  const data = body.message?.data;
  if (!messageId || !data) return { ignored: true, reason: "malformed message" };

  let note: DeveloperNotification;
  try {
    note = JSON.parse(Buffer.from(data, "base64").toString("utf8")) as DeveloperNotification;
  } catch {
    return { ignored: true, reason: "malformed payload" };
  }
  if (note.packageName && note.packageName !== googlePlayPackageName()) {
    return { ignored: true, reason: "other package" };
  }
  if (note.testNotification) return { ok: true, test: true };
  if (!googlePlayBillingEnabled()) return { ignored: true, reason: "google play billing disabled" };

  const providerEventId = `rtdn:${messageId}`;
  if (await auditEventExists(providerEventId)) return { duplicate: true };

  if (note.voidedPurchaseNotification?.purchaseToken) {
    return applyVoidedPurchase(note.voidedPurchaseNotification, providerEventId);
  }

  const sub = note.subscriptionNotification;
  if (!sub?.purchaseToken) return { ignored: true, reason: "not a subscription notification" };
  try {
    const out = await processGooglePlaySubscription({
      purchaseToken: sub.purchaseToken,
      source: "google_play_rtdn",
      providerEventId,
      revoked: sub.notificationType === SUBSCRIPTION_REVOKED,
      notificationType: sub.notificationType,
    });
    return out.ignored ? out : { ok: true, status: out.status };
  } catch (e) {
    if (e instanceof AppError && e.statusCode < 500) {
      return { ignored: true, reason: (e.details as { code?: string } | undefined)?.code ?? e.message };
    }
    throw e;
  }
}

async function applyVoidedPurchase(
  voided: NonNullable<DeveloperNotification["voidedPurchaseNotification"]>,
  providerEventId: string
) {
  const providerRef = purchaseTokenRef(voided.purchaseToken!);
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const sub = await tx.subscription.findUnique({ where: { providerRef } });
    if (!sub) return { ignored: true, reason: "unknown purchase" };
    await tx.$executeRaw`SELECT id FROM "Subscription" WHERE id = ${sub.id} FOR UPDATE`;
    const now = new Date();
    await tx.subscription.update({
      where: { id: sub.id },
      data: {
        status: "EXPIRED",
        expiresAt: sub.expiresAt < now ? sub.expiresAt : now,
        graceEndsAt: null,
        autoRenewing: false,
      },
    });
    if (voided.orderId) {
      await tx.payment.updateMany({
        where: { providerRef: `gp_order:${voided.orderId}`, status: "SUCCEEDED" },
        data: { status: "REFUNDED" },
      });
    }
    await recordSubscriptionAudit(
      {
        userId: sub.userId,
        subscriptionId: sub.id,
        provider: "google_play",
        source: "google_play_rtdn",
        eventType: "VOIDED_PURCHASE",
        providerEventId,
        fromStatus: sub.status,
        toStatus: "EXPIRED",
        details: { orderId: voided.orderId ?? null },
      },
      tx
    );
    return { ok: true, voided: true };
  });
}
