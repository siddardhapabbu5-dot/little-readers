import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { PolicyDocumentType } from "@prisma/client";
import { env } from "../config/env.js";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

export const MAX_POLICY_PDF_BYTES = 10 * 1024 * 1024;
const LINK_TTL_SECONDS = 5 * 60;

type DocDefault = {
  type: PolicyDocumentType;
  slug: string;
  title: string;
  description: string;
  downloadName: string;
};

const DEFAULTS: DocDefault[] = [
  {
    type: "PRIVACY_POLICY",
    slug: "privacy-policy",
    title: "LEARN WISE Privacy Policy",
    description: "How LEARN WISE collects, uses and protects personal and learning data.",
    downloadName: "LEARN_WISE_Privacy_Policy.pdf",
  },
  {
    type: "TERMS_OF_SERVICE",
    slug: "terms-of-service",
    title: "LEARN WISE Terms of Service",
    description: "Terms that govern use of the LEARN WISE app and website.",
    downloadName: "LEARN_WISE_Terms_of_Service.pdf",
  },
  {
    type: "PARENTAL_CONSENT",
    slug: "parental-consent",
    title: "LEARN WISE Parental Consent",
    description: "Parent/guardian consent for a child's use of LEARN WISE.",
    downloadName: "LEARN_WISE_Parental_Consent.pdf",
  },
  {
    type: "SUBSCRIPTION_REFUND",
    slug: "subscription-refund-policy",
    title: "LEARN WISE Subscription & Refund Policy",
    description: "Subscription duration, price, renewal, cancellation and refund conditions.",
    downloadName: "LEARN_WISE_Subscription_Refund_Policy.pdf",
  },
];

export function documentDefaults() {
  return DEFAULTS;
}

const metaSelect = {
  id: true,
  type: true,
  title: true,
  description: true,
  version: true,
  fileName: true,
  fileSize: true,
  uploadedAt: true,
  updatedAt: true,
} as const;

export function resolveDocument(slug: string): DocDefault {
  const def = DEFAULTS.find((d) => d.slug === slug);
  if (!def) throw new AppError("Unknown policy document", 404);
  return def;
}

async function ensureDefaults() {
  const existing = await prisma.policyDocument.findMany({ select: { type: true } });
  const have = new Set(existing.map((e) => e.type));
  const missing = DEFAULTS.filter((d) => !have.has(d.type));
  if (missing.length) {
    await prisma.policyDocument.createMany({
      data: missing.map((d) => ({ type: d.type, title: d.title, description: d.description })),
      skipDuplicates: true,
    });
  }
}

function shape(
  row: {
    type: PolicyDocumentType;
    title: string;
    description: string;
    version: string;
    fileName: string | null;
    fileSize: number | null;
    uploadedAt: Date | null;
    updatedAt: Date;
  }
) {
  const def = DEFAULTS.find((d) => d.type === row.type)!;
  return {
    slug: def.slug,
    type: row.type,
    title: row.title,
    description: row.description,
    version: row.version,
    uploaded: row.fileSize != null,
    fileName: row.fileName,
    fileSize: row.fileSize,
    uploadedAt: row.uploadedAt,
    updatedAt: row.updatedAt,
    downloadName: def.downloadName,
  };
}

export async function listPolicyDocuments() {
  await ensureDefaults();
  const rows = await prisma.policyDocument.findMany({ select: metaSelect });
  const order = DEFAULTS.map((d) => d.type);
  rows.sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type));
  return rows.map(shape);
}

export async function updatePolicyDocumentDetails(
  slug: string,
  userId: string,
  input: { title?: string; description?: string; version?: string }
) {
  const def = resolveDocument(slug);
  await ensureDefaults();
  const row = await prisma.policyDocument.update({
    where: { type: def.type },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() || def.title } : {}),
      ...(input.description !== undefined ? { description: input.description.trim() } : {}),
      ...(input.version !== undefined ? { version: input.version.trim() } : {}),
      updatedByUserId: userId,
    },
    select: metaSelect,
  });
  console.info(`[policy-documents] ${def.type} details updated by ${userId}`);
  return shape(row);
}

function safeOriginalName(name: string, fallback: string) {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[^A-Za-z0-9 ._()-]/g, "_").replace(/\s+/g, " ").trim().slice(0, 120);
  return cleaned.toLowerCase().endsWith(".pdf") && cleaned.length > 4 ? cleaned : fallback;
}

export function assertPdf(file: { originalname: string; mimetype: string; buffer: Buffer; size: number }) {
  if (!file.originalname.toLowerCase().endsWith(".pdf")) {
    throw new AppError("Only PDF files (.pdf) can be uploaded", 400);
  }
  if (file.mimetype && !["application/pdf", "application/octet-stream", "application/x-pdf"].includes(file.mimetype)) {
    throw new AppError("Only PDF files can be uploaded", 400);
  }
  if (file.size < 5 || file.buffer.subarray(0, 5).toString("latin1") !== "%PDF-") {
    throw new AppError("File content is not a valid PDF", 400);
  }
  if (file.size > MAX_POLICY_PDF_BYTES) {
    throw new AppError("PDF is larger than 10 MB", 413);
  }
}

