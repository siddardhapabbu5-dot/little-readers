/**
 * Activate Grade 2–4 additional vocabulary drafts and ensure topics are published.
 * NEVER mutates LEVEL_1 / Grade 1.
 *
 * Local:
 *   node ./scripts/go-live-additional-vocab.mjs --apply
 *
 * Production (explicit only):
 *   ALLOW_PRODUCTION=1 CONFIRM_PRODUCTION=1 node ./scripts/go-live-additional-vocab.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const TARGET_LEVELS = ["LEVEL_2", "LEVEL_3", "LEVEL_4"];

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
  const isLocal = LOCAL_HOSTS.has(host);
  if (isLocal) return { host, mode: "local" };
  if (process.env.ALLOW_PRODUCTION === "1" && process.env.CONFIRM_PRODUCTION === "1") {
    return { host, mode: "production" };
  }
  throw new Error(
    `Refusing non-local host "${host}". Set ALLOW_PRODUCTION=1 CONFIRM_PRODUCTION=1 to run on live.`
  );
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const db = assertDbAllowed();
  const prisma = new PrismaClient();

  const g1Before = await prisma.vocabularyWord.count({
    where: { isActive: true, category: { group: { level: { code: "LEVEL_1" } } } },
  });
  const g1PubBefore = await prisma.learningCategory.count({
    where: { group: { level: { code: "LEVEL_1" } }, isPublished: true },
  });

  const inactive = await prisma.vocabularyWord.findMany({
    where: {
      isActive: false,
      category: { group: { level: { code: { in: TARGET_LEVELS } } } },
    },
    select: { id: true, categoryId: true },
  });

  const categories = await prisma.learningCategory.findMany({
    where: { group: { level: { code: { in: TARGET_LEVELS } } } },
    select: {
      id: true,
      code: true,
      status: true,
      isPublished: true,
      group: { select: { level: { select: { code: true } } } },
    },
  });

  const toPublish = categories.filter((c) => !c.isPublished || c.status !== "PUBLISHED");

  console.log(
    JSON.stringify(
      {
        db,
        apply,
        inactiveToActivate: inactive.length,
        categoriesToPublish: toPublish.length,
        grade1ActiveBefore: g1Before,
        grade1PublishedBefore: g1PubBefore,
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to make changes.");
    await prisma.$disconnect();
    return;
  }

  // Activate drafts (kids visibility requires isActive + published category)
  const act = await prisma.vocabularyWord.updateMany({
    where: {
      isActive: false,
      category: { group: { level: { code: { in: TARGET_LEVELS } } } },
    },
    data: { isActive: true },
  });

  // Publish G2–4 topics that have at least one active word
  let published = 0;
  for (const c of categories) {
    const activeCount = await prisma.vocabularyWord.count({
      where: { categoryId: c.id, isActive: true },
    });
    if (activeCount === 0) continue;
    if (c.isPublished && c.status === "PUBLISHED") {
      await prisma.learningCategory.update({
        where: { id: c.id },
        data: { needsReview: false },
      });
      continue;
    }
    await prisma.learningCategory.update({
      where: { id: c.id },
      data: {
        status: "PUBLISHED",
        isPublished: true,
        needsReview: false,
      },
    });
    published += 1;
  }

  const g1After = await prisma.vocabularyWord.count({
    where: { isActive: true, category: { group: { level: { code: "LEVEL_1" } } } },
  });
  const g1PubAfter = await prisma.learningCategory.count({
    where: { group: { level: { code: "LEVEL_1" } }, isPublished: true },
  });

  const byLevel = {};
  for (const code of TARGET_LEVELS) {
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
    activated: act.count,
    topicsPublishedNow: published,
    byLevel,
    grade1ActiveAfter: g1After,
    grade1PublishedAfter: g1PubAfter,
    grade1Unchanged: g1Before === g1After && g1PubBefore === g1PubAfter,
  };
  console.log(JSON.stringify(report, null, 2));
  fs.writeFileSync(
    path.join(ROOT, "docs", "curriculum", `go-live-additional-vocab-${db.mode}.json`),
    JSON.stringify(report, null, 2)
  );
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
});
