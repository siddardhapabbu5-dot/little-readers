/**
 * Import every A–Z topic tab from the workbook into Grade 1 categories.
 *
 *   node scripts/import-all-az-topics.mjs [path-to-xlsx]
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { PrismaClient } from "@prisma/client";
import XLSX from "xlsx";

const prisma = new PrismaClient();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const xlsxPath =
  process.argv[2] ||
  "C:/Users/harsh/Downloads/A_to_Z_Alphabet_with_Symbols.xlsx";

/** sheet name pattern → category label + emoji + code */
const SHEET_MAP = [
  {
    match: /alphabet/i,
    label: "ABC Learning",
    code: "ABC_LEARNING",
    emoji: "🔤",
  },
  { match: /fruit/i, label: "Fruits", code: "FRUITS", emoji: "🍎" },
  { match: /colour|color/i, label: "Colours", code: "COLOURS", emoji: "🎨" },
  { match: /shape/i, label: "Shapes", code: "SHAPES", emoji: "🔺" },
  { match: /number/i, label: "Numbers", code: "NUMBERS", emoji: "🔢" },
  { match: /animal/i, label: "Animals", code: "ANIMALS", emoji: "🦁" },
  { match: /bird/i, label: "Birds", code: "BIRDS", emoji: "🐦" },
  { match: /body/i, label: "Body Parts", code: "BODY_PARTS", emoji: "💪" },
  {
    match: /vegetable/i,
    label: "Vegetables",
    code: "VEGETABLES",
    emoji: "🥕",
  },
  {
    match: /household|object/i,
    label: "Household Objects",
    code: "HOUSEHOLD_OBJECTS",
    emoji: "🏠",
  },
  {
    match: /action/i,
    label: "Action Words",
    code: "ACTION_WORDS",
    emoji: "🏃",
  },
  {
    match: /food|drink/i,
    label: "Food and Drinks",
    code: "FOOD_AND_DRINKS",
    emoji: "🍽️",
  },
  { match: /cloth/i, label: "Clothes", code: "CLOTHES", emoji: "👕" },
  { match: /feeling/i, label: "Feelings", code: "FEELINGS", emoji: "😊" },
  {
    match: /conversation|daily/i,
    label: "Daily Conversations",
    code: "DAILY_CONVERSATIONS",
    emoji: "💬",
  },
];

const WORD_HEADERS = [
  "word",
  "colour word",
  "color word",
  "shape name",
  "animal name",
  "bird name",
  "body part name",
  "vegetable name",
  "object name",
  "action word",
  "food and drinks name",
  "food name",
  "clothes name",
  "feelings name",
  "feeling name",
  "daily conversation",
  "number word",
];

function norm(h) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function sanitizeWord(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .slice(0, 80);
}

function findWordCol(header) {
  const h = header.map(norm);
  for (const name of WORD_HEADERS) {
    const i = h.indexOf(name);
    if (i >= 0) return i;
  }
  return h.findIndex(
    (c) =>
      (c.endsWith("name") || c.endsWith("word") || c === "daily conversation") &&
      !c.includes("letter") &&
      c !== "number"
  );
}

function isTopicSheet(name) {
  return /topics|how\s*to|notes|readme/i.test(name);
}

function mapSheet(sheetName) {
  const n = sheetName.trim();
  for (const m of SHEET_MAP) {
    if (m.match.test(n)) return m;
  }
  return null;
}

function isBrokenSymbol(text) {
  if (!text) return true;
  for (const ch of text) {
    const cp = ch.codePointAt(0);
    if (cp === 0xfe0f || cp === 0x200d) continue;
    if (cp >= 0xe000 && cp <= 0xfaff) return true;
  }
  return false;
}

async function ensureGroup() {
  const grade = await prisma.learningGrade.findFirst({
    where: { code: "GRADE_1" },
  });
  if (!grade) throw new Error("GRADE_1 missing — run db:seed");

  let level = await prisma.learningLevel.findFirst({
    where: { code: "LEVEL_1", gradeId: grade.id },
  });
  if (!level) {
    level = await prisma.learningLevel.findFirst({ where: { code: "LEVEL_1" } });
  }
  if (!level) throw new Error("LEVEL_1 missing — run db:seed");

  let group = await prisma.learningGroup.findFirst({
    where: { levelId: level.id, code: "A" },
  });
  if (!group) {
    group = await prisma.learningGroup.create({
      data: {
        levelId: level.id,
        code: "A",
        label: "Group A",
        sortOrder: 1,
      },
    });
  }
  return { grade, level, group };
}

