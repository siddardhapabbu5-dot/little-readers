import type { VocabWordOrigin } from "@prisma/client";
import * as XLSX from "xlsx";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { clearAllVocabularyWords } from "../../prisma/seeds/level1-vocabulary.js";
import { resolveAlphabetEmoji } from "./alphabet-emoji.js";
import { sanitizeText, sanitizeWord } from "./file-security.js";

export type WordListFilters = {
  q?: string;
  gradeId?: string;
  levelId?: string;
  groupId?: string;
  categoryId?: string;
  isActive?: boolean;
  origin?: VocabWordOrigin;
  /** Filter words linked to an assignment with this review/publication status */
  assignmentStatus?: "PENDING" | "APPROVED" | "REJECTED" | "PUBLISHED";
  take?: number;
  skip?: number;
};

function categoryWhere(filters: WordListFilters) {
  return {
    ...(filters.categoryId ? { id: filters.categoryId } : {}),
    ...(filters.groupId ? { groupId: filters.groupId } : {}),
    ...(filters.levelId || filters.gradeId
      ? {
          group: {
            ...(filters.groupId ? {} : {}),
            ...(filters.levelId ? { levelId: filters.levelId } : {}),
            ...(filters.gradeId
              ? { level: { gradeId: filters.gradeId } }
              : {}),
          },
        }
      : {}),
  };
}

export async function searchAdminWords(filters: WordListFilters) {
  const take = Math.min(filters.take ?? 100, 500);
  const skip = Math.max(filters.skip ?? 0, 0);
  const q = filters.q?.trim();

  const and: object[] = [{ category: categoryWhere(filters) }];
  if (filters.isActive !== undefined) and.push({ isActive: filters.isActive });
  if (filters.origin) and.push({ origin: filters.origin });
  if (filters.assignmentStatus) {
    and.push({
      OR: [
        {
          publishedFrom: {
            some: { status: filters.assignmentStatus },
          },
        },
        {
          dictionarySense: {
            assignments: {
              some: { status: filters.assignmentStatus },
            },
          },
        },
      ],
    });
  }
  if (q) {
    and.push({
      OR: [
        { text: { contains: q, mode: "insensitive" as const } },
        { meaning: { contains: q, mode: "insensitive" as const } },
      ],
    });
  }
  const where = { AND: and };

  const [total, rows] = await Promise.all([
    prisma.vocabularyWord.count({ where }),
    prisma.vocabularyWord.findMany({
      where,
      orderBy: [{ categoryId: "asc" }, { sortOrder: "asc" }, { text: "asc" }],
      take,
      skip,
      include: {
        category: {
          include: {
            group: {
              include: {
                level: {
                  include: {
                    grade: { select: { id: true, code: true, label: true } },
                  },
                },
              },
            },
          },
        },
        dictionarySense: {
          include: {
            entry: {
              select: {
                id: true,
                headword: true,
                pronunciation: true,
                sourceName: true,
                licence: true,
              },
            },
          },
        },
        _count: { select: { attempts: true, publishedFrom: true } },
      },
    }),
  ]);

  return { total, take, skip, words: rows };
}

export async function getAdminWord(id: string) {
  const word = await prisma.vocabularyWord.findUnique({
    where: { id },
    include: {
      category: {
        include: {
          group: {
            include: {
              level: {
                include: { grade: true },
              },
            },
          },
        },
      },
      dictionarySense: {
        include: {
          entry: true,
          assignments: {
            include: {
              grade: true,
              level: { select: { id: true, code: true, label: true } },
              category: { select: { id: true, code: true, label: true } },
            },
            orderBy: { createdAt: "desc" },
          },
        },
      },
      publishedFrom: {
        include: {
          grade: true,
          level: { select: { id: true, code: true, label: true } },
        },
      },
      _count: { select: { attempts: true } },
    },
  });
  if (!word) throw new AppError("Word not found", 404);
  return word;
}

