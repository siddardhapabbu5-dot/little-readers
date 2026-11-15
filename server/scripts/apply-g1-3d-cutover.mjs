/**
 * Grade 1 text-free 3D image cutover.
 *
 * Prefer text+category matching (safe across staging vs production IDs).
 * Falls back to staging wordId match when payload is absent.
 *
 * Production:
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

function loadPayload() {
  const candidates = [
    path.join(ROOT, "docs/documentation/siwi-3d-visual-upgrade/grade1/g1-3d-cutover-payload.json"),
    path.join(ROOT, "server/storage/content-correction-work/g1-3d-cutover-payload.json"),
    "/tmp/siwi-g1-3d/g1-3d-cutover-payload.json",
  ];
  const p = candidates.find((f) => fs.existsSync(f));
  if (!p) return null;
  return { path: p, data: JSON.parse(fs.readFileSync(p, "utf8")) };
}

function keyOf(category, text) {
  return `${String(category || "").trim().toLowerCase()}::${String(text || "").trim().toLowerCase()}`;
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const db = assertDbAllowed();
  const origin = mediaOrigin(db.mode);
  const prisma = new PrismaClient();
  const payloadInfo = loadPayload();

  if (!payloadInfo) {
    throw new Error("g1-3d-cutover-payload.json not found. Build it first.");
  }

  const items = payloadInfo.data.items || [];
  const level1 = await prisma.vocabularyWord.findMany({
    where: { category: { group: { level: { code: "LEVEL_1" } } } },
    select: {
      id: true,
      text: true,
      imageUrl: true,
      isActive: true,
      category: { select: { label: true, isPublished: true } },
    },
  });

  function pickBest(hits) {
    if (hits.length === 0) return null;
    if (hits.length === 1) return hits[0];
    const ranked = [...hits].sort((a, b) => {
      const score = (w) =>
        (w.isActive ? 4 : 0) + (w.category?.isPublished ? 2 : 0) + (w.imageUrl ? 1 : 0);
      return score(b) - score(a);
    });
    const best = ranked[0];
    const second = ranked[1];
    const bestScore =
      (best.isActive ? 4 : 0) + (best.category?.isPublished ? 2 : 0) + (best.imageUrl ? 1 : 0);
    const secondScore =
      (second.isActive ? 4 : 0) +
      (second.category?.isPublished ? 2 : 0) +
      (second.imageUrl ? 1 : 0);
    if (bestScore === secondScore) return null; // still ambiguous
    return best;
  }

  const matched = [];
  const missing = [];
  const ambiguous = [];

  for (const item of items) {
    const k = keyOf(item.category, item.text);
    const hits = level1.filter((w) => keyOf(w.category?.label, w.text) === k);
    const chosen = pickBest(hits);
    if (chosen) {
      matched.push({
        id: chosen.id,
        text: chosen.text,
        category: chosen.category?.label ?? null,
        previousImageUrl: chosen.imageUrl,
        nextImageUrl: toAbsolutePilotUrl(origin, item.relPath),
        stagingId: item.stagingId,
        relPath: item.relPath,
      });
    } else if (hits.length === 0) {
      missing.push(item);
    } else {
      ambiguous.push({ item, count: hits.length });
    }
  }

  const mediaRoot = path.join(ROOT, "server/storage/vocab-media/pilot/batch-d1");
  const missingFiles = matched
    .filter((row) => {
      const file = path.basename(row.relPath);
      return !fs.existsSync(path.join(mediaRoot, file));
    })
    .map((row) => row.relPath);

  const summary = {
    db,
    apply,
    payloadPath: payloadInfo.path,
    origin,
    payloadItems: items.length,
    level1InDb: level1.length,
    matched: matched.length,
    missing: missing.length,
    ambiguous: ambiguous.length,
    missingFilesOnDisk: missingFiles.length,
    sampleMissing: missing.slice(0, 10).map((m) => `${m.category}|${m.text}`),
    sampleAmbiguous: ambiguous.slice(0, 5).map((a) => `${a.item.category}|${a.item.text}×${a.count}`),
    sampleMissingFiles: missingFiles.slice(0, 10),
  };
  console.log(JSON.stringify(summary, null, 2));

  if (missing.length || ambiguous.length || missingFiles.length) {
    console.error("Abort: fix missing/ambiguous/files before apply.");
    await prisma.$disconnect();
    process.exit(1);
  }

  const backupDir = path.join(ROOT, "server/storage/content-correction-work");
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = path.join(backupDir, `g1-3d-imageurl-backup-${stamp}.json`);
  fs.writeFileSync(
    backupPath,
    JSON.stringify({ createdAt: new Date().toISOString(), origin, matched }, null, 2)
  );
  console.log(`Backup written: ${backupPath}`);

  if (!apply) {
    console.log("Dry-run only. Re-run with --apply to update imageUrl values.");
    await prisma.$disconnect();
    return;
  }

  let updated = 0;
  for (const row of matched) {
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
