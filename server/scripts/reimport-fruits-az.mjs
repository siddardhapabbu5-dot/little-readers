/**
 * Fix Fruits category: remove non-fruit alphabet imports, load A-Z Fruits sheet.
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
  path.join(root, "docs/templates/A_to_Z_Alphabet_with_Symbols.xlsx");

const FRUIT_WORDS = new Set(
  [
    "apple",
    "banana",
    "cherry",
    "dragon fruit",
    "eggplant",
    "fig",
    "grapes",
    "honeydew",
    "ice apple",
    "jackfruit",
    "kiwi",
    "lemon",
    "mango",
    "navel orange",
    "olive",
    "pineapple",
    "quince",
    "raspberry",
    "strawberry",
    "tamarillo",
    "ugli fruit",
    "velvet apple",
    "watermelon",
    "xigua",
    "yellow pear",
    "ziziphus (jujube)",
    "ziziphus",
    "jujube",
    "orange",
  ].map((w) => w.toLowerCase())
);

function sanitizeWord(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function resolveEmoji(symbol, word) {
  const s = String(symbol || "").trim();
  if (s && s !== "?" && ![...s].some((ch) => {
    const cp = ch.codePointAt(0);
    return cp >= 0xe000 && cp <= 0xfaff;
  })) {
    return s;
  }
  const map = {
    apple: "🍎",
    banana: "🍌",
    cherry: "🍒",
    "dragon fruit": "🐉",
    eggplant: "🍆",
    fig: "🍈",
    grapes: "🍇",
    honeydew: "🍈",
    "ice apple": "🥥",
    jackfruit: "🌳",
    kiwi: "🥝",
    lemon: "🍋",
    mango: "🥭",
    "navel orange": "🍊",
    olive: "🫒",
    pineapple: "🍍",
    quince: "🍐",
    raspberry: "🫐",
    strawberry: "🍓",
    tamarillo: "🍅",
    "ugli fruit": "🍊",
    "velvet apple": "🍎",
    watermelon: "🍉",
    xigua: "🍉",
    "yellow pear": "🍐",
    "ziziphus (jujube)": "🍊",
  };
  return map[word] || "🍇";
}

async function main() {
  const fruits = await prisma.learningCategory.findFirst({
    where: {
      OR: [
        { label: { equals: "Fruits", mode: "insensitive" } },
        { code: { equals: "FRUITS", mode: "insensitive" } },
      ],
    },
  });
  if (!fruits) {
    console.error("Fruits category not found");
    process.exit(1);
  }

  // Remove alphabet leftovers wrongly imported into Fruits
  const existing = await prisma.vocabularyWord.findMany({
    where: { categoryId: fruits.id },
    select: { id: true, text: true, origin: true },
  });
  let removed = 0;
  for (const w of existing) {
    const key = sanitizeWord(w.text);
    if (!FRUIT_WORDS.has(key) && w.origin === "CATEGORY_IMPORT") {
      try {
        await prisma.vocabularyWord.delete({ where: { id: w.id } });
        removed += 1;
        console.log("removed non-fruit", w.text);
      } catch (e) {
        await prisma.vocabularyWord.update({
          where: { id: w.id },
          data: { isActive: false },
        });
        console.log("deactivated non-fruit", w.text, e.message);
      }
    }
  }

  if (!fs.existsSync(xlsxPath)) {
    console.error("Missing xlsx", xlsxPath);
    process.exit(1);
  }
  const wb = XLSX.read(fs.readFileSync(xlsxPath), { type: "buffer" });
  const sheetName =
    wb.SheetNames.find((n) => /fruit/i.test(n)) ||
    wb.SheetNames.find((n) => !/how\s*to/i.test(n));
  console.log("using sheet", sheetName);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: "" });

  let created = 0;
  let updated = 0;
  for (const [i, row] of rows.entries()) {
    const capital = String(row["Capital Letter"] ?? "").trim();
    const small = String(row["Small Letter"] ?? "").trim();
    const symbol = String(row.Symbol ?? "").trim();
    const wordRaw = String(row.Word ?? "").trim();
    const example = String(row["Example Sentence"] ?? "").trim();
    const word = sanitizeWord(wordRaw);
    if (!word) continue;
    const meaning =
      example || (capital ? `${capital} is for ${wordRaw}.` : `A fruit: ${wordRaw}`);
    const emoji = resolveEmoji(symbol, word);
    const phonetic =
      capital && small ? `${capital} / ${small}` : capital || small || null;
    const sortOrder = capital
      ? capital.toUpperCase().charCodeAt(0) - 64
      : i + 1;

    const found = await prisma.vocabularyWord.findUnique({
      where: { categoryId_text: { categoryId: fruits.id, text: word } },
    });
    if (found) {
      await prisma.vocabularyWord.update({
        where: { id: found.id },
        data: {
          meaning,
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
          categoryId: fruits.id,
          text: word,
          meaning,
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

  // Ensure visible to kids
  await prisma.learningCategory.update({
    where: { id: fruits.id },
    data: { isPublished: true },
  });

  const count = await prisma.vocabularyWord.count({
    where: { categoryId: fruits.id, isActive: true },
  });
  const sample = await prisma.vocabularyWord.findMany({
    where: { categoryId: fruits.id, isActive: true },
    orderBy: { sortOrder: "asc" },
    take: 6,
    select: { text: true, emoji: true, meaning: true },
  });
  console.log({ removed, created, updated, activeWords: count, sample });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