export async function createAdminWord(input: {
  categoryId: string;
  text: string;
  meaning: string;
  emoji?: string;
  phonetic?: string;
  imageUrl?: string;
  audioUrl?: string;
  difficulty?: number;
  sortOrder?: number;
  isActive?: boolean;
}) {
  const category = await prisma.learningCategory.findUnique({
    where: { id: input.categoryId },
  });
  if (!category) throw new AppError("categoryId not found", 400);

  const text = sanitizeWord(input.text);
  const meaning = sanitizeText(input.meaning, 500);
  if (!text) throw new AppError("text is required", 400);
  if (!meaning) throw new AppError("meaning is required (not invented)", 400);

  const clash = await prisma.vocabularyWord.findUnique({
    where: { categoryId_text: { categoryId: input.categoryId, text } },
  });
  if (clash) {
    throw new AppError("Word already exists in this category", 409);
  }

  return prisma.vocabularyWord.create({
    data: {
      categoryId: input.categoryId,
      text,
      meaning,
      emoji: input.emoji?.trim() || "📝",
      phonetic: input.phonetic ? sanitizeText(input.phonetic, 120) : null,
      imageUrl: input.imageUrl ? sanitizeText(input.imageUrl, 500) : null,
      audioUrl: input.audioUrl ? sanitizeText(input.audioUrl, 500) : null,
      firstLetter: text.charAt(0).toUpperCase(),
      difficulty: Math.min(5, Math.max(1, input.difficulty ?? 1)),
      sortOrder: input.sortOrder ?? 0,
      isActive: input.isActive ?? true,
      origin: "LEGACY",
    },
  });
}

export async function updateAdminWord(
  id: string,
  patch: {
    text?: string;
    meaning?: string;
    emoji?: string;
    phonetic?: string | null;
    imageUrl?: string | null;
    audioUrl?: string | null;
    difficulty?: number;
    sortOrder?: number;
    isActive?: boolean;
  }
) {
  const existing = await prisma.vocabularyWord.findUnique({ where: { id } });
  if (!existing) throw new AppError("Word not found", 404);

  let text = existing.text;
  if (patch.text !== undefined) {
    text = sanitizeWord(patch.text);
    if (!text) throw new AppError("text is required", 400);
    if (text !== existing.text) {
      const clash = await prisma.vocabularyWord.findUnique({
        where: {
          categoryId_text: { categoryId: existing.categoryId, text },
        },
      });
      if (clash) throw new AppError("Word already exists in this category", 409);
    }
  }

  let meaning = existing.meaning;
  if (patch.meaning !== undefined) {
    meaning = sanitizeText(patch.meaning, 500);
    if (!meaning) throw new AppError("meaning is required (not invented)", 400);
  }

  // Also sync dictionary sense definition when linked and meaning changes
  return prisma.$transaction(async (tx) => {
    const word = await tx.vocabularyWord.update({
      where: { id },
      data: {
        text,
        meaning,
        firstLetter: text.charAt(0).toUpperCase(),
        ...(patch.emoji !== undefined ? { emoji: patch.emoji.trim() || "📝" } : {}),
        ...(patch.phonetic !== undefined
          ? { phonetic: patch.phonetic ? sanitizeText(patch.phonetic, 120) : null }
          : {}),
        ...(patch.imageUrl !== undefined
          ? { imageUrl: patch.imageUrl ? sanitizeText(patch.imageUrl, 500) : null }
          : {}),
        ...(patch.audioUrl !== undefined
          ? { audioUrl: patch.audioUrl ? sanitizeText(patch.audioUrl, 500) : null }
          : {}),
        ...(patch.difficulty !== undefined
          ? { difficulty: Math.min(5, Math.max(1, patch.difficulty)) }
          : {}),
        ...(patch.sortOrder !== undefined ? { sortOrder: patch.sortOrder } : {}),
        ...(patch.isActive !== undefined ? { isActive: patch.isActive } : {}),
      },
    });

    if (existing.dictionarySenseId && patch.meaning !== undefined) {
      await tx.dictionarySense.update({
        where: { id: existing.dictionarySenseId },
        data: { definition: meaning },
      });
    }

    return word;
  });
}

