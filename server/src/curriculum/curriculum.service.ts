import * as XLSX from "xlsx";
import type { CategoryStatus } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { AppError } from "../lib/errors.js";
import { assertCategoryReadyToPublish } from "../learning/category-progress.js";
import {
  meaningQualityIssue,
  sanitizeText,
  sanitizeWord,
  wordQualityIssue,
} from "../vocab-import/file-security.js";
import { isDisplayableEmoji } from "../vocab-import/alphabet-emoji.js";

/** Child grades managed by the curriculum workflow (Grade n ↔ LEVEL_n). */
export const CURRICULUM_LEVELS = ["LEVEL_1", "LEVEL_2", "LEVEL_3", "LEVEL_4"] as const;
export type CurriculumLevelCode = (typeof CURRICULUM_LEVELS)[number];

/** Grade 1 is live in production: its content is read/export only here. */
export const LOCKED_LEVELS: ReadonlySet<string> = new Set(["LEVEL_1"]);

export const TOPIC_COLUMNS = [
  "Grade Code",
  "Group Code",
  "Group Label",
  "Category Code",
  "Topic",
  "Symbol",
  "Daily Conversation",
  "Example Sentence",
  "Sort Order",
  "Status",
  "Needs Review",
] as const;

export const WORD_COLUMNS = [
  "Category Code",
  "Word",
  "Meaning",
  "Example Sentence",
  "Emoji",
  "Phonetic",
  "Difficulty",
  "Sort Order",
  "Needs Review",
] as const;

const REQUIRED_TOPIC_COLUMNS = ["Grade Code", "Group Code", "Category Code", "Topic"];
const REQUIRED_WORD_COLUMNS = ["Category Code", "Word", "Meaning", "Emoji"];

export function assertCurriculumLevel(levelCode: unknown): CurriculumLevelCode {
  const code = String(levelCode ?? "").trim().toUpperCase();
  if (!(CURRICULUM_LEVELS as readonly string[]).includes(code)) {
    throw new AppError("levelCode must be one of LEVEL_1, LEVEL_2, LEVEL_3, LEVEL_4", 400);
  }
  return code as CurriculumLevelCode;
}

export function gradeCodeForLevel(levelCode: string) {
  return `GRADE_${levelCode.replace("LEVEL_", "")}`;
}

