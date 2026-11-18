/**
 * READ-ONLY production pre-cutover audit for Level-2 pilot batch-d2 (30 words).
 * SELECT only. Never updates imageUrl. Never runs --apply.
 *
 * On VPS (uses server .env DATABASE_URL):
 *   ALLOW_PRODUCTION=1 CONFIRM_PRODUCTION=1 \
 *     node server/scripts/audit-l2-pilot-batch-d2-precutover.mjs
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
const MANIFEST_CSV = path.join(ROOT, "exports/level2-3d-image-pilot-30-vps-upload-manifest.csv");
const URL_VERIFY_CSV = path.join(ROOT, "exports/level2-3d-image-pilot-30-url-verification.csv");
const PUBLIC_PREFIX = "https://api.siwiapp.shop/media/vocab/pilot/batch-d2";

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
    `Refusing non-local host "${host}". Set ALLOW_PRODUCTION=1 CONFIRM_PRODUCTION=1 for read-only production audit.`
  );
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
      } else if (ch === '"') inQuotes = false;
      else cur += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(cur);
      cur = "";
    } else cur += ch;
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

function redactDbHost(info) {
  return { mode: info.mode, host: info.host ? `${info.host.slice(0, 4)}…` : null };
}

async function main() {
  loadEnv();
  const db = assertDbAllowed();
  const prisma = new PrismaClient();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");

  const mapping = parseCsv(fs.readFileSync(MAPPING_CSV, "utf8"));
  const manifest = parseCsv(fs.readFileSync(MANIFEST_CSV, "utf8"));
  const urlVerify = fs.existsSync(URL_VERIFY_CSV)
    ? parseCsv(fs.readFileSync(URL_VERIFY_CSV, "utf8"))
    : [];

  if (mapping.length !== 30) throw new Error(`Expected 30 mapping rows, got ${mapping.length}`);
  if (manifest.length !== 30) throw new Error(`Expected 30 manifest rows, got ${manifest.length}`);

  const wordIds = mapping.map((r) => r.wordId);
  const dupIds = wordIds.filter((id, i) => wordIds.indexOf(id) !== i);
  const manifestById = new Map(manifest.map((r) => [r.wordId, r]));
  const urlById = new Map(urlVerify.map((r) => [r.wordId, r]));

  const errors = [];
  const warnings = [];
  const rows = [];

  if (dupIds.length) errors.push(`duplicate_wordIds:${[...new Set(dupIds)].join("|")}`);

  for (const item of mapping) {
    const proposed = `${PUBLIC_PREFIX}/${item.wordId}.jpg`;
    const man = manifestById.get(item.wordId);
    if (!man) {
      errors.push(`manifest_missing:${item.wordId}`);
      continue;
    }
    if (man.expectedPublicUrl !== proposed) {
      errors.push(`manifest_url_mismatch:${item.wordId}`);
    }
    if (man.filename !== `${item.wordId}.jpg`) {
      errors.push(`manifest_filename_mismatch:${item.wordId}`);
    }

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

    const levelCode = word.category?.group?.level?.code ?? null;
    if (levelCode !== "LEVEL_2") {
      errors.push(`wrong_level:${item.wordId}:${levelCode}`);
    }
    if (word.text !== item.word) {
      errors.push(`word_mismatch:${item.wordId}:${word.text}!=${item.word}`);
    }
    if (word.category?.code !== item.categoryCode) {
      errors.push(`categoryCode_mismatch:${item.wordId}`);
    }
    if (word.category?.label !== item.categoryLabel) {
      errors.push(`categoryLabel_mismatch:${item.wordId}`);
    }
    if (levelCode === "LEVEL_1") {
      errors.push(`level1_target_blocked:${item.wordId}`);
    }

    const uv = urlById.get(item.wordId);
    if (uv && uv.pass !== "PASS") {
      warnings.push(`url_verify_not_pass:${item.wordId}:${uv.error || uv.httpStatus}`);
    }

    rows.push({
      wordId: word.id,
      word: word.text,
      categoryCode: word.category?.code ?? null,
      categoryLabel: word.category?.label ?? null,
      groupCode: word.category?.group?.code ?? null,
      levelCode,
      isActive: word.isActive,
      currentImageUrl: word.imageUrl,
      proposedImageUrl: proposed,
      urlVerifyPass: uv?.pass ?? null,
    });
  }

  // Extra protection: ensure none of the 30 IDs resolve as LEVEL_1 anywhere
  const level1Hits = await prisma.vocabularyWord.count({
    where: {
      id: { in: wordIds },
      category: { group: { level: { code: "LEVEL_1" } } },
    },
  });
  if (level1Hits > 0) errors.push(`level1_id_count:${level1Hits}`);

  const backup = {
    createdAt: new Date().toISOString(),
    purpose: "pre-cutover-backup-read-only",
    batch: "batch-d2-pilot-30",
    level: "LEVEL_2",
    matchBy: "wordId",
    databaseWrites: 0,
    db: redactDbHost(db),
    rows: rows.map((r) => ({
      wordId: r.wordId,
      word: r.word,
      categoryCode: r.categoryCode,
      categoryLabel: r.categoryLabel,
      groupCode: r.groupCode,
      levelCode: r.levelCode,
      currentImageUrl: r.currentImageUrl,
      proposedImageUrl: r.proposedImageUrl,
    })),
  };

  const backupPath = path.join(
    ROOT,
    "exports",
    `level2-3d-image-pilot-30-production-precutover-backup-${stamp}.json`
  );
  fs.mkdirSync(path.dirname(backupPath), { recursive: true });
  fs.writeFileSync(backupPath, JSON.stringify(backup, null, 2));

  const validLevel2 = rows.filter((r) => r.levelCode === "LEVEL_2").length;
  const proposedUpdates = rows.filter(
    (r) => r.levelCode === "LEVEL_2" && r.proposedImageUrl && r.proposedImageUrl !== r.currentImageUrl
  ).length;
  const alreadySet = rows.filter((r) => r.currentImageUrl === r.proposedImageUrl).length;

  const reportMd = `# Level-2 Pilot Production Pre-Cutover Report

Generated: ${backup.createdAt}
Mode: READ-ONLY (no UPDATE / no --apply)

## Summary

| Check | Result |
|------|--------|
| Mapping rows | ${mapping.length} |
| DB records found | ${rows.length} |
| Valid LEVEL_2 targets | ${validLevel2} |
| Proposed imageUrl changes | ${proposedUpdates} |
| Already at proposed URL | ${alreadySet} |
| Missing records | ${errors.filter((e) => e.startsWith("db_missing")).length} |
| Duplicate wordIds | ${dupIds.length} |
| Wrong-level / conflicts | ${errors.filter((e) => !e.startsWith("db_missing")).length} |
| Level-1 targets in mapping | ${level1Hits} |
| Database writes | **0** |

## Database connection

- Mode: \`${db.mode}\`
- Host (redacted): \`${redactDbHost(db).host}\`

## Public URL verification (from CSV)

- Source: \`exports/level2-3d-image-pilot-30-url-verification.csv\`
- PASS count: ${urlVerify.filter((r) => r.pass === "PASS").length} / ${urlVerify.length || 0}

## Level-1 protection

- Update scope: exact 30 wordIds only
- LEVEL_1 IDs among targets: ${level1Hits}
- batch-d1 not targeted: yes (URLs use \`pilot/batch-d2\` only)

## Errors

${errors.length ? errors.map((e) => `- ${e}`).join("\n") : "- none"}

## Warnings

${warnings.length ? warnings.map((w) => `- ${w}`).join("\n") : "- none"}

## Backup

\`${path.relative(ROOT, backupPath).replace(/\\\\/g, "/")}\`

## Sample proposed changes (first 5)

${rows
  .slice(0, 5)
  .map(
    (r) =>
      `- \`${r.wordId}\` (${r.word}): \`${r.currentImageUrl ?? "null"}\` → \`${r.proposedImageUrl}\``
  )
  .join("\n")}

## Gate

${
  errors.length === 0 && validLevel2 === 30
    ? "**READY** for separate explicit production cutover approval."
    : "**BLOCKED** — resolve errors before any --apply."
}
`;

  const reportPath = path.join(ROOT, "exports/level2-3d-image-pilot-30-production-precutover-report.md");
  fs.writeFileSync(reportPath, reportMd);

  console.log(
    JSON.stringify(
      {
        ok: errors.length === 0 && validLevel2 === 30,
        db: redactDbHost(db),
        mappingRows: mapping.length,
        dbFound: rows.length,
        validLevel2,
        proposedUpdates,
        alreadySet,
        missing: errors.filter((e) => e.startsWith("db_missing")).length,
        duplicates: dupIds.length,
        level1Hits,
        errors,
        warnings,
        backupPath,
        reportPath,
        databaseWrites: 0,
      },
      null,
      2
    )
  );

  await prisma.$disconnect();
  process.exit(errors.length === 0 && validLevel2 === 30 ? 0 : 2);
}

main().catch(async (e) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