/** Admin wipe of published kids vocabulary (not dictionary entries). */
export async function clearAllAdminVocabularyWords() {
  return clearAllVocabularyWords(prisma);
}

export async function deactivateAdminWord(id: string) {
  return updateAdminWord(id, { isActive: false });
}

function csvEscape(value: string | number | boolean | null | undefined) {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

/** Export active/all words as grade·level·category spreadsheet (CSV). */
function displayEmojiForExport(word: string, emoji: string | null | undefined) {
  return resolveAlphabetEmoji({
    symbol: emoji,
    word,
    capitalLetter: word.charAt(0),
    fallback: "🔤",
  });
}

function looksLikeAlphabetCategory(
  label: string,
  rows: Array<{ text: string; firstLetter: string | null }>
) {
  if (/abc|alphabet|a\s*[-_]?\s*z/i.test(label)) return true;
  if (rows.length < 20 || rows.length > 30) return false;
  const letters = new Set(
    rows
      .map((r) => (r.firstLetter || r.text.charAt(0) || "").toUpperCase())
      .filter((c) => /^[A-Z]$/.test(c))
  );
  return letters.size >= 20;
}

/** UTF-8 BOM so Excel keeps emoji visible (🍎 not □ / mojibake). */
function withUtf8Bom(csvBody: string) {
  return `\uFEFF${csvBody}`;
}

export async function exportAdminWordsCsv(
  filters: WordListFilters & { format?: "grade_level" | "alphabet" | "auto" }
) {
  const where = {
    AND: [
      { category: categoryWhere(filters) },
      ...(filters.isActive !== undefined ? [{ isActive: filters.isActive }] : []),
      ...(filters.origin ? [{ origin: filters.origin }] : []),
    ],
  };
  const rows = await prisma.vocabularyWord.findMany({
    where,
    orderBy: [
      { category: { group: { level: { grade: { sortOrder: "asc" } } } } },
      { category: { group: { level: { sortOrder: "asc" } } } },
      { category: { sortOrder: "asc" } },
      { sortOrder: "asc" },
      { text: "asc" },
    ],
    include: {
      category: {
        include: {
          group: {
            include: {
              level: {
                include: { grade: { select: { code: true, label: true } } },
              },
            },
          },
        },
      },
    },
    take: 5000,
  });

  const categoryLabel = rows[0]?.category.label ?? "";
  const wantAlphabet =
    filters.format === "alphabet" ||
    (filters.format !== "grade_level" &&
      Boolean(filters.categoryId) &&
      looksLikeAlphabetCategory(categoryLabel, rows));

  if (wantAlphabet) {
    const header = [
      "Capital Letter",
      "Small Letter",
      "Symbol",
      "Word",
      "Example Sentence",
    ];
    const lines = [header.join(",")];
    for (const w of rows) {
      const capital = (w.firstLetter || w.text.charAt(0) || "").toUpperCase();
      const small = capital.toLowerCase();
      const symbol = displayEmojiForExport(w.text, w.emoji);
      const wordTitle =
        w.text.charAt(0).toUpperCase() + w.text.slice(1).toLowerCase();
      lines.push(
        [
          csvEscape(capital),
          csvEscape(small),
          csvEscape(symbol),
          csvEscape(wordTitle),
          csvEscape(w.meaning || `${capital} is for ${wordTitle}.`),
        ].join(",")
      );
    }
    const safeName = (categoryLabel || "alphabet")
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return {
      csv: withUtf8Bom(`${lines.join("\n")}\n`),
      count: rows.length,
      format: "alphabet_az" as const,
      filename: `${safeName || "alphabet"}-A-to-Z.csv`,
    };
  }

  const header = [
    "grade_code",
    "grade_label",
    "level_code",
    "level_label",
    "group_code",
    "group_label",
    "category_code",
    "category_label",
    "word",
    "meaning",
    "emoji",
    "phonetic",
    "difficulty",
    "sort_order",
    "is_active",
    "origin",
  ];
  const lines = [header.join(",")];
  for (const w of rows) {
    const grade = w.category.group.level.grade;
    const emoji = displayEmojiForExport(w.text, w.emoji);
    lines.push(
      [
        csvEscape(grade?.code ?? ""),
        csvEscape(grade?.label ?? ""),
        csvEscape(w.category.group.level.code),
        csvEscape(w.category.group.level.label),
        csvEscape(w.category.group.code),
        csvEscape(w.category.group.label),
        csvEscape(w.category.code),
        csvEscape(w.category.label),
        csvEscape(w.text),
        csvEscape(w.meaning),
        csvEscape(emoji),
        csvEscape(w.phonetic),
        csvEscape(w.difficulty),
        csvEscape(w.sortOrder),
        csvEscape(w.isActive),
        csvEscape(w.origin),
      ].join(",")
    );
  }
  return {
    csv: withUtf8Bom(`${lines.join("\n")}\n`),
    count: rows.length,
    format: "grade_level" as const,
    filename: `learn-wise-words-${rows.length}.csv`,
  };
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i += 1;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

/**
 * Upsert words from grade/level/category spreadsheet.
 * Does not invent categories — rows must match existing structure codes/labels.
 */
export async function importGradeLevelWordsCsv(csvText: string) {
  const lines = csvText
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2) throw new AppError("CSV has no data rows", 400);

  const header = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const idx = (name: string) => header.indexOf(name);
  const required = ["grade_code", "level_code", "category_label", "word", "meaning"];
  for (const col of required) {
    if (idx(col) < 0 && !(col === "category_label" && idx("category_code") >= 0)) {
      if (col === "category_label" && idx("category_code") >= 0) continue;
      throw new AppError(`Missing required column: ${col}`, 400);
    }
  }

  const categories = await prisma.learningCategory.findMany({
    include: {
      group: {
        include: {
          level: { include: { grade: true } },
        },
      },
    },
  });

  let created = 0;
  let updated = 0;
  const errors: Array<{ row: number; error: string }> = [];

  for (let li = 1; li < lines.length; li++) {
    const cols = parseCsvLine(lines[li]);
    const get = (name: string) => {
      const i = idx(name);
      return i >= 0 ? (cols[i] ?? "").trim() : "";
    };
    const gradeCode = get("grade_code");
    const levelCode = get("level_code");
    const groupCode = get("group_code");
    const categoryCode = get("category_code");
    const categoryLabel = get("category_label");
    const word = sanitizeWord(get("word"));
    const meaning = sanitizeText(get("meaning"), 500);
    if (!word || !meaning) {
      errors.push({ row: li + 1, error: "word and meaning required" });
      continue;
    }

    const match = categories.find((c) => {
      const g = c.group.level.grade?.code;
      if (gradeCode && g !== gradeCode) return false;
      if (levelCode && c.group.level.code !== levelCode) return false;
      if (groupCode && c.group.code !== groupCode) return false;
      if (categoryCode && c.code === categoryCode) return true;
      if (categoryLabel && c.label.toLowerCase() === categoryLabel.toLowerCase()) {
        return true;
      }
      return false;
    });
    if (!match) {
      errors.push({
        row: li + 1,
        error: `No category for ${gradeCode}/${levelCode}/${categoryLabel || categoryCode}`,
      });
      continue;
    }

    const emoji = resolveAlphabetEmoji({
      symbol: get("emoji") || match.emoji,
      word,
      capitalLetter: word.charAt(0),
      fallback: match.emoji || "📚",
    });
    const phonetic = get("phonetic") || null;
    const difficulty = Math.min(5, Math.max(1, Number(get("difficulty") || 1) || 1));
    const sortOrder = Number(get("sort_order") || 0) || 0;
    const isActiveRaw = get("is_active").toLowerCase();
    const isActive =
      isActiveRaw === "" || isActiveRaw === "true" || isActiveRaw === "1";

    const existing = await prisma.vocabularyWord.findUnique({
      where: { categoryId_text: { categoryId: match.id, text: word } },
    });
    if (existing) {
      await prisma.vocabularyWord.update({
        where: { id: existing.id },
        data: {
          meaning,
          emoji,
          phonetic,
          difficulty,
          sortOrder,
          isActive,
          firstLetter: word.charAt(0).toUpperCase(),
        },
      });
      updated += 1;
    } else {
      await prisma.vocabularyWord.create({
        data: {
          categoryId: match.id,
          text: word,
          meaning,
          emoji,
          phonetic,
          difficulty,
          sortOrder,
          isActive,
          firstLetter: word.charAt(0).toUpperCase(),
          origin: "CATEGORY_IMPORT",
        },
      });
      created += 1;
    }
  }

  return {
    created,
    updated,
    failed: errors.length,
    errors: errors.slice(0, 40),
  };
}

function normHeader(h: string) {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

const AZ_WORD_HEADERS = [
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

function findAzWordCol(header: string[]) {
  const h = header.map(normHeader);
  for (const name of AZ_WORD_HEADERS) {
    const i = h.indexOf(name);
    if (i >= 0) return i;
  }
  // fallback: any column ending with "name" / "word" except letter columns
  return h.findIndex(
    (c) =>
      (c.endsWith("name") || c.endsWith("word") || c === "daily conversation") &&
      !c.includes("letter") &&
      c !== "number"
  );
}

function isAlphabetHeader(header: string[]) {
  const h = header.map(normHeader);
  const hasLetter =
    h.includes("capital letter") ||
    h.includes("capital") ||
    h.includes("number");
  const hasSymbol = h.includes("symbol") || h.includes("emoji");
  return hasLetter && hasSymbol && findAzWordCol(h) >= 0;
}

function isGradeLevelHeader(header: string[]) {
  const h = header.map(normHeader);
  return h.includes("grade_code") || h.includes("grade code");
}

/**
 * A–Z alphabet sheet (Capital Letter | Small Letter | Symbol | Word | Example Sentence)
 * into one existing category.
 */
export async function importAlphabetSheetRows(
  rows: string[][],
  categoryId: string
) {
  if (!categoryId) {
    throw new AppError(
      "Select a category before uploading an A–Z alphabet sheet",
      400
    );
  }
  const category = await prisma.learningCategory.findUnique({
    where: { id: categoryId },
  });
  if (!category) throw new AppError("Category not found", 404);
  if (rows.length < 2) throw new AppError("Sheet has no data rows", 400);

  const header = rows[0].map((c) => normHeader(String(c ?? "")));
  const col = (name: string) => header.indexOf(name);
  const iCap =
    col("capital letter") >= 0
      ? col("capital letter")
      : col("capital") >= 0
        ? col("capital")
        : col("number");
  const iSmall =
    col("small letter") >= 0 ? col("small letter") : col("small");
  const iSymbol = col("symbol") >= 0 ? col("symbol") : col("emoji");
  const iWord = findAzWordCol(header);
  const iExample =
    col("example sentence") >= 0
      ? col("example sentence")
      : col("example");

  if (iWord < 0) throw new AppError("Missing required Word / Name column", 400);

  let created = 0;
  let updated = 0;
  const errors: Array<{ row: number; error: string }> = [];

  for (let r = 1; r < rows.length; r++) {
    const cols = rows[r].map((c) => String(c ?? "").trim());
    const capital = iCap >= 0 ? cols[iCap] : "";
    const small = iSmall >= 0 ? cols[iSmall] : "";
    const symbol = iSymbol >= 0 ? cols[iSymbol] : "";
    const wordRaw = cols[iWord] ?? "";
    const example = iExample >= 0 ? cols[iExample] : "";
    const word = sanitizeWord(wordRaw);
    if (!word) {
      errors.push({ row: r + 1, error: "Word required" });
      continue;
    }
    const meaning = sanitizeText(
      example ||
        (capital
          ? `${capital} is for ${wordRaw.trim()}.`
          : `A word that starts with ${word.charAt(0).toUpperCase()}.`),
      500
    );
    // Excel Symbol column often uses private-use font glyphs that show as □ on phones.
    const emoji = resolveAlphabetEmoji({
      symbol,
      word: wordRaw,
      capitalLetter: /^[A-Za-z]$/.test(capital) ? capital : word.charAt(0),
      fallback: category.emoji || "🔤",
    });
    const phonetic =
      capital && small
        ? `${capital} / ${small}`
        : capital || small || null;
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
          meaning,
          emoji,
          phonetic,
          difficulty: 1,
          sortOrder,
          isActive: true,
          firstLetter: word.charAt(0).toUpperCase(),
        },
      });
      updated += 1;
    } else {
      await prisma.vocabularyWord.create({
        data: {
          categoryId: category.id,
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

  return {
    format: "alphabet_az" as const,
    categoryId: category.id,
    created,
    updated,
    failed: errors.length,
    errors: errors.slice(0, 40),
  };
}

function sheetToMatrix(sheet: XLSX.WorkSheet): string[][] {
  return XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as string[][];
}

function isHowToSheet(name: string) {
  return /how\s*to|notes|readme|instruction/i.test(name);
}

function categoryMatchScore(
  sheetName: string,
  category: { label: string; code: string }
) {
  const sheet = sheetName.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const label = category.label.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const code = category.code.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const labelToken = label.split(" ")[0] || label;
  let score = 0;
  if (sheet === label || sheet === code) score += 100;
  if (sheet.includes(label) || label.includes(sheet)) score += 50;
  if (labelToken.length >= 3 && sheet.includes(labelToken)) score += 40;
  if (code && sheet.includes(code)) score += 30;
  // "A-Z Fruits" / "Fruits A-Z" style tabs
  if (/fruit/.test(sheet) && /fruit/.test(label)) score += 60;
  if (/vegetable/.test(sheet) && /vegetable/.test(label)) score += 60;
  if (/animal/.test(sheet) && /animal/.test(label)) score += 60;
  if (/bird/.test(sheet) && /bird/.test(label)) score += 60;
  if (/color|colour/.test(sheet) && /color|colour/.test(label)) score += 60;
  if (/shape/.test(sheet) && /shape/.test(label)) score += 60;
  if (/number/.test(sheet) && /number/.test(label)) score += 60;
  if (/body/.test(sheet) && /body/.test(label)) score += 60;
  if (/household|object/.test(sheet) && /household|object/.test(label))
    score += 60;
  if (/action/.test(sheet) && /action/.test(label)) score += 60;
  if (/food|drink/.test(sheet) && /food|drink/.test(label)) score += 60;
  if (/cloth/.test(sheet) && /cloth/.test(label)) score += 60;
  if (/feeling/.test(sheet) && /feeling/.test(label)) score += 60;
  if (/conversation|daily/.test(sheet) && /conversation|daily/.test(label))
    score += 60;
  if (/family|people/.test(sheet) && /family|people/.test(label)) score += 60;
  if (
    /alphabet|abc|letter/.test(sheet) &&
    /alphabet|abc|letter|learning/.test(label)
  ) {
    score += 55;
  }
  return score;
}

function pickAzSheetName(
  sheetNames: string[],
  category?: { label: string; code: string } | null
) {
  const candidates = sheetNames.filter((n) => !isHowToSheet(n));
  if (!candidates.length) return sheetNames[0];
  if (category) {
    const ranked = candidates
      .map((n) => ({ n, score: categoryMatchScore(n, category) }))
      .sort((a, b) => b.score - a.score);
    if (ranked[0] && ranked[0].score > 0) return ranked[0].n;
  }
  return (
    candidates.find((n) => /alphabet|a-z|a_to_z|abc/i.test(n)) ?? candidates[0]
  );
}

/**
 * Auto-detect grade/level CSV or A–Z category xlsx/csv and import.
 *
 * One Excel workbook may contain multiple tabs (A-Z Alphabet, A-Z Fruits, …).
 * - With categoryId selected in Admin → imports the matching tab into that category
 * - Without categoryId → imports each A–Z tab into the category matching the tab name
 */
export async function importVocabularySheet(input: {
  buffer?: Buffer;
  filename?: string;
  csvText?: string;
  categoryId?: string;
}) {
  const name = (input.filename ?? "").toLowerCase();
  const isXlsx = name.endsWith(".xlsx") || name.endsWith(".xls");

  if (input.buffer?.length && isXlsx) {
    const wb = XLSX.read(input.buffer, { type: "buffer", cellDates: false });
    const azSheets = wb.SheetNames.filter((n) => {
      if (isHowToSheet(n)) return false;
      const matrix = sheetToMatrix(wb.Sheets[n]);
      return matrix.length > 1 && isAlphabetHeader(matrix[0].map(String));
    });

    if (azSheets.length) {
      if (input.categoryId) {
        const category = await prisma.learningCategory.findUnique({
          where: { id: input.categoryId },
        });
        if (!category) throw new AppError("Category not found", 404);
        const sheetName = pickAzSheetName(azSheets, category);
        const matrix = sheetToMatrix(wb.Sheets[sheetName]);
        const result = await importAlphabetSheetRows(matrix, category.id);
        return { ...result, sheet: sheetName, sheetsImported: [sheetName] };
      }

      // One workbook → many categories (sheet name ≈ category label)
      const categories = await prisma.learningCategory.findMany({
        select: { id: true, label: true, code: true },
      });
      let created = 0;
      let updated = 0;
      let failed = 0;
      const errors: Array<{ row: number; error: string }> = [];
      const sheetsImported: string[] = [];
      const skippedSheets: string[] = [];

      for (const sheetName of azSheets) {
        const ranked = categories
          .map((c) => ({ c, score: categoryMatchScore(sheetName, c) }))
          .sort((a, b) => b.score - a.score);
        const best = ranked[0];
        if (!best || best.score <= 0) {
          skippedSheets.push(sheetName);
          continue;
        }
        const matrix = sheetToMatrix(wb.Sheets[sheetName]);
        const part = await importAlphabetSheetRows(matrix, best.c.id);
        created += part.created;
        updated += part.updated;
        failed += part.failed;
        errors.push(...part.errors);
        sheetsImported.push(`${sheetName} → ${best.c.label}`);
      }

      if (!sheetsImported.length) {
        throw new AppError(
          "No sheet matched a category. Select a category in Admin, or name tabs like “A-Z Fruits”, “A-Z Alphabet”.",
          400
        );
      }

      return {
        format: "alphabet_az_multi" as const,
        created,
        updated,
        failed,
        errors: errors.slice(0, 40),
        sheetsImported,
        skippedSheets,
      };
    }

    // Non A–Z workbook: first sheet as grade/level CSV path
    const sheetName = wb.SheetNames[0];
    const matrix = sheetToMatrix(wb.Sheets[sheetName]);
    if (!matrix.length) throw new AppError("Sheet is empty", 400);
    const header = matrix[0].map((c) => String(c ?? ""));
    if (isGradeLevelHeader(header) || header.some((h) => /grade_code/i.test(h))) {
      const csv = matrix
        .map((row) =>
          row
            .map((cell) => {
              const s = String(cell ?? "");
              return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
            })
            .join(",")
        )
        .join("\n");
      const result = await importGradeLevelWordsCsv(csv);
      return { format: "grade_level" as const, ...result };
    }
    throw new AppError(
      "Unrecognized sheet. Use A–Z tabs (Capital Letter, Small Letter, Symbol, Word, Example Sentence) or the grade/level template.",
      400
    );
  }

  const text =
    input.csvText?.trim() ||
    (input.buffer?.length ? input.buffer.toString("utf8") : "");
  if (!text) {
    throw new AppError(
      "Upload a CSV/XLSX file (A–Z category sheets or grade/level sheet)",
      400
    );
  }
  const matrix = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => parseCsvLine(line));

  if (!matrix.length) throw new AppError("Sheet is empty", 400);
  const header = matrix[0].map((c) => String(c ?? ""));

  if (isAlphabetHeader(header)) {
    return importAlphabetSheetRows(matrix, input.categoryId ?? "");
  }
  if (isGradeLevelHeader(header) || header.some((h) => /grade_code/i.test(h))) {
    const csv = matrix
      .map((row) =>
        row
          .map((cell) => {
            const s = String(cell ?? "");
            return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
          })
          .join(",")
      )
      .join("\n");
    const result = await importGradeLevelWordsCsv(csv);
    return { format: "grade_level" as const, ...result };
  }

  throw new AppError(
    "Unrecognized sheet. Use A–Z format (Capital Letter, Small Letter, Symbol, Word, Example Sentence) or the grade/level template.",
    400
  );
}

export async function deleteAdminWord(id: string) {
  const existing = await prisma.vocabularyWord.findUnique({
    where: { id },
    include: {
      _count: { select: { attempts: true, publishedFrom: true } },
    },
  });
  if (!existing) throw new AppError("Word not found", 404);
  if (existing._count.attempts > 0 || existing._count.publishedFrom > 0) {
    throw new AppError(
      "Word is used in learning history or dictionary publications. Deactivate instead.",
      409,
      { code: "WORD_IN_USE", suggest: "deactivate" }
    );
  }
  await prisma.vocabularyWord.delete({ where: { id } });
  return { id, deleted: true };
}

/**
 * Move word to another category without changing id (progress stays linked).
 * Validates group→level→grade chain when gradeId/levelId provided.
 */
export async function reclassifyAdminWord(
  id: string,
  input: { categoryId: string; levelId?: string; gradeId?: string }
) {
  const word = await prisma.vocabularyWord.findUnique({
    where: { id },
    include: { publishedFrom: true },
  });
  if (!word) throw new AppError("Word not found", 404);

  const category = await prisma.learningCategory.findUnique({
    where: { id: input.categoryId },
    include: {
      group: {
        include: {
          level: { include: { grade: true } },
        },
      },
    },
  });
  if (!category) throw new AppError("categoryId not found", 400);

  if (input.levelId && category.group.levelId !== input.levelId) {
    throw new AppError("Category does not belong to the given level", 400);
  }
  if (input.gradeId) {
    const gradeId = category.group.level.gradeId;
    if (gradeId !== input.gradeId) {
      throw new AppError("Category does not belong to the given grade", 400);
    }
  }

  if (category.id === word.categoryId) {
    return getAdminWord(id);
  }

  const clash = await prisma.vocabularyWord.findUnique({
    where: {
      categoryId_text: { categoryId: category.id, text: word.text },
    },
  });
  if (clash) {
    throw new AppError(
      "Target category already has this headword. Merge manually or deactivate one copy.",
      409
    );
  }

  const levelId = category.group.levelId;
  const gradeId = category.group.level.gradeId;
  if (word.publishedFrom.length && !gradeId) {
    throw new AppError(
      "Target category's level has no grade — cannot reclassify published dictionary words",
      400
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.vocabularyWord.update({
      where: { id },
      data: { categoryId: category.id },
    });

    // Keep published assignment rows pointing at same word id; update placement only
    if (word.publishedFrom.length && gradeId) {
      for (const a of word.publishedFrom) {
        const conflict = await tx.vocabularyGradeAssignment.findFirst({
          where: {
            senseId: a.senseId,
            gradeId,
            categoryId: category.id,
            NOT: { id: a.id },
          },
        });
        if (conflict) {
          throw new AppError(
            "Reclassify would conflict with an existing grade assignment for this sense",
            409
          );
        }
        await tx.vocabularyGradeAssignment.update({
          where: { id: a.id },
          data: {
            categoryId: category.id,
            levelId,
            gradeId,
          },
        });
      }
    }
  });

  return getAdminWord(id);
}