/** Stable category/group code from a source label: "Modals (Ability & Obligation)" → MODALS_ABILITY_AND_OBLIGATION. */
export function codeFromLabel(label: string) {
  return label
    .normalize("NFKD")
    .replace(/&/g, " and ")
    .replace(/['’`.]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase()
    .slice(0, 48);
}

// ——— Summary ———

export async function getCurriculumSummary(levelCode: CurriculumLevelCode) {
  const level = await prisma.learningLevel.findUnique({
    where: { code: levelCode },
    include: {
      groups: {
        orderBy: { sortOrder: "asc" },
        include: {
          categories: {
            orderBy: { sortOrder: "asc" },
            include: {
              words: {
                where: { isActive: true },
                select: { meaning: true, emoji: true, imageUrl: true, exampleSentence: true },
              },
              _count: { select: { lessons: true } },
            },
          },
        },
      },
    },
  });
  if (!level) throw new AppError(`${levelCode} is not seeded`, 404);

  const byStatus: Record<CategoryStatus, number> = {
    DRAFT: 0,
    PENDING_APPROVAL: 0,
    APPROVED: 0,
    PUBLISHED: 0,
    UNPUBLISHED: 0,
  };
  let words = 0;
  let wordsMissingExample = 0;
  let categoriesWithWords = 0;
  let needsReview = 0;

  const groups = level.groups.map((g) => ({
    id: g.id,
    code: g.code,
    label: g.label,
    isActive: g.isActive,
    categories: g.categories.map((c) => {
      byStatus[c.status] += 1;
      const wordCount = c.words.length;
      const missingExample = c.words.filter((w) => !w.exampleSentence?.trim()).length;
      const notReady = c.words.filter(
        (w) => !w.meaning?.trim() || (!isDisplayableEmoji(w.emoji) && !w.imageUrl)
      ).length;
      words += wordCount;
      wordsMissingExample += missingExample;
      if (wordCount > 0) categoriesWithWords += 1;
      if (c.needsReview) needsReview += 1;
      return {
        id: c.id,
        code: c.code,
        label: c.label,
        emoji: c.emoji,
        symbol: c.symbol,
        dailyConversation: c.dailyConversation,
        exampleSentence: c.exampleSentence,
        status: c.status,
        isPublished: c.isPublished,
        needsReview: c.needsReview,
        wordCount,
        wordsMissingExample: missingExample,
        wordsNotReady: notReady,
        lessonCount: c._count.lessons,
      };
    }),
  }));

  const categories = groups.reduce((n, g) => n + g.categories.length, 0);
  return {
    level: {
      id: level.id,
      code: level.code,
      label: level.label,
      gradeCode: gradeCodeForLevel(level.code),
      ageMin: level.ageMin,
      ageMax: level.ageMax,
      locked: LOCKED_LEVELS.has(level.code),
    },
    totals: {
      groups: groups.length,
      categories,
      categoriesWithWords,
      words,
      wordsMissingExample,
      needsReview,
      byStatus,
      publishedPct: categories ? Math.round((byStatus.PUBLISHED / categories) * 100) : 0,
      contentPct: categories ? Math.round((categoriesWithWords / categories) * 100) : 0,
    },
    groups,
  };
}

export async function getCurriculumOverview() {
  const out = [];
  for (const code of CURRICULUM_LEVELS) {
    const level = await prisma.learningLevel.findUnique({ where: { code } });
    if (!level) continue;
    const s = await getCurriculumSummary(code);
    out.push({ level: s.level, totals: s.totals });
  }
  return out;
}

// ——— Export ———

export async function exportCurriculumWorkbook(levelCode: CurriculumLevelCode) {
  const level = await prisma.learningLevel.findUnique({
    where: { code: levelCode },
    include: {
      groups: {
        orderBy: { sortOrder: "asc" },
        include: {
          categories: {
            orderBy: { sortOrder: "asc" },
            include: { words: { where: { isActive: true }, orderBy: { sortOrder: "asc" } } },
          },
        },
      },
    },
  });
  if (!level) throw new AppError(`${levelCode} is not seeded`, 404);
  const gradeCode = gradeCodeForLevel(levelCode);

  const topics: (string | number)[][] = [[...TOPIC_COLUMNS]];
  const words: (string | number)[][] = [[...WORD_COLUMNS]];
  for (const g of level.groups) {
    for (const c of g.categories) {
      topics.push([
        gradeCode,
        g.code,
        g.label,
        c.code,
        c.label,
        c.symbol ?? c.emoji,
        c.dailyConversation ?? "",
        c.exampleSentence ?? "",
        c.sortOrder,
        c.status,
        c.needsReview ? "YES" : "",
      ]);
      for (const w of c.words) {
        words.push([
          c.code,
          w.text,
          w.meaning,
          w.exampleSentence ?? "",
          w.emoji,
          w.phonetic ?? "",
          w.difficulty,
          w.sortOrder,
          c.needsReview ? "YES" : "",
        ]);
      }
    }
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(readMeRows(level.label, gradeCode)), "Read Me");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(topics), "Topics");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(words), "Words");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return {
    buffer,
    filename: `learn-wise-${gradeCode.toLowerCase()}-curriculum.xlsx`,
    topicCount: topics.length - 1,
    wordCount: words.length - 1,
  };
}

export function readMeRows(levelLabel: string, gradeCode: string): string[][] {
  return [
    [`Learn Wise curriculum workbook — ${levelLabel} (${gradeCode})`],
    [""],
    ["Sheet Topics: one row per topic (= category shown to children). Mandatory: Grade Code, Group Code, Category Code, Topic."],
    ["Sheet Words: one row per vocabulary word. Mandatory: Category Code, Word, Meaning, Emoji."],
    ["Status on import: new topics are created as DRAFT (or PENDING_APPROVAL). Import never approves or publishes."],
    ["Existing topics keep their status. Words cannot be imported into a PUBLISHED topic — unpublish it first."],
    ["Needs Review = YES marks drafted content that a reviewer must check before approval."],
    ["Grade 1 (GRADE_1) is live: its workbook can be exported and previewed but not imported."],
  ];
}

