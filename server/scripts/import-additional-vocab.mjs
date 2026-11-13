/**
 * Import Learn Wise Grades 2–4 Additional Vocabulary DRAFT workbook
 * into existing curriculum topics as INACTIVE words (Admin must review/activate).
 *
 * - Never touches LEVEL_1 / Grade 1
 * - Never publishes categories or activates words
 * - Skips same-topic duplicates (existing VocabularyWord in that category)
 * - Allows same word across different topics
 * - Sets category.needsReview = true (status / isPublished unchanged)
 *
 * Usage (from server/):
 *   node ./scripts/import-additional-vocab.mjs --dry-run
 *   node ./scripts/import-additional-vocab.mjs --apply
 *
 * Optional:
 *   --file "C:/path/to/workbook.xlsx"
 *   --grade 2|3|4   (default: all)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "dotenv";
import xlsx from "xlsx";
import { PrismaClient } from "@prisma/client";

const XLSX = xlsx?.readFile ? xlsx : xlsx?.default ?? xlsx;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
const DEFAULT_FILE = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  "Downloads",
  "Learn_Wise_Grades_2_3_4_Additional_Vocabulary_DRAFT (2).xlsx"
);

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const GRADE_LEVEL = {
  2: { levelCode: "LEVEL_2", gradeCode: "GRADE_2", sheet: "Grade 2" },
  3: { levelCode: "LEVEL_3", gradeCode: "GRADE_3", sheet: "Grade 3" },
  4: { levelCode: "LEVEL_4", gradeCode: "GRADE_4", sheet: "Grade 4" },
};

function loadEnv() {
  const envFile = path.join(ROOT, ".env");
  if (!fs.existsSync(envFile)) return;
  const parsed = parse(fs.readFileSync(envFile));
  for (const [k, v] of Object.entries(parsed)) {
    if (process.env[k] == null) process.env[k] = v;
  }
}

function assertLocalOnly() {
  if ((process.env.NODE_ENV || "").toLowerCase() === "production") {
    throw new Error("Refusing: NODE_ENV=production");
  }
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");
  const host = new URL(raw).hostname;
  if (!LOCAL_HOSTS.has(host)) {
    throw new Error(`Refusing non-local database host "${host}"`);
  }
}

function normLabel(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeWord(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s\-']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

function parseArgs(argv) {
  const out = {
    dryRun: true,
    apply: false,
    file: DEFAULT_FILE,
    grades: [2, 3, 4],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--apply") {
      out.apply = true;
      out.dryRun = false;
    } else if (a === "--dry-run") {
      out.dryRun = true;
      out.apply = false;
    } else if (a === "--file") {
      out.file = argv[++i];
    } else if (a === "--grade") {
      out.grades = [Number(argv[++i])];
    }
  }
  return out;
}

async function loadTopicMap(prisma, levelCode) {
  const level = await prisma.learningLevel.findUnique({
    where: { code: levelCode },
    include: {
      groups: {
        include: {
          categories: {
            include: {
              words: { select: { text: true, isActive: true } },
            },
          },
        },
      },
    },
  });
  if (!level) throw new Error(`${levelCode} not found — seed curriculum first`);
  const byLabel = new Map();
  for (const g of level.groups) {
    for (const c of g.categories) {
      byLabel.set(normLabel(c.label), {
        id: c.id,
        code: c.code,
        label: c.label,
        groupCode: g.code,
        status: c.status,
        isPublished: c.isPublished,
        existingWords: new Set(c.words.map((w) => w.text.toLowerCase())),
      });
    }
  }
  return byLabel;
}

function readGradeRows(wb, sheetName) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" missing`);
  return XLSX.utils.sheet_to_json(sheet, { defval: "" });
}

async function processGrade(prisma, wb, gradeNum, apply) {
  const meta = GRADE_LEVEL[gradeNum];
  const byLabel = await loadTopicMap(prisma, meta.levelCode);
  const rows = readGradeRows(wb, meta.sheet);

  const report = {
    grade: gradeNum,
    levelCode: meta.levelCode,
    rows: rows.length,
    mapped: 0,
    create: 0,
    skipSameTopic: 0,
    skipBadWord: 0,
    unmatchedTopic: 0,
    topicsTouched: new Set(),
    unmatchedTopics: new Set(),
    collisions: [],
    createdSample: [],
  };

  const planned = [];

  for (const rec of rows) {
    const topicLabel = String(rec["Original Topic / Lesson"] || "").trim();
    const rawWord = String(rec.Word || "").trim();
    const meaning = String(rec["Meaning (draft)"] || "").trim();
    const example = String(rec["Example Sentence (draft)"] || "").trim();
    const pos = String(rec["Part of Speech"] || "").trim();

    const word = sanitizeWord(rawWord);
    if (!word || word.length < 2) {
      report.skipBadWord += 1;
      continue;
    }
    if (!meaning) {
      report.skipBadWord += 1;
      continue;
    }

    const cat = byLabel.get(normLabel(topicLabel));
    if (!cat) {
      report.unmatchedTopic += 1;
      report.unmatchedTopics.add(topicLabel);
      continue;
    }
    report.mapped += 1;

    if (cat.existingWords.has(word)) {
      report.skipSameTopic += 1;
      if (report.collisions.length < 30) {
        report.collisions.push({ word, topic: cat.code, label: cat.label });
      }
      continue;
    }

    report.topicsTouched.add(cat.code);
    const key = `${cat.id}::${word}`;
    if (planned.some((p) => `${p.categoryId}::${p.text}` === key)) {
      report.skipSameTopic += 1;
      continue;
    }
    // Reserve so later rows in this file collide as skip, not unique-constraint errors
    cat.existingWords.add(word);
    planned.push({
      categoryId: cat.id,
      categoryCode: cat.code,
      text: word,
      meaning,
      exampleSentence: example || null,
      // POS is not a first-class VocabularyWord field; keep only real POS values
      phonetic: pos && pos !== "Vocabulary example" ? pos.slice(0, 40) : null,
      emoji: "📚",
      difficulty: 2,
      sortOrder: 1000 + planned.length,
      firstLetter: word.charAt(0).toUpperCase(),
      isActive: false,
      origin: "CATEGORY_IMPORT",
    });
  }

  report.create = planned.length;

  if (apply && planned.length) {
    const categoryIds = [...new Set(planned.map((p) => p.categoryId))];
    for (const row of planned) {
      await prisma.vocabularyWord.create({
        data: {
          categoryId: row.categoryId,
          text: row.text,
          meaning: row.meaning,
          exampleSentence: row.exampleSentence,
          phonetic: row.phonetic,
          emoji: row.emoji,
          difficulty: row.difficulty,
          sortOrder: row.sortOrder,
          firstLetter: row.firstLetter,
          isActive: false,
          origin: "CATEGORY_IMPORT",
        },
      });
      // Prevent intra-batch duplicates in same category
      const cat = [...byLabel.values()].find((c) => c.id === row.categoryId);
      cat?.existingWords.add(row.text);
      if (report.createdSample.length < 5) {
        report.createdSample.push({
          word: row.text,
          topic: row.categoryCode,
          active: false,
        });
      }
    }
    await prisma.learningCategory.updateMany({
      where: { id: { in: categoryIds } },
      data: { needsReview: true },
    });
  }

  return {
    ...report,
    topicsTouched: report.topicsTouched.size,
    unmatchedTopics: [...report.unmatchedTopics],
    mode: apply ? "APPLY" : "DRY_RUN",
  };
}

async function main() {
  loadEnv();
  assertLocalOnly();
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.file)) {
    throw new Error(`Workbook not found: ${args.file}`);
  }

  console.log(`File: ${args.file}`);
  console.log(`Mode: ${args.apply ? "APPLY (inactive drafts only)" : "DRY-RUN"}`);
  console.log(`Grades: ${args.grades.join(", ")}`);

  const wb = XLSX.readFile(args.file);
  const prisma = new PrismaClient();

  const g1Before = await prisma.vocabularyWord.count({
    where: {
      isActive: true,
      category: { group: { level: { code: "LEVEL_1" } } },
    },
  });
  const g1TopicsBefore = await prisma.learningCategory.count({
    where: { group: { level: { code: "LEVEL_1" } }, isPublished: true },
  });

  const results = [];
  try {
    for (const g of args.grades) {
      if (!GRADE_LEVEL[g]) throw new Error(`Invalid --grade ${g}`);
      const r = await processGrade(prisma, wb, g, args.apply);
      results.push(r);
      console.log(JSON.stringify(r, null, 2));
    }

    const g1After = await prisma.vocabularyWord.count({
      where: {
        isActive: true,
        category: { group: { level: { code: "LEVEL_1" } } },
      },
    });
    const g1TopicsAfter = await prisma.learningCategory.count({
      where: { group: { level: { code: "LEVEL_1" } }, isPublished: true },
    });

    const summary = {
      grade1ActiveWordsBefore: g1Before,
      grade1ActiveWordsAfter: g1After,
      grade1PublishedTopicsBefore: g1TopicsBefore,
      grade1PublishedTopicsAfter: g1TopicsAfter,
      grade1Unchanged: g1Before === g1After && g1TopicsBefore === g1TopicsAfter,
      totalCreate: results.reduce((s, r) => s + r.create, 0),
      totalSkipSameTopic: results.reduce((s, r) => s + r.skipSameTopic, 0),
      note: "Words imported with isActive=false. Kids will not see them until Admin activates and topic is PUBLISHED.",
    };
    console.log("\n=== SUMMARY ===");
    console.log(JSON.stringify(summary, null, 2));

    const outDir = path.join(ROOT, "docs", "curriculum");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(
      outDir,
      `additional-vocab-import-report-${args.apply ? "apply" : "dry-run"}.json`
    );
    fs.writeFileSync(
      outPath,
      JSON.stringify({ summary, results }, null, 2),
      "utf8"
    );
    console.log(`Report written: ${outPath}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