async function ensureCategory(groupId, meta, unlockOrder) {
  const existing = await prisma.learningCategory.findFirst({
    where: {
      groupId,
      OR: [
        { code: meta.code },
        { label: { equals: meta.label, mode: "insensitive" } },
      ],
    },
  });
  if (existing) {
    return prisma.learningCategory.update({
      where: { id: existing.id },
      data: {
        label: meta.label,
        code: meta.code,
        emoji: meta.emoji,
        isPublished: true,
        unlockOrder,
      },
    });
  }
  return prisma.learningCategory.create({
    data: {
      groupId,
      code: meta.code,
      label: meta.label,
      emoji: meta.emoji,
      description: `${meta.label} words for little readers`,
      sortOrder: unlockOrder,
      unlockOrder,
      isPublished: true,
    },
  });
}

async function importSheetRows(category, sheet) {
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });
  if (!rows.length) return { created: 0, updated: 0, failed: 0 };

  const header = rows[0].map(norm);
  const col = (name) => header.indexOf(name);
  const iCap =
    col("capital letter") >= 0
      ? col("capital letter")
      : col("capital") >= 0
        ? col("capital")
        : col("number");
  const iSmall = col("small letter") >= 0 ? col("small letter") : col("small");
  const iSymbol = col("symbol") >= 0 ? col("symbol") : col("emoji");
  const iWord = findWordCol(header);
  const iExample =
    col("example sentence") >= 0 ? col("example sentence") : col("example");

  if (iWord < 0) {
    console.warn("  skip — no word column", header);
    return { created: 0, updated: 0, failed: 0 };
  }

  let created = 0;
  let updated = 0;
  let failed = 0;

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r].map((c) => String(c ?? "").trim());
    const capital = iCap >= 0 ? cols[iCap] : "";
    const small = iSmall >= 0 ? cols[iSmall] : "";
    const symbol = iSymbol >= 0 ? cols[iSymbol] : "";
    const wordRaw = cols[iWord] ?? "";
    const example = iExample >= 0 ? cols[iExample] : "";
    const word = sanitizeWord(wordRaw);
    if (!word) {
      failed += 1;
      continue;
    }
    const meaning =
      example ||
      (capital ? `${capital} is for ${wordRaw}.` : `Learn the word ${wordRaw}.`);
    const emoji =
      symbol && !isBrokenSymbol(symbol) ? symbol : category.emoji || "🔤";
    const phonetic =
      capital && small ? `${capital} / ${small}` : capital || small || null;
    const sortOrder = /^[A-Za-z]$/.test(capital)
      ? capital.toUpperCase().charCodeAt(0) - 64
      : Number(capital) > 0
        ? Number(capital)
        : r;

    const existing = await prisma.vocabularyWord.findUnique({
      where: { categoryId_text: { categoryId: category.id, text: word } },
    });
    if (existing) {
      await prisma.vocabularyWord.update({
        where: { id: existing.id },
        data: {
          meaning: meaning.slice(0, 500),
          emoji,
          phonetic,
          sortOrder,
          isActive: true,
          firstLetter: word.charAt(0).toUpperCase(),
          origin: "CATEGORY_IMPORT",
        },
      });
      updated += 1;
    } else {
      await prisma.vocabularyWord.create({
        data: {
          categoryId: category.id,
          text: word,
          meaning: meaning.slice(0, 500),
          emoji,
          phonetic,
          difficulty: 1,
          sortOrder,
          isActive: true,
          firstLetter: word.charAt(0).toUpperCase(),
          origin: "CATEGORY_IMPORT",
        },
      });
      created += 1;
    }
  }
  return { created, updated, failed };
}

async function main() {
  if (!fs.existsSync(xlsxPath)) {
    console.error("File not found:", xlsxPath);
    process.exit(1);
  }
  console.log("Reading", xlsxPath);
  const wb = XLSX.read(fs.readFileSync(xlsxPath), { type: "buffer" });
  const { group } = await ensureGroup();

  // Copy into project templates for future uploads
  const dest = path.join(root, "docs/templates/A_to_Z_Alphabet_with_Symbols.xlsx");
  fs.copyFileSync(xlsxPath, dest);
  console.log("Copied template →", dest);

  let unlock = 0;
  const summary = [];

  for (const sheetName of wb.SheetNames) {
    if (isTopicSheet(sheetName)) {
      console.log("skip", sheetName);
      continue;
    }
    const meta = mapSheet(sheetName);
    if (!meta) {
      console.log("unmapped sheet", JSON.stringify(sheetName));
      continue;
    }
    const category = await ensureCategory(group.id, meta, unlock);
    unlock += 1;
    const result = await importSheetRows(category, wb.Sheets[sheetName]);
    const count = await prisma.vocabularyWord.count({
      where: { categoryId: category.id, isActive: true },
    });
    summary.push({
      sheet: sheetName.trim(),
      category: meta.label,
      ...result,
      activeWords: count,
    });
    console.log(
      `${meta.emoji} ${meta.label}: +${result.created} ~${result.updated} (active ${count})`
    );
  }

  console.log("\nDone:");
  console.table(summary);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
