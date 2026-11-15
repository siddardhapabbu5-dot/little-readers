/**
 * Build text+category keyed payload from local LEVEL_1 words + pilot map.
 * Output used by apply-g1-3d-cutover.mjs for production ID mismatch safety.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import { PrismaClient } from "@prisma/client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

for (const rel of [".env", "server/.env"]) {
  const envFile = path.join(ROOT, rel);
  if (!fs.existsSync(envFile)) continue;
  const parsed = parse(fs.readFileSync(envFile));
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] == null) process.env[k] = v;
  }
}

const mapPath = path.join(ROOT, "apps/mobile/data/pilot-batch-d1.json");
const map = JSON.parse(fs.readFileSync(mapPath, "utf8"));
const byWordId = map.byWordId || {};
const ids = Object.keys(byWordId);

const prisma = new PrismaClient();
const words = await prisma.vocabularyWord.findMany({
  where: { id: { in: ids } },
  select: {
    id: true,
    text: true,
    category: { select: { label: true, group: { select: { level: { select: { code: true } } } } } },
  },
});

const items = [];
for (const w of words) {
  if (w.category?.group?.level?.code !== "LEVEL_1") continue;
  items.push({
    stagingId: w.id,
    text: w.text,
    category: w.category.label,
    relPath: byWordId[w.id],
  });
}

const out = path.join(ROOT, "docs/documentation/siwi-3d-visual-upgrade/grade1/g1-3d-cutover-payload.json");
fs.writeFileSync(
  out,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      count: items.length,
      matchBy: ["LEVEL_1", "category.label", "text"],
      items,
    },
    null,
    2
  )
);
console.log(JSON.stringify({ out, count: items.length }, null, 2));
await prisma.$disconnect();
