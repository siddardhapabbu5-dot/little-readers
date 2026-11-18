/**
 * Validate Level-2 pilot 3D images in batch-d2 (read-only).
 *
 * Usage (from repo root or server/):
 *   node server/scripts/validate-l2-pilot-batch-d2.mjs
 *   node server/scripts/validate-l2-pilot-batch-d2.mjs --dir path/to/batch-d2
 *
 * Does NOT touch the database or modify any files.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_DIR = path.join(ROOT, "server/storage/vocab-media/pilot/batch-d2");
const MAPPING_CSV = path.join(ROOT, "exports/level2-3d-image-pilot-30-mapping.csv");
const FULL_CSV = path.join(ROOT, "exports/level2-3d-image-mapping.csv");

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").trim().split(/\r?\n/);
  if (!lines.length) return [];
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

function readJpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
    return { ok: false, error: "not_jpeg_soi" };
  }
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const len = (buf[i + 2] << 8) | buf[i + 3];
    if (len < 2) return { ok: false, error: "bad_segment_length" };
    // SOF0–SOF3, SOF5–SOF7, SOF9–SOF11, SOF13–SOF15
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      const height = (buf[i + 5] << 8) | buf[i + 6];
      const width = (buf[i + 7] << 8) | buf[i + 8];
      return { ok: true, width, height };
    }
    i += 2 + len;
  }
  return { ok: false, error: "sof_not_found" };
}

function main() {
  const dirArg = process.argv.indexOf("--dir");
  const mediaDir =
    dirArg >= 0 && process.argv[dirArg + 1] ? path.resolve(process.argv[dirArg + 1]) : DEFAULT_DIR;

  if (!fs.existsSync(MAPPING_CSV)) {
    console.error(`Missing mapping CSV: ${MAPPING_CSV}`);
    process.exit(1);
  }
  if (!fs.existsSync(FULL_CSV)) {
    console.error(`Missing full export CSV: ${FULL_CSV}`);
    process.exit(1);
  }
  if (!fs.existsSync(mediaDir)) {
    console.error(`Missing media folder: ${mediaDir}`);
    process.exit(1);
  }

  const mapping = parseCsv(fs.readFileSync(MAPPING_CSV, "utf8"));
  const full = parseCsv(fs.readFileSync(FULL_CSV, "utf8"));
  const fullById = new Map(full.map((r) => [r.wordId, r]));

  const errors = [];
  const warnings = [];

  if (mapping.length !== 30) {
    errors.push(`mapping_rows_expected_30_got_${mapping.length}`);
  }

  const ids = mapping.map((r) => r.wordId);
  const idSet = new Set(ids);
  if (idSet.size !== ids.length) {
    errors.push("duplicate_wordId_in_mapping");
  }

  for (const row of mapping) {
    if (!row.wordId) errors.push(`empty_wordId`);
    if (!row.word) errors.push(`empty_word:${row.wordId}`);
    if (row.newFilename !== `${row.wordId}.jpg`) {
      errors.push(`filename_mismatch:${row.wordId}:${row.newFilename}`);
    }
    const orig = fullById.get(row.wordId);
    if (!orig) {
      errors.push(`wordId_not_in_full_export:${row.wordId}`);
      continue;
    }
    if (orig.word !== row.word) errors.push(`word_mismatch:${row.wordId}`);
    if (orig.categoryCode !== row.categoryCode) errors.push(`categoryCode_mismatch:${row.wordId}`);
    if (orig.categoryLabel !== row.categoryLabel) {
      errors.push(`categoryLabel_mismatch:${row.wordId}`);
    }
    if (orig.groupCode !== row.groupCode) errors.push(`groupCode_mismatch:${row.wordId}`);
  }

  const files = fs
    .readdirSync(mediaDir)
    .filter((n) => n !== ".gitkeep" && !n.startsWith("."));
  const jpgFiles = files.filter((n) => n.toLowerCase().endsWith(".jpg"));
  const otherFiles = files.filter((n) => !n.toLowerCase().endsWith(".jpg"));

  if (otherFiles.length) {
    errors.push(`unexpected_non_jpg:${otherFiles.join("|")}`);
  }

  const expectedNames = ids.map((id) => `${id}.jpg`);
  const expectedSet = new Set(expectedNames);
  const presentSet = new Set(jpgFiles);

  const missing = expectedNames.filter((n) => !presentSet.has(n));
  const unexpected = jpgFiles.filter((n) => !expectedSet.has(n));
  const dupNames = jpgFiles.filter((n, i) => jpgFiles.indexOf(n) !== i);

  if (missing.length) errors.push(`missing_files:${missing.length}`);
  if (unexpected.length) errors.push(`unexpected_files:${unexpected.join("|")}`);
  if (dupNames.length) errors.push(`duplicate_filenames:${dupNames.join("|")}`);

  const imageChecks = [];
  for (const name of expectedNames) {
    const fp = path.join(mediaDir, name);
    if (!fs.existsSync(fp)) {
      imageChecks.push({ name, ok: false, error: "missing" });
      continue;
    }
    const buf = fs.readFileSync(fp);
    if (!buf.length) {
      imageChecks.push({ name, ok: false, error: "empty" });
      errors.push(`empty_file:${name}`);
      continue;
    }
    const size = readJpegSize(buf);
    if (!size.ok) {
      imageChecks.push({ name, ok: false, error: size.error, bytes: buf.length });
      errors.push(`invalid_jpg:${name}:${size.error}`);
      continue;
    }
    const square = size.width === size.height;
    if (!square) {
      errors.push(`not_square:${name}:${size.width}x${size.height}`);
    }
    const wordId = name.replace(/\.jpg$/i, "");
    const maps = wordId === name.replace(/\.jpg$/i, "") && idSet.has(wordId);
    if (!maps) errors.push(`filename_wordId_map_fail:${name}`);
    imageChecks.push({
      name,
      ok: square && maps,
      width: size.width,
      height: size.height,
      bytes: buf.length,
      wordId,
    });
  }

  const ready =
    errors.length === 0 &&
    jpgFiles.length === 30 &&
    missing.length === 0 &&
    unexpected.length === 0;

  const report = {
    ok: ready,
    mediaDir,
    mappingCsv: MAPPING_CSV,
    expected: 30,
    mappingRows: mapping.length,
    jpgOnDisk: jpgFiles.length,
    missingCount: missing.length,
    unexpectedCount: unexpected.length,
    missingSample: missing.slice(0, 10),
    unexpectedSample: unexpected.slice(0, 10),
    errors,
    warnings,
    imageSample: imageChecks.slice(0, 5),
    note: ready
      ? "All 30 pilot images present and valid."
      : "Place exactly 30 {wordId}.jpg files in batch-d2, then re-run.",
  };

  console.log(JSON.stringify(report, null, 2));
  process.exit(ready ? 0 : 2);
}

main();
