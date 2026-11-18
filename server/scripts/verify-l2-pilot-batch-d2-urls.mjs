/**
 * Verify public HTTPS URLs for Level-2 pilot batch-d2 images.
 *
 *   node server/scripts/verify-l2-pilot-batch-d2-urls.mjs
 *
 * Writes: exports/level2-3d-image-pilot-30-url-verification.csv
 * Does NOT update the database.
 */
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const MANIFEST = path.join(ROOT, "exports/level2-3d-image-pilot-30-vps-upload-manifest.csv");
const OUT = path.join(ROOT, "exports/level2-3d-image-pilot-30-url-verification.csv");

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

function csvEscape(v) {
  const s = v == null ? "" : String(v);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function isJpeg(buf) {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[buf.length - 2] === 0xff && buf[buf.length - 1] === 0xd9
    ? true
    : buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8;
}

async function main() {
  if (!fs.existsSync(MANIFEST)) throw new Error(`Missing ${MANIFEST}`);
  const rows = parseCsv(fs.readFileSync(MANIFEST, "utf8"));
  if (rows.length !== 30) throw new Error(`Expected 30 rows, got ${rows.length}`);

  const results = [];
  for (const row of rows) {
    const url = row.expectedPublicUrl;
    let httpStatus = "";
    let contentType = "";
    let ok = false;
    let error = "";
    let remoteSha256 = "";
    let checksumMatch = "NO";
    let isValidJpg = "NO";
    let looksLikeHtml = "NO";
    try {
      const res = await fetch(url, { method: "GET", redirect: "follow" });
      httpStatus = String(res.status);
      contentType = res.headers.get("content-type") || "";
      const buf = Buffer.from(await res.arrayBuffer());
      const head = buf.subarray(0, 64).toString("utf8").toLowerCase();
      if (head.includes("<!doctype") || head.includes("<html")) looksLikeHtml = "YES";
      if (isJpeg(buf)) isValidJpg = "YES";
      remoteSha256 = createHash("sha256").update(buf).digest("hex");
      if (remoteSha256 === row.sha256.toLowerCase()) checksumMatch = "YES";
      ok =
        res.ok &&
        /image\/jpeg/i.test(contentType) &&
        looksLikeHtml === "NO" &&
        isValidJpg === "YES" &&
        checksumMatch === "YES";
      if (!ok && !error) {
        error = [
          !res.ok ? `http_${res.status}` : null,
          !/image\/jpeg/i.test(contentType) ? `ctype_${contentType}` : null,
          looksLikeHtml === "YES" ? "html_body" : null,
          isValidJpg === "NO" ? "not_jpeg" : null,
          checksumMatch === "NO" ? "checksum_mismatch" : null,
        ]
          .filter(Boolean)
          .join("|");
      }
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    results.push({
      wordId: row.wordId,
      filename: row.filename,
      url,
      httpStatus,
      contentType,
      isValidJpg,
      looksLikeHtml,
      checksumMatch,
      remoteSha256,
      expectedSha256: row.sha256,
      pass: ok ? "PASS" : "FAIL",
      error,
    });
  }

  const header = [
    "wordId",
    "filename",
    "url",
    "httpStatus",
    "contentType",
    "isValidJpg",
    "looksLikeHtml",
    "checksumMatch",
    "remoteSha256",
    "expectedSha256",
    "pass",
    "error",
  ];
  const lines = [
    header.join(","),
    ...results.map((r) => header.map((h) => csvEscape(r[h])).join(",")),
  ];
  fs.writeFileSync(OUT, lines.join("\n") + "\n", "utf8");

  const passCount = results.filter((r) => r.pass === "PASS").length;
  console.log(
    JSON.stringify(
      {
        out: OUT,
        total: results.length,
        pass: passCount,
        fail: results.length - passCount,
        sampleFails: results.filter((r) => r.pass !== "PASS").slice(0, 5),
      },
      null,
      2
    )
  );
  process.exit(passCount === 30 ? 0 : 2);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
