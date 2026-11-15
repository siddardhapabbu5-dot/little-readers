/**
 * Grade 1 text-free 3D image cutover.
 * Updates VocabularyWord.imageUrl for mapped LEVEL_1 words only.
 * Does NOT delete legacy PNG files.
 *
 * Local dry-run:
 *   node ./scripts/apply-g1-3d-cutover.mjs
 *
 * Local apply:
 *   node ./scripts/apply-g1-3d-cutover.mjs --apply
 *
 * Production (on VPS only):
 *   ALLOW_PRODUCTION=1 CONFIRM_PRODUCTION=1 \
 *   PUBLIC_MEDIA_ORIGIN=https://api.siwiapp.shop \
 *   node ./scripts/apply-g1-3d-cutover.mjs --apply
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

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

function loadPilotMap() {
  const candidates = [
    path.join(ROOT, "apps/mobile/data/pilot-batch-d1.json"),
    path.join(ROOT, "docs/documentation/siwi-3d-visual-upgrade/grade1/pilot-batch-d1.json"),
  ];
  const mapPath = candidates.find((p) => fs.existsSync(p));
  if (!mapPath) throw new Error("pilot-batch-d1.json not found");
  const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
  const byWordId = map.byWordId || {};
  return { mapPath, byWordId, count: Object.keys(byWordId).length };
}

function mediaOrigin(dbMode) {
  const fromEnv = (process.env.PUBLIC_MEDIA_ORIGIN || "").replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (dbMode === "production") return "https://api.siwiapp.shop";
  return "http://127.0.0.1:4100";
}

function toAbsolutePilotUrl(origin, relOrAbs) {
  if (/^https?:\/\//i.test(relOrAbs)) {
    try {
      const u = new URL(relOrAbs);
      return `${origin}${u.pathname}`;
    } catch {
      return relOrAbs;
    }
  }
  const rel = relOrAbs.startsWith("/") ? relOrAbs : `/${relOrAbs}`;
  return `${origin}${rel}`;
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const db = assertDbAllowed();
  const { mapPath, byWordId, count } = loadPilotMap();
  const origin = mediaOrigin(db.mode);
  const prisma = new PrismaClient();

  const ids = Object.keys(byWordId);
  const words = await prisma.vocabularyWord.findMany({
    where: { id: { in: ids } },
    select: {
      id: true,
      text: true,
      imageUrl: true,
      isActive: true,
      category: { select: { label: true, group: { select: { level: { select: { code: true } } } } } },
    },
  });
  const found = new Map(words.map((w) => [w.id, w]));
  const missingIds = ids.filter((id) => !found.has(id));
  const wrongLevel = words.filter((w) => w.category?.group?.level?.code !== "LEVEL_1");
  const eligible = words.filter((w) => w.category?.group?.level?.code === "LEVEL_1");

  const backup = eligible.map((w) => ({
    id: w.id,
    text: w.text,
    previousImageUrl: w.imageUrl,
    nextImageUrl: toAbsolutePilotUrl(origin, byWordId[w.id]),
    category: w.category?.label ?? null,
  }));

  const mediaRoot = path.join(ROOT, "server/storage/vocab-media/pilot/batch-d1");
  const missingFiles = eligible
    .filter((w) => !fs.existsSync(path.join(mediaRoot, `${w.id}.jpg`)))
    .map((w) => w.id);

  const summary = {
    db,
    apply,
    mapPath,
    origin,
    mappedIds: count,
    foundInDb: words.length,
    eligibleLevel1: eligible.length,
    missingIds: missingIds.length,
    wrongLevel: wrongLevel.length,
    missingFilesOnDisk: missingFiles.length,
    sampleMissingIds: missingIds.slice(0, 10),
    sampleMissingFiles: missingFiles.slice(0, 10),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (missingIds.length || wrongLevel.length) {
    console.error("Abort: every mapped id must exist as LEVEL_1. Fix map/DB before apply.");
    await prisma.$disconnect();
    process.exit(1);
  }
  if (missingFiles.length) {
    console.error(
      `Abort: ${missingFiles.length} JPG(s) missing under server/storage/vocab-media/pilot/batch-d1. Upload media first.`
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  const backupDir = path.join(ROOT, "server/storage/content-correction-work");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `g1-3d-imageurl-backup-${stamp}.json`);
  fs.writeFileSync(backupPath, JSON.stringify({ createdAt: new Date().toISOString(), origin, backup }, null, 2));
  console.log(`Backup written: ${backupPath}`);

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to update imageUrl values.");
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const row of backup) {
    await prisma.vocabularyWord.update({
      where: { id: row.id },
      data: { imageUrl: row.nextImageUrl },
    });
    updated += 1;
  }

  console.log(JSON.stringify({ ok: true, updated, backupPath }, null, 2));
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