// ——— Import (preview + apply) ———

export type RowAction = "NEW" | "UPDATE" | "UNCHANGED" | "DUPLICATE" | "ERROR";

export type TopicPreviewRow = {
  row: number;
  action: RowAction;
  gradeCode: string;
  groupCode: string;
  groupLabel: string;
  categoryCode: string;
  topic: string;
  symbol: string;
  dailyConversation: string;
  exampleSentence: string;
  sortOrder: number;
  status: "DRAFT" | "PENDING_APPROVAL";
  needsReview: boolean;
  changes: string[];
  issues: string[];
  warnings: string[];
};

export type WordPreviewRow = {
  row: number;
  action: RowAction;
  categoryCode: string;
  word: string;
  meaning: string;
  exampleSentence: string;
  emoji: string;
  phonetic: string;
  difficulty: number;
  sortOrder: number;
  changes: string[];
  issues: string[];
  warnings: string[];
};

type SheetRows = { header: string[]; rows: Record<string, string>[] };

function readSheet(wb: XLSX.WorkBook, name: string): SheetRows | null {
  const sheetName = wb.SheetNames.find((n) => n.trim().toLowerCase() === name.toLowerCase());
  if (!sheetName) return null;
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sheetName]!, {
    header: 1,
    defval: "",
    raw: false,
  });
  const header = (aoa[0] ?? []).map((h) => String(h ?? "").trim());
  const rows = aoa.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    header.forEach((h, i) => {
      if (h) rec[h] = String((r as unknown[])[i] ?? "").trim();
    });
    return rec;
  });
  return { header, rows };
}

function isBlankRow(rec: Record<string, string>) {
  return Object.values(rec).every((v) => !v);
}

