/**
 * Level-2 Types-of-Nouns pilot (30) 3D imageUrl cutover — wordId exact match only.
 *
 * Dry-run (default):
 *   node server/scripts/apply-l2-pilot-batch-d2-cutover.mjs
 *
 * Apply (local DB only unless production flags set):
 *   node server/scripts/apply-l2-pilot-batch-d2-cutover.mjs --apply
 *
 * Production (explicit):
 *   ALLOW_PRODUCTION=1 CONFIRM_PRODUCTION=1 PUBLIC_MEDIA_ORIGIN=https://api.siwiapp.shop \
 *     node server/scripts/apply-l2-pilot-batch-d2-cutover.mjs --apply
 *
 * Updates ONLY VocabularyWord.imageUrl for the 30 approved LEVEL_2 wordIds.
 * Never touches LEVEL_1. Never creates/deletes media files.
 *
 * Rollback: restore imageUrl from the JSON backup written under
 * server/storage/content-correction-work/l2-pilot-batch-d2-imageurl-backup-*.json
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const MAPPING_CSV = path.join(ROOT, "exports/level2-3d-image-pilot-30-mapping.csv");
const MEDIA_DIR = path.join(ROOT, "server/storage/vocab-media/pilot/batch-d2");
const PUBLIC_PATH_PREFIX = "/media/vocab/pilot/batch-d2";

function loadEnv() {
  for (const rel of [".env", "server/.env"]) {
    const envFile = path.join(ROOT, rel);
    if (!fs.existsSync(envFile)) continue;
    const parsed = parse(fs.readFileSync(envFile));
    for (const [k, v] of Object.entries(parsed)) {
      if (process.env[k] == null) process.env[k] = v;
    }
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

function mediaOrigin(dbMode) {
  const fromEnv = (process.env.PUBLIC_MEDIA_ORIGIN || "").replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (dbMode === "production") return "https://api.siwiapp.shop";
  return "http://127.0.0.1:4100";
}

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => {
    const cols = splitCsvLine(line);
    const row = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    return row;
  });
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const db = assertDbAllowed();
  const origin = mediaOrigin(db.mode);
  const prisma = new PrismaClient();

  if (!fs.existsSync(MAPPING_CSV)) {
    throw new Error(`Mapping CSV not found: ${MAPPING_CSV}`);
  }
  const mapping = parseCsv(fs.readFileSync(MAPPING_CSV, "utf8"));
  if (mapping.length !== 30) {
    throw new Error(`Expected 30 mapping rows, got ${mapping.length}`);
  }

  const wordIds = mapping.map((r) => r.wordId);
  if (new Set(wordIds).size !== 30) {
    throw new Error("Duplicate wordId in mapping CSV");
  }

  const rows = [];
  const errors = [];

  for (const item of mapping) {
    const filename = `${item.wordId}.jpg`;
    if (item.newFilename && item.newFilename !== filename) {
      errors.push(`filename_mismatch:${item.wordId}`);
    }
    const diskFile = path.join(MEDIA_DIR, filename);
    if (!fs.existsSync(diskFile)) {
      errors.push(`missing_file:${filename}`);
    }
    const nextImageUrl = `${origin}${PUBLIC_PATH_PREFIX}/${filename}`;

    const word = await prisma.vocabularyWord.findUnique({
      where: { id: item.wordId },
      select: {
        id: true,
        text: true,
        imageUrl: true,
        isActive: true,
        category: {
          select: {
            code: true,
            label: true,
            group: { select: { code: true, level: { select: { code: true } } } },
          },
        },
      },
    });

    if (!word) {
      errors.push(`db_missing:${item.wordId}`);
      continue;
    }
    if (word.category?.group?.level?.code !== "LEVEL_2") {
      errors.push(`not_level_2:${item.wordId}:${word.category?.group?.level?.code}`);
      continue;
    }
    if (word.text !== item.word) {
      errors.push(`text_mismatch:${item.wordId}:${word.text}!=${item.word}`);
    }
    if (word.category?.code !== item.categoryCode) {
      errors.push(`categoryCode_mismatch:${item.wordId}`);
    }

    rows.push({
      id: word.id,
      text: word.text,
      categoryCode: word.category?.code ?? null,
      categoryLabel: word.category?.label ?? null,
      levelCode: word.category?.group?.level?.code ?? null,
      previousImageUrl: word.imageUrl,
      nextImageUrl,
      filename,
    });
  }

  const summary = {
    db,
    apply,
    origin,
    mappingRows: mapping.length,
    matched: rows.length,
    errors,
    sample: rows.slice(0, 3).map((r) => ({
      id: r.id,
      text: r.text,
      previousImageUrl: r.previousImageUrl,
      nextImageUrl: r.nextImageUrl,
    })),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (errors.length) {
    console.error("Abort: fix errors before apply.");
    await prisma.$disconnect();
    process.exit(1);
  }
  if (rows.length !== 30) {
    console.error("Abort: expected exactly 30 matched LEVEL_2 rows.");
    await prisma.$disconnect();
    process.exit(1);
  }

  const backupDir = path.join(ROOT, "server/storage/content-correction-work");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(
    backupDir,
    `l2-pilot-batch-d2-imageurl-backup-${stamp}.json`
  );
  fs.writeFileSync(
    backupPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        origin,
        batch: "batch-d2-pilot-30",
        level: "LEVEL_2",
        matchBy: "wordId",
        rows,
      },
      null,
      2
    )
  );
  console.log(`Backup written: ${backupPath}`);

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to update imageUrl values.");
    console.log(
      "Rollback after apply: set each row.previousImageUrl back from the backup JSON."
    );
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const row of rows) {
    const result = await prisma.vocabularyWord.updateMany({
      where: {
        id: row.id,
        category: { group: { level: { code: "LEVEL_2" } } },
      },
      data: { imageUrl: row.nextImageUrl },
    });
    if (result.count !== 1) {
      throw new Error(`Failed LEVEL_2-scoped update for ${row.id}`);
    }
    updated += 1;
  }

  // After verification sample
  const verify = await prisma.vocabularyWord.findMany({
    where: { id: { in: rows.map((r) => r.id) } },
    select: { id: true, text: true, imageUrl: true },
  });
  const bad = verify.filter(
    (v) => v.imageUrl !== `${origin}${PUBLIC_PATH_PREFIX}/${v.id}.jpg`
  );

  console.log(
    JSON.stringify(
      {
        ok: bad.length === 0,
        updated,
        backupPath,
        verifyCount: verify.length,
        verifyFailures: bad.length,
        sampleAfter: verify.slice(0, 3),
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
  if (bad.length) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
