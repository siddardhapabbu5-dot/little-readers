import type { ConsentType, PolicyDocumentType } from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { documentDefaults } from "../privacy/policy-documents.service.js";

/** Mandatory before payment, in the order parents see them. */
const REQUIRED: Array<{ type: PolicyDocumentType; consentType: ConsentType; statement: string }> = [
  {
    type: "TERMS_OF_SERVICE",
    consentType: "TERMS",
    statement: "I have read and agree to the Terms & Conditions.",
  },
  {
    type: "PRIVACY_POLICY",
    consentType: "PRIVACY",
    statement: "I have read and agree to the Privacy Policy.",
  },
  {
    type: "PARENTAL_CONSENT",
    consentType: "PARENTAL",
    statement:
      "I am the parent or legal guardian and provide consent for my child's use of LEARN WISE.",
  },
  {
    type: "SUBSCRIPTION_REFUND",
    consentType: "SUBSCRIPTION_TERMS",
    statement:
      "I understand the subscription duration, price, renewal and cancellation conditions.",
  },
];

const SOURCE = "PARENT_AGREEMENTS";

type VersionRow = {
  id: string;
  type: PolicyDocumentType;
  version: string;
  title: string;
  effectiveDate: Date;
  requiresReacceptance: boolean;
  publishedAt: Date;
};

async function publishedVersionsByType() {
  const rows: VersionRow[] = await prisma.policyDocumentVersion.findMany({
    where: { type: { in: REQUIRED.map((r) => r.type) } },
    orderBy: { publishedAt: "desc" },
    select: {
      id: true,
      type: true,
      version: true,
      title: true,
      effectiveDate: true,
      requiresReacceptance: true,
      publishedAt: true,
    },
  });
  const map = new Map<PolicyDocumentType, VersionRow[]>();
  for (const r of rows) {
    const list = map.get(r.type) ?? [];
    list.push(r);
    map.set(r.type, list);
  }
  return map;
}

/** Oldest version a parent may have accepted and still be compliant (newest material change). */
function minimumVersion(versions: VersionRow[]) {
  return versions.find((v) => v.requiresReacceptance) ?? versions[versions.length - 1];
}

export async function getAgreementStatus(userId: string) {
  const byType = await publishedVersionsByType();
  const consents = await prisma.parentalConsent.findMany({
    where: { userId, policyVersionId: { not: null } },
    orderBy: { acceptedAt: "desc" },
    select: {
      acceptedAt: true,
      policyVersion: { select: { id: true, type: true, version: true, publishedAt: true } },
    },
  });
  const defaults = documentDefaults();

  const documents = REQUIRED.map((req) => {
    const versions = byType.get(req.type) ?? [];
    const current = versions[0] ?? null;
    const def = defaults.find((d) => d.type === req.type)!;
    if (!current) {
      return {
        type: req.type,
        slug: def.slug,
        title: def.title,
        statement: req.statement,
        available: false,
        current: null,
        accepted: false,
        acceptedVersion: null,
        acceptedAt: null,
      };
    }
    const minimum = minimumVersion(versions);
    const latest = consents.find((c) => c.policyVersion?.type === req.type);
    const accepted = Boolean(
      latest?.policyVersion && latest.policyVersion.publishedAt >= minimum.publishedAt
    );
    return {
      type: req.type,
      slug: def.slug,
      title: current.title,
      statement: req.statement,
      available: true,
      current: {
        id: current.id,
        version: current.version,
        effectiveDate: current.effectiveDate,
        publishedAt: current.publishedAt,
      },
      accepted,
      acceptedVersion: latest?.policyVersion?.version ?? null,
      acceptedAt: latest?.acceptedAt ?? null,
    };
  });

  const marketing = await prisma.parentalConsent.findFirst({
    where: { userId, consentType: "MARKETING" },
    orderBy: { acceptedAt: "desc" },
    select: { version: true, acceptedAt: true },
  });

  return {
    documents,
    allPublished: documents.every((d) => d.available),
    allAccepted: documents.every((d) => d.available && d.accepted),
    marketingOptIn: marketing?.version === "opt-in",
  };
}

export async function acceptAgreements(
  userId: string,
  input: { versionIds: string[]; marketingOptIn: boolean },
  meta: { ipAddress?: string; userAgent?: string }
) {
  const byType = await publishedVersionsByType();
  const given = new Set(input.versionIds);
  const rows = REQUIRED.map((req) => {
    const current = byType.get(req.type)?.[0];
    if (!current) {
      throw new AppError("Agreement documents are not published yet. Please try again later.", 409, {
        code: "AGREEMENTS_UNAVAILABLE",
      });
    }
    if (!given.has(current.id)) {
      throw new AppError(
        "Agreements were updated while you were reading. Please review the latest versions.",
        409,
        { code: "AGREEMENTS_OUTDATED" }
      );
    }
    return {
      userId,
      consentType: req.consentType,
      version: current.version,
      policyVersionId: current.id,
      source: SOURCE,
      ipAddress: meta.ipAddress,
      userAgent: meta.userAgent?.slice(0, 500),
    };
  });
  if (given.size !== rows.length) {
    throw new AppError("Unexpected agreement documents in request", 400);
  }

  const previousMarketing = await prisma.parentalConsent.findFirst({
    where: { userId, consentType: "MARKETING" },
    orderBy: { acceptedAt: "desc" },
    select: { version: true },
  });
  const marketingVersion = input.marketingOptIn ? "opt-in" : "opt-out";
  const recordMarketing =
    previousMarketing ? previousMarketing.version !== marketingVersion : input.marketingOptIn;

  await prisma.parentalConsent.createMany({
    data: [
      ...rows,
      ...(recordMarketing
        ? [
            {
              userId,
              consentType: "MARKETING" as ConsentType,
              version: marketingVersion,
              source: SOURCE,
              ipAddress: meta.ipAddress,
              userAgent: meta.userAgent?.slice(0, 500),
            },
          ]
        : []),
    ],
  });
  return getAgreementStatus(userId);
}

export async function assertAgreementsAccepted(userId: string) {
  const status = await getAgreementStatus(userId);
  if (!status.allAccepted) {
    throw new AppError(
      status.allPublished
        ? "Please accept the LEARN WISE agreements before payment."
        : "Agreement documents are not published yet. Payment is unavailable.",
      409,
      { code: status.allPublished ? "AGREEMENTS_REQUIRED" : "AGREEMENTS_UNAVAILABLE" }
    );
  }
}

export async function assertPublishedVersion(versionId: string) {
  const v = await prisma.policyDocumentVersion.findUnique({
    where: { id: versionId },
    select: { id: true },
  });
  if (!v) throw new AppError("Document version not found", 404);
}