function toInt(v: string, fallback: number) {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function yes(v: string) {
  return /^(y|yes|true|1)$/i.test(v.trim());
}

export async function previewCurriculumImport(input: {
  levelCode: CurriculumLevelCode;
  buffer: Buffer;
  filename?: string;
}) {
  if (input.filename && !/\.xlsx$/i.test(input.filename)) {
    throw new AppError("Upload the .xlsx curriculum workbook (Topics + Words sheets)", 400);
  }
  if (input.buffer.length < 4 || input.buffer[0] !== 0x50 || input.buffer[1] !== 0x4b) {
    throw new AppError("File is not a valid .xlsx workbook", 400);
  }
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(input.buffer, { type: "buffer" });
  } catch {
    throw new AppError("Workbook could not be read", 400);
  }

  const topicSheet = readSheet(wb, "Topics");
  const wordSheet = readSheet(wb, "Words");
  const fileIssues: string[] = [];
  if (!topicSheet) fileIssues.push('Sheet "Topics" is missing');
  if (!wordSheet) fileIssues.push('Sheet "Words" is missing');
  for (const col of REQUIRED_TOPIC_COLUMNS) {
    if (topicSheet && !topicSheet.header.includes(col)) fileIssues.push(`Topics: missing column "${col}"`);
  }
  for (const col of REQUIRED_WORD_COLUMNS) {
    if (wordSheet && !wordSheet.header.includes(col)) fileIssues.push(`Words: missing column "${col}"`);
  }

  const level = await prisma.learningLevel.findUnique({
    where: { code: input.levelCode },
    include: {
      groups: {
        include: {
          categories: {
            include: { words: { select: { id: true, text: true, meaning: true, exampleSentence: true, emoji: true, phonetic: true, difficulty: true, sortOrder: true, isActive: true } } },
          },
        },
      },
    },
  });
  if (!level) throw new AppError(`${input.levelCode} is not seeded`, 404);
  const gradeCode = gradeCodeForLevel(input.levelCode);
  const locked = LOCKED_LEVELS.has(input.levelCode);

  const groupsByCode = new Map(level.groups.map((g) => [g.code, g]));
  const catsByCode = new Map<string, (typeof level.groups)[number]["categories"][number] & { groupCode: string }>();
  for (const g of level.groups) {
    for (const c of g.categories) catsByCode.set(c.code, { ...c, groupCode: g.code });
  }
  const catLabels = new Map<string, string>();
  for (const c of catsByCode.values()) catLabels.set(c.label.trim().toLowerCase(), c.code);

  const topics: TopicPreviewRow[] = [];
  const seenCodes = new Set<string>();
  const seenLabels = new Map<string, string>();

  for (const [i, rec] of (fileIssues.length ? [] : topicSheet!.rows).entries()) {
    if (isBlankRow(rec)) continue;
    const issues: string[] = [];
    const warnings: string[] = [];
    const changes: string[] = [];
    const rowGrade = sanitizeText(rec["Grade Code"], 20).toUpperCase();
    const groupCode = sanitizeText(rec["Group Code"], 20).toUpperCase();
    const groupLabel = sanitizeText(rec["Group Label"], 120);
    const topic = sanitizeText(rec["Topic"], 120);
    const categoryCode = (sanitizeText(rec["Category Code"], 60) || codeFromLabel(topic)).toUpperCase();
    const symbolRaw = sanitizeText(rec["Symbol"], 16);
    const dailyConversation = sanitizeText(rec["Daily Conversation"], 500);
    const exampleSentence = sanitizeText(rec["Example Sentence"], 300);
    const sortOrder = toInt(rec["Sort Order"] ?? "", topics.length + 1);
    const statusRaw = sanitizeText(rec["Status"], 30).toUpperCase();
    const needsReview = yes(rec["Needs Review"] ?? "");

    if (!rowGrade) issues.push("Grade Code is empty");
    else if (rowGrade !== gradeCode) issues.push(`Grade Code ${rowGrade} does not match selected ${gradeCode}`);
    if (!groupCode) issues.push("Group Code is empty");
    else if (!/^[A-Z0-9_]{1,20}$/.test(groupCode)) issues.push("Group Code may contain only A–Z, 0–9 and _");
    if (!topic) issues.push("Topic is empty");
    if (!/^[A-Z0-9_]{2,60}$/.test(categoryCode)) issues.push("Category Code may contain only A–Z, 0–9 and _");
    if (symbolRaw && !isDisplayableEmoji(symbolRaw)) warnings.push("Symbol is not a displayable emoji; the topic emoji will be kept");

    let status: "DRAFT" | "PENDING_APPROVAL" = "DRAFT";
    if (statusRaw === "PENDING_APPROVAL") status = "PENDING_APPROVAL";
    else if (statusRaw && statusRaw !== "DRAFT") {
      warnings.push(`Status ${statusRaw} is ignored on import (new topics start as DRAFT; existing keep their status)`);
    }

    let action: RowAction = "NEW";
    const labelKey = topic.toLowerCase();
    if (seenCodes.has(categoryCode)) {
      action = "DUPLICATE";
      issues.push(`Category Code ${categoryCode} appears more than once in this file`);
    } else if (topic && seenLabels.has(labelKey)) {
      action = "DUPLICATE";
      issues.push(`Topic "${topic}" appears more than once in this file (also ${seenLabels.get(labelKey)})`);
    }
    seenCodes.add(categoryCode);
    if (topic) seenLabels.set(labelKey, categoryCode);

    const existing = catsByCode.get(categoryCode);
    const symbol = symbolRaw && isDisplayableEmoji(symbolRaw) ? symbolRaw : "";
    if (existing && action !== "DUPLICATE") {
      if (existing.groupCode !== groupCode) {
        issues.push(`Category ${categoryCode} already exists in group ${existing.groupCode}`);
      }
      if (existing.label !== topic) changes.push("topic");
      if (symbol && (existing.symbol ?? "") !== symbol) changes.push("symbol");
      if ((existing.dailyConversation ?? "") !== dailyConversation) changes.push("dailyConversation");
      if ((existing.exampleSentence ?? "") !== exampleSentence) changes.push("exampleSentence");
      if (rec["Sort Order"] && existing.sortOrder !== sortOrder) changes.push("sortOrder");
      if (needsReview && !existing.needsReview) changes.push("needsReview");
      action = changes.length ? "UPDATE" : "UNCHANGED";
      if (changes.length && existing.status === "PUBLISHED") {
        issues.push(`Topic ${categoryCode} is published — unpublish it before importing changes`);
      }
    } else if (!existing && topic && catLabels.has(labelKey) && action !== "DUPLICATE") {
      action = "DUPLICATE";
      issues.push(`A topic named "${topic}" already exists as ${catLabels.get(labelKey)}`);
    }
    if (!groupsByCode.has(groupCode) && groupCode && !groupLabel) {
      issues.push(`Group ${groupCode} is new; Group Label is required`);
    }
    if (issues.length && action !== "DUPLICATE") action = "ERROR";

    topics.push({
      row: i + 2,
      action,
      gradeCode: rowGrade,
      groupCode,
      groupLabel,
      categoryCode,
      topic,
      symbol,
      dailyConversation,
      exampleSentence,
      sortOrder,
      status,
      needsReview,
      changes,
      issues,
      warnings,
    });
  }

  const fileCats = new Map(topics.filter((t) => t.action !== "ERROR" && t.action !== "DUPLICATE").map((t) => [t.categoryCode, t]));
  const words: WordPreviewRow[] = [];
  const seenWords = new Map<string, string>();
  const wordOwners = new Map<string, string>();
  const fileWordOwners = new Map<string, string>();
  for (const c of catsByCode.values()) {
    for (const w of c.words) if (w.isActive) wordOwners.set(w.text, c.code);
  }

  for (const [i, rec] of (fileIssues.length ? [] : wordSheet!.rows).entries()) {
    if (isBlankRow(rec)) continue;
    const issues: string[] = [];
    const warnings: string[] = [];
    const changes: string[] = [];
    const categoryCode = sanitizeText(rec["Category Code"], 60).toUpperCase();
    const rawWord = String(rec["Word"] ?? "");
    const word = sanitizeWord(rawWord);
    const meaning = sanitizeText(rec["Meaning"], 300);
    const exampleSentence = sanitizeText(rec["Example Sentence"], 300);
    const emoji = sanitizeText(rec["Emoji"], 16);
    const phonetic = sanitizeText(rec["Phonetic"], 120);
    const difficulty = Math.min(5, Math.max(1, toInt(rec["Difficulty"] ?? "", 1)));
    const sortOrder = toInt(rec["Sort Order"] ?? "", 0);

    if (!categoryCode) issues.push("Category Code is empty");
    const wq = wordQualityIssue(rawWord);
    if (wq) issues.push(wq);
    const mq = meaningQualityIssue(meaning);
    if (mq) issues.push(mq);
    if (!emoji) issues.push("Emoji is empty");
    else if (!isDisplayableEmoji(emoji)) issues.push("Emoji is not displayable");
    if (!exampleSentence) warnings.push("Example Sentence is empty");

    const existingCat = catsByCode.get(categoryCode);
    const inFile = fileCats.get(categoryCode);
    if (categoryCode && !existingCat && !inFile) {
      issues.push(`Category ${categoryCode} is not in this grade or in the Topics sheet`);
    }
    if (existingCat?.status === "PUBLISHED") {
      issues.push(`Topic ${categoryCode} is published — unpublish it before importing word changes`);
    }

    let action: RowAction = "NEW";
    const key = `${categoryCode}::${word}`;
    if (word && seenWords.has(key)) {
      action = "DUPLICATE";
      issues.push(`"${word}" appears more than once for ${categoryCode} (row ${seenWords.get(key)})`);
    }
    if (word) seenWords.set(key, String(i + 2));
    const owner = word ? wordOwners.get(word) : undefined;
    if (owner && owner !== categoryCode) warnings.push(`"${word}" is also used in ${owner} in this grade`);
    const fileOwner = word ? fileWordOwners.get(word) : undefined;
    if (fileOwner && fileOwner !== categoryCode && fileOwner !== owner) {
      warnings.push(`"${word}" also appears under ${fileOwner} in this file`);
    }
    if (word && !fileOwner) fileWordOwners.set(word, categoryCode);

    const existingWord = existingCat?.words.find((w) => w.text === word);
    if (existingWord && action !== "DUPLICATE") {
      if (!existingWord.isActive) changes.push("reactivate");
      if (existingWord.meaning !== meaning) changes.push("meaning");
      if ((existingWord.exampleSentence ?? "") !== exampleSentence) changes.push("exampleSentence");
      if (existingWord.emoji !== emoji) changes.push("emoji");
      if ((existingWord.phonetic ?? "") !== phonetic) changes.push("phonetic");
      if (rec["Difficulty"] && existingWord.difficulty !== difficulty) changes.push("difficulty");
      if (rec["Sort Order"] && existingWord.sortOrder !== sortOrder) changes.push("sortOrder");
      action = changes.length ? "UPDATE" : "UNCHANGED";
    }
    if (issues.length && action !== "DUPLICATE") action = "ERROR";

    words.push({ row: i + 2, action, categoryCode, word, meaning, exampleSentence, emoji, phonetic, difficulty, sortOrder, changes, issues, warnings });
  }

  const count = <T extends { action: RowAction }>(rows: T[], a: RowAction) => rows.filter((r) => r.action === a).length;
  const summarize = <T extends { action: RowAction }>(rows: T[]) => ({
    total: rows.length,
    NEW: count(rows, "NEW"),
    UPDATE: count(rows, "UPDATE"),
    UNCHANGED: count(rows, "UNCHANGED"),
    DUPLICATE: count(rows, "DUPLICATE"),
    ERROR: count(rows, "ERROR"),
  });
  const errorCount =
    fileIssues.length +
    topics.filter((t) => t.issues.length).length +
    words.filter((w) => w.issues.length).length;

  return {
    levelCode: input.levelCode,
    gradeCode,
    locked,
    canApply: !locked && fileIssues.length === 0,
    fileIssues,
    errorCount,
    topicSummary: summarize(topics),
    wordSummary: summarize(words),
    topics,
    words,
  };
}

