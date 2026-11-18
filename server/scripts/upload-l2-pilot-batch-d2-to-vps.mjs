/**
 * Upload Level-2 pilot batch-d2 JPGs to the production VPS media folder.
 *
 * DOES NOT update the database. DOES NOT touch batch-d1 / Level-1.
 *
 * Prep only until you pass --execute:
 *   node server/scripts/upload-l2-pilot-batch-d2-to-vps.mjs
 *   node server/scripts/upload-l2-pilot-batch-d2-to-vps.mjs --execute
 *
 * Requires existing project SSH access:
 *   Host: 201.18.220.29 (siwi VPS)
 *   Key:  %USERPROFILE%\.ssh\siwi_vps
 *   User: root
 *
 * VPS destination verified against Express static mount:
 *   server/src/app.ts → /media/vocab → server/storage/vocab-media
 *   → /var/www/siwi/server/storage/vocab-media/pilot/batch-d2/
 */
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const LOCAL_DIR = path.join(ROOT, "server/storage/vocab-media/pilot/batch-d2");
const MANIFEST = path.join(ROOT, "exports/level2-3d-image-pilot-30-vps-upload-manifest.csv");
const VPS_HOST = "201.18.220.29";
const VPS_USER = "root";
const VPS_KEY = path.join(os.homedir(), ".ssh", "siwi_vps");
const VPS_DIR = "/var/www/siwi/server/storage/vocab-media/pilot/batch-d2";

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

function sha256File(fp) {
  const h = createHash("sha256");
  h.update(fs.readFileSync(fp));
  return h.digest("hex");
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    shell: false,
    ...opts,
  });
  if (r.status !== 0) {
    throw new Error(
      `${cmd} ${args.join(" ")} failed (${r.status}): ${r.stderr || r.stdout || ""}`
    );
  }
  return r.stdout;
}

function ssh(remoteCmd) {
  return run("ssh", [
    "-i",
    VPS_KEY,
    "-o",
    "BatchMode=yes",
    "-o",
    "ConnectTimeout=20",
    `${VPS_USER}@${VPS_HOST}`,
    remoteCmd,
  ]);
}

function main() {
  const execute = process.argv.includes("--execute");
  if (!fs.existsSync(VPS_KEY)) {
    throw new Error(`SSH key not found: ${VPS_KEY}`);
  }
  if (!fs.existsSync(MANIFEST)) {
    throw new Error(`Manifest missing: ${MANIFEST}`);
  }
  const rows = parseCsv(fs.readFileSync(MANIFEST, "utf8"));
  if (rows.length !== 30) throw new Error(`Expected 30 manifest rows, got ${rows.length}`);

  const plan = [];
  for (const row of rows) {
    const fp = path.join(LOCAL_DIR, row.filename);
    if (!fs.existsSync(fp)) throw new Error(`Missing local file: ${fp}`);
    const hash = sha256File(fp);
    if (hash !== row.sha256.toLowerCase()) {
      throw new Error(`Checksum drift for ${row.filename}: local=${hash} manifest=${row.sha256}`);
    }
    plan.push({
      filename: row.filename,
      localPath: fp,
      remotePath: `${VPS_DIR}/${row.filename}`,
      sha256: hash,
      expectedPublicUrl: row.expectedPublicUrl,
      bytes: fs.statSync(fp).size,
    });
  }

  const summary = {
    execute,
    host: VPS_HOST,
    localDir: LOCAL_DIR,
    remoteDir: VPS_DIR,
    count: plan.length,
    sample: plan.slice(0, 3).map((p) => p.filename),
    note: execute
      ? "Will upload 30 JPGs only (mkdir batch-d2 if needed)."
      : "Dry plan only. Re-run with --execute after approval.",
  };
  console.log(JSON.stringify(summary, null, 2));

  if (!execute) {
    console.log("STOP: upload not performed (no --execute).");
    return;
  }

  // Create destination; never delete existing media.
  ssh(`mkdir -p '${VPS_DIR}' && test -d '${VPS_DIR}'`);

  // Refuse if unexpected non-jpg clutter that would confuse verification (informational).
  const remoteListing = ssh(`ls -1 '${VPS_DIR}' 2>/dev/null || true`);
  const remoteFiles = remoteListing
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean)
    .filter((n) => n !== ".gitkeep");

  for (const p of plan) {
    if (remoteFiles.includes(p.filename)) {
      console.log(`overwrite_existing:${p.filename}`);
    }
    run("scp", [
      "-i",
      VPS_KEY,
      "-o",
      "BatchMode=yes",
      "-o",
      "ConnectTimeout=20",
      p.localPath,
      `${VPS_USER}@${VPS_HOST}:${p.remotePath}`,
    ]);
  }

  // Remote checksum verify (sha256sum)
  const remoteCheck = ssh(
    `cd '${VPS_DIR}' && sha256sum ${plan.map((p) => `'${p.filename}'`).join(" ")}`
  );
  const remoteMap = new Map();
  for (const line of remoteCheck.split(/\r?\n/).filter(Boolean)) {
    const m = line.match(/^([a-f0-9]{64})\s+\*?(.*)$/i);
    if (!m) continue;
    remoteMap.set(path.basename(m[2].trim()), m[1].toLowerCase());
  }

  const mismatches = [];
  for (const p of plan) {
    const rh = remoteMap.get(p.filename);
    if (!rh || rh !== p.sha256) mismatches.push({ filename: p.filename, expected: p.sha256, remote: rh || null });
  }

  // Permissions aligned with existing media tree (readable by nginx/node)
  ssh(`chmod -R a+rX '${VPS_DIR}'`);

  console.log(
    JSON.stringify(
      {
        ok: mismatches.length === 0,
        uploaded: plan.length,
        checksumMismatches: mismatches,
        remoteDir: VPS_DIR,
      },
      null,
      2
    )
  );
  if (mismatches.length) process.exit(1);
}

main();
