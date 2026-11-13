/**
 * Upsert enriched Grade 2–4 additional vocabulary on the current DATABASE_URL,
 * activate words, publish topics. Never touches LEVEL_1.
 *
 * Local:
 *   node ./scripts/apply-additional-vocab-production.mjs --apply
 *
 * Production:
 *   ALLOW_PRODUCTION=1 CONFIRM_PRODUCTION=1 node ./scripts/apply-additional-vocab-production.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DATA = path.join(ROOT, "docs/curriculum/additional-vocab-g2-4-enriched.json");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const GRADE_LEVEL = { 2: "LEVEL_2", 3: "LEVEL_3", 4: "LEVEL_4" };

function loadEnv() {
  const envFile = path.join(ROOT, ".env");
  if (!fs.existsSync(envFile)) return;
  const parsed = parse(fs.readFileSync(envFile));
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] == null) process.env[k] = v;
  }
}

function assertDbAllowed() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const host = new URL(raw).hostname;
  if (LOCAL_HOSTS.has(host)) return { host, mode: "local" };
  if (process.env.ALLOW_PRODUCTION === "1" && process.env.CONFIRM_PRODUCTION === "1") {
    return { host, mode: "production" };
  }
  throw new Error(`Refusing host "${host}". Need ALLOW_PRODUCTION=1 CONFIRM_PRODUCTION=1`);
}

function normLabel(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const db = assertDbAllowed();
  if (!fs.existsSync(DATA)) throw new Error(`Missing data file: ${DATA}`);
  const payload = JSON.parse(fs.readFileSync(DATA, "utf8"));
  const prisma = new PrismaClient();

  const g1Before = await prisma.vocabularyWord.count({
    where: { isActive: true, category: { group: { level: { code: "LEVEL_1" } } } },
  });

  const maps = {};
  for (const [grade, levelCode] of Object.entries(GRADE_LEVEL)) {
    const level = await prisma.learningLevel.findUnique({
      where: { code: levelCode },
      include: { groups: { include: { categories: true } } },
    });
    if (!level) throw new Error(`${levelCode} missing`);
    const byLabel = new Map();
    for (const g of level.groups) {
      for (const c of g.categories) byLabel.set(normLabel(c.label), c);
    }
    maps[grade] = byLabel;
  }

  let create = 0;
  let update = 0;
  let skip = 0;
  let unmatched = 0;
  const touched = new Set();

  console.log(JSON.stringify({ db, apply, rows: payload.count ?? payload.rows.length }, null, 2));

  for (const row of payload.rows) {
    const cat = maps[String(row.grade)]?.get(normLabel(row.topic));
    if (!cat) {
      unmatched += 1;
      continue;
    }
    touched.add(cat.id);
    const existing = await prisma.vocabularyWord.findUnique({
      where: { categoryId_text: { categoryId: cat.id, text: row.text } },
    });
    if (!apply) {
      if (existing) update += 1;
      else create += 1;
      continue;
    }
    if (existing) {
      await prisma.vocabularyWord.update({
        where: { id: existing.id },
        data: {
          meaning: row.meaning,
          exampleSentence: row.exampleSentence,
          phonetic: row.phonetic,
          isActive: true,
          emoji: existing.emoji?.trim() ? existing.emoji : "📚",
        },
      });
      update += 1;
    } else {
      await prisma.vocabularyWord.create({
        data: {
          categoryId: cat.id,
          text: row.text,
          meaning: row.meaning,
          exampleSentence: row.exampleSentence,
          phonetic: row.phonetic,
          emoji: "📚",
          difficulty: 2,
          sortOrder: 2000,
          firstLetter: row.text.charAt(0).toUpperCase(),
          isActive: true,
          origin: "CATEGORY_IMPORT",
        },
      });
      create += 1;
    }
  }

  let published = 0;
  if (apply) {
    for (const id of touched) {
      await prisma.learningCategory.update({
        where: { id },
        data: { status: "PUBLISHED", isPublished: true, needsReview: false },
      });
      published += 1;
    }
  }

  const g1After = await prisma.vocabularyWord.count({
    where: { isActive: true, category: { group: { level: { code: "LEVEL_1" } } } },
  });

  const byLevel = {};
  for (const code of Object.values(GRADE_LEVEL)) {
    byLevel[code] = {
      activeWords: await prisma.vocabularyWord.count({
        where: { isActive: true, category: { group: { level: { code } } } },
      }),
      publishedTopics: await prisma.learningCategory.count({
        where: { isPublished: true, group: { level: { code } } },
      }),
    };
  }

  const report = {
    mode: apply ? "APPLY" : "DRY_RUN",
    db,
    create,
    update,
    skip,
    unmatched,
    topicsPublished: published,
    byLevel,
    grade1ActiveBefore: g1Before,
    grade1ActiveAfter: g1After,
    grade1Unchanged: g1Before === g1After,
  };
  console.log(JSON.stringify(report, null, 2));
  fs.mkdirSync(path.join(ROOT, "docs/curriculum"), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, "docs/curriculum", `apply-additional-vocab-${db.mode}.json`),
    JSON.stringify(report, null, 2)
  );
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