/**
 * Apply a previously previewed workbook. Re-validates the file; rows with issues are skipped.
 * Never publishes: new topics are DRAFT/PENDING_APPROVAL and stay hidden from children.
 */
export async function applyCurriculumImport(input: {
  levelCode: CurriculumLevelCode;
  buffer: Buffer;
  filename?: string;
  allowPartial?: boolean;
}) {
  if (LOCKED_LEVELS.has(input.levelCode)) {
    throw new AppError("Grade 1 is live — curriculum import is disabled for Grade 1", 403, {
      code: "GRADE_LOCKED",
    });
  }
  const preview = await previewCurriculumImport(input);
  if (preview.fileIssues.length) {
    throw new AppError("Workbook has file-level errors", 400, { fileIssues: preview.fileIssues });
  }
  if (preview.errorCount > 0 && !input.allowPartial) {
    throw new AppError(
      `Workbook has ${preview.errorCount} row(s) with errors — fix them or confirm a partial import`,
      400,
      { code: "IMPORT_HAS_ERRORS", errorCount: preview.errorCount }
    );
  }

  const level = await prisma.learningLevel.findUniqueOrThrow({ where: { code: input.levelCode } });
  const result = { groupsCreated: 0, topicsCreated: 0, topicsUpdated: 0, wordsCreated: 0, wordsUpdated: 0, skipped: 0 };

  const groupIds = new Map<string, string>();
  for (const g of await prisma.learningGroup.findMany({ where: { levelId: level.id } })) {
    groupIds.set(g.code, g.id);
  }
  const groupMax = await prisma.learningGroup.aggregate({ where: { levelId: level.id }, _max: { sortOrder: true } });
  let nextGroupSort = (groupMax._max.sortOrder ?? 0) + 1;

  const catIds = new Map<string, string>();
  for (const t of preview.topics) {
    if (t.action === "ERROR" || t.action === "DUPLICATE" || t.issues.length) {
      result.skipped += 1;
      continue;
    }
    let groupId = groupIds.get(t.groupCode);
    if (!groupId) {
      const g = await prisma.learningGroup.create({
        data: { levelId: level.id, code: t.groupCode, label: t.groupLabel, sortOrder: nextGroupSort++ },
      });
      groupId = g.id;
      groupIds.set(t.groupCode, groupId);
      result.groupsCreated += 1;
    }
    const topicData = {
      label: t.topic,
      symbol: t.symbol || null,
      dailyConversation: t.dailyConversation || null,
      exampleSentence: t.exampleSentence || null,
      sortOrder: t.sortOrder,
      unlockOrder: t.sortOrder,
    };
    if (t.action === "NEW") {
      const c = await prisma.learningCategory.create({
        data: {
          groupId,
          code: t.categoryCode,
          ...topicData,
          emoji: t.symbol || "📚",
          isPublished: false,
          status: t.status,
          needsReview: t.needsReview,
        },
      });
      catIds.set(t.categoryCode, c.id);
      result.topicsCreated += 1;
    } else {
      const c = await prisma.learningCategory.findFirstOrThrow({ where: { groupId, code: t.categoryCode } });
      if (t.action === "UPDATE") {
        await prisma.learningCategory.update({
          where: { id: c.id },
          data: {
            ...topicData,
            ...(t.symbol ? { emoji: t.symbol } : { symbol: c.symbol }),
            ...(t.needsReview ? { needsReview: true } : {}),
          },
        });
        result.topicsUpdated += 1;
      }
      catIds.set(t.categoryCode, c.id);
    }
  }

  for (const w of preview.words) {
    if (w.action === "ERROR" || w.action === "DUPLICATE" || w.issues.length || w.action === "UNCHANGED") {
      if (w.action !== "UNCHANGED") result.skipped += 1;
      continue;
    }
    let categoryId = catIds.get(w.categoryCode);
    if (!categoryId) {
      const c = await prisma.learningCategory.findFirst({
        where: { code: w.categoryCode, group: { levelId: level.id } },
        select: { id: true },
      });
      categoryId = c?.id;
    }
    if (!categoryId) {
      result.skipped += 1;
      continue;
    }
    const data = {
      meaning: w.meaning,
      exampleSentence: w.exampleSentence || null,
      emoji: w.emoji,
      phonetic: w.phonetic || null,
      difficulty: w.difficulty,
      sortOrder: w.sortOrder,
      firstLetter: w.word.charAt(0).toUpperCase(),
      isActive: true,
    };
    const existing = await prisma.vocabularyWord.findUnique({
      where: { categoryId_text: { categoryId, text: w.word } },
    });
    if (existing) {
      await prisma.vocabularyWord.update({ where: { id: existing.id }, data });
      result.wordsUpdated += 1;
    } else {
      await prisma.vocabularyWord.create({
        data: { categoryId, text: w.word, origin: "CATEGORY_IMPORT", ...data },
      });
      result.wordsCreated += 1;
    }
  }

  return { ...result, preview: { topicSummary: preview.topicSummary, wordSummary: preview.wordSummary, errorCount: preview.errorCount } };
}

