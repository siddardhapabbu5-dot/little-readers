/**
 * Extra baseline for the disposable test database, run after prisma/seed.ts by tests/global-setup.ts.
 * Mirrors the local development state the suite was written against:
 * - the 750-word Grade 1 vocabulary (restored separately on dev databases)
 * - published agreement documents (required before payment)
 * - Grades 1 and 2 published, Grades 2–4 workbooks imported as drafts
 * - two seated Grade 1 children for the demo parent
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveTestDatabaseUrl } from "./test-db.js";

process.env.DATABASE_URL = resolveTestDatabaseUrl();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const curriculumDir = path.resolve(__dirname, "../../docs/curriculum");

const { prisma } = await import("../src/lib/prisma.js");
const { seedLevel1Vocabulary } = await import("../prisma/seeds/level1-vocabulary.js");
const { applyCurriculumImport } = await import("../src/curriculum/curriculum.service.js");

const MINIMAL_PDF = Buffer.from(
  "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[]/Count 0>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n"
);
const POLICY_TYPES = {
  TERMS_OF_SERVICE: "TERMS",
  PRIVACY_POLICY: "PRIVACY",
  PARENTAL_CONSENT: "PARENTAL",
  SUBSCRIPTION_REFUND: "SUBSCRIPTION_TERMS",
} as const;

try {
  const l1 = await seedLevel1Vocabulary(prisma as unknown as Parameters<typeof seedLevel1Vocabulary>[0], {
    includeWords: true,
  });
  console.log(`Test baseline: Level 1 ${l1.categories} categories, ${l1.words} words`);

  const parent = await prisma.user.findUniqueOrThrow({ where: { email: "parent@littlereaders.test" } });
  for (const [type, consentType] of Object.entries(POLICY_TYPES) as [keyof typeof POLICY_TYPES, (typeof POLICY_TYPES)[keyof typeof POLICY_TYPES]][]) {
    const version = await prisma.policyDocumentVersion.upsert({
      where: { type_version: { type, version: "1.0" } },
      update: {},
      create: {
        type,
        version: "1.0",
        title: type.replace(/_/g, " "),
        effectiveDate: new Date("2026-01-01T00:00:00Z"),
        requiresReacceptance: true,
        fileName: `${type.toLowerCase()}.pdf`,
        fileSize: MINIMAL_PDF.length,
        fileSha256: "test-baseline",
        fileData: MINIMAL_PDF,
        publishedAt: new Date("2026-01-01T00:00:00Z"),
      },
    });
    await prisma.parentalConsent.create({
      data: { userId: parent.id, consentType, version: "1.0", policyVersionId: version.id, source: "PARENT_AGREEMENTS" },
    });
  }

  await prisma.learningLevel.update({
    where: { code: "LEVEL_1" },
    data: { isPublished: true, isActive: true, startGrade: 1, endGrade: 3 },
  });
  await prisma.learningLevel.update({ where: { code: "LEVEL_2" }, data: { isPublished: true } });
  for (const grade of [2, 3, 4]) {
    const file = path.join(curriculumDir, `LearnWise-GRADE-${grade}-Curriculum.xlsx`);
    if (!fs.existsSync(file)) continue;
    const r = await applyCurriculumImport({
      levelCode: `LEVEL_${grade}` as "LEVEL_2" | "LEVEL_3" | "LEVEL_4",
      buffer: fs.readFileSync(file),
      filename: path.basename(file),
      allowPartial: true,
    });
    console.log(`Test baseline: Grade ${grade} import ${r.topicsCreated} topics, ${r.wordsCreated} words`);
  }

  const level1 = await prisma.learningLevel.findUniqueOrThrow({ where: { code: "LEVEL_1" } });
  const kids = await prisma.child.findMany({ where: { parentId: parent.id }, orderBy: { createdAt: "asc" } });
  for (const [i, name] of ["Ava", "Ben"].entries()) {
    const existing = kids[i];
    if (existing) {
      await prisma.child.update({ where: { id: existing.id }, data: { levelId: level1.id, hasLearningSeat: true } });
    } else {
      await prisma.child.create({
        data: { parentId: parent.id, displayName: name, birthYear: 2023, levelId: level1.id, hasLearningSeat: true },
      });
    }
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
