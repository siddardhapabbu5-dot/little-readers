import { randomInt } from "node:crypto";
import { APP_NAME, CERTIFICATE_PREFIX } from "@little-readers/shared";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { certificateAchievementCode } from "./grade-access.js";

const NO_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function newCertificateNo(year: number) {
  let code = "";
  for (let i = 0; i < 6; i += 1) code += NO_ALPHABET[randomInt(NO_ALPHABET.length)];
  return `${CERTIFICATE_PREFIX}-${year}-${code}`;
}

type CertificateView = {
  id: string;
  certificateNo: string;
  title: string;
  childName: string;
  /** Child photo, else the account profile photo; only inline data:image URLs are returned. */
  photoUrl: string | null;
  category: { id: string; label: string; emoji: string; wordCount: number } | null;
  issuedAt: Date;
  appName: string;
};

const CHILD_SELECT = {
  displayName: true,
  avatarUrl: true,
  parentId: true,
  parent: { select: { avatarUrl: true } },
} as const;

type CertificateChild = {
  displayName: string;
  avatarUrl: string | null;
  parent: { avatarUrl: string | null };
};

function photoFor(child: CertificateChild) {
  const isInlineImage = (u: string | null) => Boolean(u && /^data:image\/(png|jpe?g|webp);base64,/i.test(u));
  if (isInlineImage(child.avatarUrl)) return child.avatarUrl;
  if (isInlineImage(child.parent.avatarUrl)) return child.parent.avatarUrl;
  return null;
}

async function toViews(
  rows: Array<{
    id: string;
    certificateNo: string | null;
    title: string;
    categoryId: string | null;
    issuedAt: Date;
    child: CertificateChild;
  }>
): Promise<CertificateView[]> {
  const ids = rows.map((r) => r.categoryId).filter((id): id is string => Boolean(id));
  const cats = await prisma.learningCategory.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      label: true,
      emoji: true,
      _count: { select: { words: { where: { isActive: true } } } },
    },
  });
  const byId = new Map(cats.map((c) => [c.id, c]));
  return rows.map((r) => {
    const c = r.categoryId ? byId.get(r.categoryId) : undefined;
    return {
      id: r.id,
      certificateNo: r.certificateNo ?? r.id,
      title: r.title,
      childName: r.child.displayName,
      photoUrl: photoFor(r.child),
      category: c ? { id: c.id, label: c.label, emoji: c.emoji, wordCount: c._count.words } : null,
      issuedAt: r.issuedAt,
      appName: APP_NAME,
    };
  });
}

/**
 * Issue the category certificate once the child has answered every active word
 * of the category correctly at least once. Returns the new certificate, or null.
 */
export async function issueCertificateIfMastered(childId: string, categoryId: string) {
  const existing = await prisma.certificate.findUnique({
    where: { childId_categoryId: { childId, categoryId } },
    select: { id: true },
  });
  if (existing) return null;

  const category = await prisma.learningCategory.findUnique({
    where: { id: categoryId },
    select: {
      id: true,
      code: true,
      label: true,
      group: { select: { level: { select: { code: true } } } },
      words: { where: { isActive: true }, select: { id: true } },
    },
  });
  if (!category || category.words.length === 0) return null;

  const learned = await prisma.questionAttempt.findMany({
    where: {
      isCorrect: true,
      session: { childId },
      wordId: { in: category.words.map((w) => w.id) },
    },
    select: { wordId: true },
    distinct: ["wordId"],
  });
  if (learned.length < category.words.length) return null;

  const year = Number(
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date())
  );
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const created = await prisma.certificate.create({
        data: {
          childId,
          categoryId,
          certificateNo: newCertificateNo(year),
          title: `${category.label} Champion`,
          description: `Learned all ${category.words.length} words in ${category.label}`,
          templateCode: "CATEGORY_COMPLETE",
        },
        include: { child: { select: CHILD_SELECT } },
      });
      const achievementCode = certificateAchievementCode(category.group.level.code, category.code);
      await prisma.achievement.upsert({
        where: { childId_code: { childId, code: achievementCode } },
        create: {
          childId,
          code: achievementCode,
          title: `${category.label} Champion`,
          description: `Earned the ${category.label} certificate`,
        },
        update: {},
      });
      return (await toViews([created]))[0];
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "P2002") throw err;
      // Either another request issued it first, or the number collided: re-check.
      const again = await prisma.certificate.findUnique({
        where: { childId_categoryId: { childId, categoryId } },
        select: { id: true },
      });
      if (again) return null;
    }
  }
  throw new AppError("Could not issue certificate", 500);
}

export async function assertParentOwnsChild(parentId: string, childId: string, role?: string) {
  const where =
    role === "ADMIN" || role === "SUPER_ADMIN"
      ? { id: childId }
      : { id: childId, parentId, isActive: true };
  const child = await prisma.child.findFirst({ where, select: { id: true } });
  if (!child) throw new AppError("Child not found", 404);
}

export async function listChildCertificates(parentId: string, childId: string, role?: string) {
  await assertParentOwnsChild(parentId, childId, role);
  const rows = await prisma.certificate.findMany({
    where: { childId, categoryId: { not: null } },
    orderBy: { issuedAt: "desc" },
    include: { child: { select: CHILD_SELECT } },
  });
  return toViews(rows);
}

export async function getCertificate(parentId: string, certificateId: string, role?: string) {
  const row = await prisma.certificate.findUnique({
    where: { id: certificateId },
    include: { child: { select: CHILD_SELECT } },
  });
  const elevated = role === "ADMIN" || role === "SUPER_ADMIN";
  if (!row || (!elevated && row.child.parentId !== parentId)) {
    throw new AppError("Certificate not found", 404);
  }
  return (await toViews([row]))[0];
}