// ——— Status workflow ———

const TRANSITIONS: Record<CategoryStatus, CategoryStatus[]> = {
  DRAFT: ["PENDING_APPROVAL"],
  PENDING_APPROVAL: ["APPROVED", "DRAFT"],
  APPROVED: ["PUBLISHED", "DRAFT"],
  PUBLISHED: ["UNPUBLISHED"],
  UNPUBLISHED: ["PUBLISHED", "DRAFT"],
};

export async function setCategoryStatus(categoryId: string, next: CategoryStatus) {
  const category = await prisma.learningCategory.findUnique({
    where: { id: categoryId },
    include: { group: { include: { level: { select: { code: true } } } } },
  });
  if (!category) throw new AppError("Category not found", 404);
  if (LOCKED_LEVELS.has(category.group.level.code)) {
    throw new AppError("Grade 1 is live — its topics cannot change status here", 403, {
      code: "GRADE_LOCKED",
    });
  }
  const allowed = TRANSITIONS[category.status];
  if (!allowed.includes(next)) {
    throw new AppError(`Cannot move a ${category.status} topic to ${next}`, 409, {
      code: "INVALID_STATUS_TRANSITION",
      from: category.status,
      allowed,
    });
  }
  if (next === "PUBLISHED") await assertCategoryReadyToPublish(categoryId);

  return prisma.learningCategory.update({
    where: { id: categoryId },
    data: {
      status: next,
      isPublished: next === "PUBLISHED",
      ...(next === "APPROVED" ? { needsReview: false } : {}),
    },
  });
}

export async function bulkSetCategoryStatus(categoryIds: string[], next: CategoryStatus) {
  const results: { id: string; ok: boolean; error?: string }[] = [];
  for (const id of categoryIds) {
    try {
      await setCategoryStatus(id, next);
      results.push({ id, ok: true });
    } catch (e) {
      results.push({ id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return { updated: results.filter((r) => r.ok).length, results };
}