export async function uploadPolicyDocumentFile(
  slug: string,
  userId: string,
  file: { originalname: string; mimetype: string; buffer: Buffer; size: number }
) {
  const def = resolveDocument(slug);
  assertPdf(file);
  await ensureDefaults();
  const row = await prisma.policyDocument.update({
    where: { type: def.type },
    data: {
      fileName: safeOriginalName(file.originalname, def.downloadName),
      fileSize: file.size,
      fileSha256: createHash("sha256").update(file.buffer).digest("hex"),
      fileData: file.buffer,
      uploadedAt: new Date(),
      uploadedByUserId: userId,
      updatedByUserId: userId,
    },
    select: metaSelect,
  });
  console.info(`[policy-documents] ${def.type} PDF uploaded (${file.size} bytes) by ${userId}`);
  return shape(row);
}

export async function deletePolicyDocumentFile(slug: string, userId: string) {
  const def = resolveDocument(slug);
  await ensureDefaults();
  const row = await prisma.policyDocument.update({
    where: { type: def.type },
    data: {
      fileName: null,
      fileSize: null,
      fileSha256: null,
      fileData: null,
      uploadedAt: null,
      uploadedByUserId: null,
      updatedByUserId: userId,
    },
    select: metaSelect,
  });
  console.info(`[policy-documents] ${def.type} PDF deleted by ${userId}`);
  return shape(row);
}

export async function getPolicyDocumentFile(slug: string) {
  const def = resolveDocument(slug);
  const row = await prisma.policyDocument.findUnique({
    where: { type: def.type },
    select: { fileData: true, fileSha256: true },
  });
  if (!row?.fileData) throw new AppError("No PDF uploaded for this document", 404);
  return { data: Buffer.from(row.fileData), sha256: row.fileSha256, downloadName: def.downloadName };
}

const versionSelect = {
  id: true,
  type: true,
  version: true,
  title: true,
  effectiveDate: true,
  requiresReacceptance: true,
  notes: true,
  fileName: true,
  fileSize: true,
  publishedAt: true,
} as const;

/** Freezes the currently uploaded PDF as a new, immutable published version. */
export async function publishPolicyDocument(
  slug: string,
  userId: string,
  input: { version: string; effectiveDate: Date; requiresReacceptance: boolean; notes?: string }
) {
  const def = resolveDocument(slug);
  await ensureDefaults();
  const version = input.version.trim();
  if (!version) throw new AppError("Version is required", 400);
  const doc = await prisma.policyDocument.findUnique({ where: { type: def.type } });
  if (!doc?.fileData || !doc.fileSha256 || doc.fileSize == null) {
    throw new AppError("Upload the PDF before publishing", 400);
  }
  const dup = await prisma.policyDocumentVersion.findUnique({
    where: { type_version: { type: def.type, version } },
  });
  if (dup) throw new AppError(`Version ${version} is already published. Use a new version number.`, 409);

  const [created] = await prisma.$transaction([
    prisma.policyDocumentVersion.create({
      data: {
        type: def.type,
        version,
        title: doc.title,
        effectiveDate: input.effectiveDate,
        requiresReacceptance: input.requiresReacceptance,
        notes: input.notes?.trim() || null,
        fileName: doc.fileName ?? def.downloadName,
        fileSize: doc.fileSize,
        fileSha256: doc.fileSha256,
        fileData: doc.fileData,
        publishedByUserId: userId,
      },
      select: versionSelect,
    }),
    prisma.policyDocument.update({
      where: { type: def.type },
      data: { version, updatedByUserId: userId },
    }),
  ]);
  console.info(`[policy-documents] ${def.type} v${version} published by ${userId}`);
  return created;
}

export async function listPolicyVersions(slug: string) {
  const def = resolveDocument(slug);
  const rows = await prisma.policyDocumentVersion.findMany({
    where: { type: def.type },
    orderBy: { publishedAt: "desc" },
    select: { ...versionSelect, _count: { select: { consents: true } } },
  });
  return rows.map(({ _count, ...r }) => ({ ...r, acceptances: _count.consents }));
}

export async function getPolicyVersionFile(versionId: string) {
  const row = await prisma.policyDocumentVersion.findUnique({
    where: { id: versionId },
    select: { type: true, version: true, fileData: true },
  });
  if (!row) throw new AppError("Document version not found", 404);
  const def = DEFAULTS.find((d) => d.type === row.type)!;
  return {
    data: Buffer.from(row.fileData),
    downloadName: def.downloadName.replace(/\.pdf$/, `_v${row.version}.pdf`),
  };
}

export function createPolicyVersionLinkToken(versionId: string) {
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS;
  const payload = `v-${versionId}.0.${exp}`;
  return { token: `${payload}.${sign(payload)}`, expiresInSec: LINK_TTL_SECONDS };
}

function sign(payload: string) {
  return createHmac("sha256", env.JWT_SECRET).update(`policy-doc:${payload}`).digest("base64url");
}

/** Short-lived link for phones, which cannot attach the Bearer header when opening a PDF viewer. */
export function createPolicyDocumentLinkToken(slug: string, download: boolean) {
  resolveDocument(slug);
  const exp = Math.floor(Date.now() / 1000) + LINK_TTL_SECONDS;
  const payload = `${slug}.${download ? 1 : 0}.${exp}`;
  return { token: `${payload}.${sign(payload)}`, expiresInSec: LINK_TTL_SECONDS };
}

export function verifyPolicyDocumentLinkToken(token: string) {
  const parts = token.split(".");
  if (parts.length !== 4) throw new AppError("Link is invalid or has expired", 401);
  const [slug, dl, expRaw, sig] = parts;
  const expected = Buffer.from(sign(`${slug}.${dl}.${expRaw}`));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
    throw new AppError("Link is invalid or has expired", 401);
  }
  if (Number(expRaw) < Math.floor(Date.now() / 1000)) {
    throw new AppError("Link is invalid or has expired", 401);
  }
  return { slug, download: dl === "1" };
}
