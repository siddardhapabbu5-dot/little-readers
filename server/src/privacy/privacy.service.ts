import { randomBytes } from "node:crypto";
import type {
  PrivacyPolicy,
  PrivacyPolicyStatus,
  PrivacyRequestStatus,
  PrivacyRequestType,
} from "@prisma/client";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

function newId(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

function trimOrNull(value: string | null | undefined) {
  if (value == null) return null;
  const t = String(value).trim();
  return t.length ? t : null;
}

function publicPolicyShape(p: PrivacyPolicy) {
  return {
    id: p.id,
    version: p.version,
    title: p.title,
    content: p.content,
    effectiveDate: p.effectiveDate,
    publicUrl: p.publicUrl,
    legalBusinessName: p.legalBusinessName,
    businessAddress: p.businessAddress,
    country: p.country,
    supportEmail: p.supportEmail,
    supportPhone: p.supportPhone,
    dataRetentionInfo: p.dataRetentionInfo,
    deletionRequestContact: p.deletionRequestContact,
    parentalConsentExplanation: p.parentalConsentExplanation,
    childDataDisclosure: p.childDataDisclosure,
    learningDataDisclosure: p.learningDataDisclosure,
    deviceDataDisclosure: p.deviceDataDisclosure,
    thirdPartyDisclosure: p.thirdPartyDisclosure,
    publishedAt: p.publishedAt,
  };
}

export async function getPublishedPrivacyPolicy() {
  return prisma.privacyPolicy.findFirst({
    where: { status: "PUBLISHED" },
    orderBy: { publishedAt: "desc" },
  });
}

/** Public payload — never returns draft content. */
export async function getPublicPrivacyPolicy() {
  const published = await getPublishedPrivacyPolicy();
  if (!published) {
    return {
      published: false as const,
      message:
        "A privacy policy has not been published yet. Registration and parental consent require an approved published policy.",
      policy: null,
    };
  }
  return {
    published: true as const,
    message: null,
    policy: publicPolicyShape(published),
  };
}

export async function ensureDraftPolicy(actorUserId: string) {
  const existing = await prisma.privacyPolicy.findFirst({
    where: { status: "DRAFT" },
    orderBy: { updatedAt: "desc" },
  });
  if (existing) return existing;
  return prisma.privacyPolicy.create({
    data: {
      id: newId("priv"),
      status: "DRAFT",
      version: "0.0.0-draft",
      title: "",
      content: "",
      createdByUserId: actorUserId,
      updatedByUserId: actorUserId,
    },
  });
}

export async function getAdminPrivacyWorkspace(actorUserId: string) {
  const draft = await ensureDraftPolicy(actorUserId);
  const published = await getPublishedPrivacyPolicy();
  const history = await prisma.privacyPolicy.findMany({
    where: { status: { in: ["PUBLISHED", "ARCHIVED"] } },
    orderBy: [{ publishedAt: "desc" }, { updatedAt: "desc" }],
    take: 20,
    select: {
      id: true,
      status: true,
      version: true,
      title: true,
      publishedAt: true,
      effectiveDate: true,
      updatedAt: true,
    },
  });
  return { draft, published, history };
}

export type PrivacyPolicyPatch = {
  version?: string;
  title?: string;
  content?: string;
  effectiveDate?: string | null;
  publicUrl?: string | null;
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
};

export async function updateDraftPrivacyPolicy(
  actorUserId: string,
  patch: PrivacyPolicyPatch
) {
  const draft = await ensureDraftPolicy(actorUserId);
  if (draft.status !== "DRAFT") {
    throw new AppError("Only draft policies can be edited", 400);
  }

  const effectiveDate =
    patch.effectiveDate === undefined
      ? undefined
      : patch.effectiveDate
        ? new Date(patch.effectiveDate)
        : null;
  if (effectiveDate !== undefined && effectiveDate && Number.isNaN(effectiveDate.getTime())) {
    throw new AppError("Invalid effective date", 400);
  }

  return prisma.privacyPolicy.update({
    where: { id: draft.id },
    data: {
      ...(patch.version !== undefined
        ? { version: String(patch.version).trim() || draft.version }
        : {}),
      ...(patch.title !== undefined ? { title: String(patch.title) } : {}),
      ...(patch.content !== undefined ? { content: String(patch.content) } : {}),
      ...(effectiveDate !== undefined ? { effectiveDate } : {}),
      ...(patch.publicUrl !== undefined
        ? { publicUrl: trimOrNull(patch.publicUrl) }
        : {}),
      ...(patch.legalBusinessName !== undefined
        ? { legalBusinessName: trimOrNull(patch.legalBusinessName) }
        : {}),
      ...(patch.businessAddress !== undefined
        ? { businessAddress: trimOrNull(patch.businessAddress) }
        : {}),
      ...(patch.country !== undefined
        ? { country: trimOrNull(patch.country) }
        : {}),
      ...(patch.supportEmail !== undefined
        ? { supportEmail: trimOrNull(patch.supportEmail) }
        : {}),
      ...(patch.supportPhone !== undefined
        ? { supportPhone: trimOrNull(patch.supportPhone) }
        : {}),
      ...(patch.dataRetentionInfo !== undefined
        ? { dataRetentionInfo: trimOrNull(patch.dataRetentionInfo) }
        : {}),
      ...(patch.deletionRequestContact !== undefined
        ? { deletionRequestContact: trimOrNull(patch.deletionRequestContact) }
        : {}),
      ...(patch.parentalConsentExplanation !== undefined
        ? {
            parentalConsentExplanation: trimOrNull(
              patch.parentalConsentExplanation
            ),
          }
        : {}),
      ...(patch.childDataDisclosure !== undefined
        ? { childDataDisclosure: trimOrNull(patch.childDataDisclosure) }
        : {}),
      ...(patch.learningDataDisclosure !== undefined
        ? { learningDataDisclosure: trimOrNull(patch.learningDataDisclosure) }
        : {}),
      ...(patch.deviceDataDisclosure !== undefined
        ? { deviceDataDisclosure: trimOrNull(patch.deviceDataDisclosure) }
        : {}),
      ...(patch.thirdPartyDisclosure !== undefined
        ? { thirdPartyDisclosure: trimOrNull(patch.thirdPartyDisclosure) }
        : {}),
      updatedByUserId: actorUserId,
    },
  });
}

function assertPublishable(draft: PrivacyPolicy) {
  const missing: string[] = [];
  if (!draft.title.trim()) missing.push("title");
  if (!draft.content.trim()) missing.push("policy content");
  if (!draft.version.trim() || draft.version.includes("draft")) {
    missing.push("version (use a release version, not draft)");
  }
  if (!trimOrNull(draft.legalBusinessName)) missing.push("legal business name");
  if (!trimOrNull(draft.supportEmail)) missing.push("support email");
  if (!trimOrNull(draft.parentalConsentExplanation)) {
    missing.push("parental consent explanation");
  }
  if (!trimOrNull(draft.childDataDisclosure)) {
    missing.push("child data disclosure");
  }
  if (!trimOrNull(draft.deletionRequestContact)) {
    missing.push("deletion request contact");
  }
  if (missing.length) {
    throw new AppError(
      `Cannot publish until required fields are completed: ${missing.join(", ")}`,
      400,
      { code: "PRIVACY_POLICY_INCOMPLETE", missing }
    );
  }
}

export async function publishDraftPrivacyPolicy(actorUserId: string) {
  const draft = await ensureDraftPolicy(actorUserId);
  assertPublishable(draft);

  return prisma.$transaction(async (tx) => {
    await tx.privacyPolicy.updateMany({
      where: { status: "PUBLISHED" },
      data: { status: "ARCHIVED" },
    });

    const published = await tx.privacyPolicy.update({
      where: { id: draft.id },
      data: {
        status: "PUBLISHED" satisfies PrivacyPolicyStatus,
        publishedAt: new Date(),
        publishedByUserId: actorUserId,
        updatedByUserId: actorUserId,
        effectiveDate: draft.effectiveDate ?? new Date(),
      },
    });

    // Fresh empty draft for next edits (no invented content).
    await tx.privacyPolicy.create({
      data: {
        id: newId("priv"),
        status: "DRAFT",
        version: "0.0.0-draft",
        title: "",
        content: "",
        createdByUserId: actorUserId,
        updatedByUserId: actorUserId,
      },
    });

    return published;
  });
}

export async function createPrivacyDataRequest(input: {
  userId?: string;
  requesterEmail: string;
  requesterName?: string;
  requestType?: PrivacyRequestType;
  message: string;
}) {
  const email = input.requesterEmail.trim().toLowerCase();
  if (!email.includes("@")) {
    throw new AppError("A valid requester email is required", 400);
  }
  const message = input.message.trim();
  if (message.length < 10) {
    throw new AppError("Please describe your request (at least 10 characters)", 400);
  }

  return prisma.privacyDataRequest.create({
    data: {
      id: newId("preq"),
      userId: input.userId,
      requesterEmail: email,
      requesterName: trimOrNull(input.requesterName ?? undefined),
      requestType: input.requestType ?? "ACCOUNT_DELETION",
      message,
      status: "SUBMITTED",
    },
  });
}

export async function listPrivacyDataRequests(filters?: {
  status?: PrivacyRequestStatus;
}) {
  return prisma.privacyDataRequest.findMany({
    where: {
      ...(filters?.status ? { status: filters.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
    },
  });
}

export async function updatePrivacyDataRequestStatus(
  requestId: string,
  input: { status: PrivacyRequestStatus; adminNotes?: string | null }
) {
  const existing = await prisma.privacyDataRequest.findUnique({
    where: { id: requestId },
  });
  if (!existing) throw new AppError("Privacy request not found", 404);

  const resolved =
    input.status === "RESOLVED" || input.status === "CLOSED"
      ? new Date()
      : existing.resolvedAt;

  return prisma.privacyDataRequest.update({
    where: { id: requestId },
    data: {
      status: input.status,
      adminNotes:
        input.adminNotes === undefined
          ? existing.adminNotes
          : trimOrNull(input.adminNotes),
      resolvedAt: resolved,
    },
  });
}
