/**
 * Build exports/level2-3d-image-pilot-30-vps-upload-manifest.csv (local only).
 * Does not upload or touch the database.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DIR = path.join(ROOT, "server/storage/vocab-media/pilot/batch-d2");
const MAP = path.join(ROOT, "exports/level2-3d-image-pilot-30-mapping.csv");
const OUT = path.join(ROOT, "exports/level2-3d-image-pilot-30-vps-upload-manifest.csv");

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
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

function jpegSize(buf) {
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i < buf.length - 8) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    if (marker === 0xd9 || marker === 0xda) break;
    const len = (buf[i + 2] << 8) | buf[i + 3];
    if (len < 2) return null;
    const isSof =
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf);
    if (isSof) {
      return {
        height: (buf[i + 5] << 8) | buf[i + 6],
        width: (buf[i + 7] << 8) | buf[i + 8],
      };
    }
    i += 2 + len;
  }
  return null;
}

function esc(v) {
  const s = String(v ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const map = parseCsv(fs.readFileSync(MAP, "utf8"));
const rows = [];
for (const r of map) {
  const fp = path.join(DIR, r.newFilename);
  const buf = fs.readFileSync(fp);
  const size = jpegSize(buf);
  if (!size || size.width !== 1024 || size.height !== 1024) {
    throw new Error(`bad dims ${r.newFilename} ${JSON.stringify(size)}`);
  }
  const sha = createHash("sha256").update(buf).digest("hex");
  rows.push({
    wordId: r.wordId,
    word: r.word,
    filename: r.newFilename,
    localRelativePath: `server/storage/vocab-media/pilot/batch-d2/${r.newFilename}`,
    localFileSizeBytes: buf.length,
    width: size.width,
    height: size.height,
    sha256: sha,
    expectedPublicUrl: `https://api.siwiapp.shop/media/vocab/pilot/batch-d2/${r.newFilename}`,
    vpsAbsolutePath: `/var/www/siwi/server/storage/vocab-media/pilot/batch-d2/${r.newFilename}`,
  });
}

const header = Object.keys(rows[0]);
fs.writeFileSync(
  OUT,
  [header.join(","), ...rows.map((r) => header.map((h) => esc(r[h])).join(","))].join("\n") +
    "\n"
);
console.log(JSON.stringify({ out: OUT, count: rows.length, sample: rows[0] }, null, 2));
