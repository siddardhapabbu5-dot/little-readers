/** Export enriched workbook → JSON for production upsert */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";

const XLSX = xlsx?.readFile ? xlsx : xlsx?.default ?? xlsx;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const SRC = path.join(ROOT, "docs/curriculum/Learn_Wise_Grades_2_3_4_Additional_Vocabulary_ENRICHED.xlsx");
const OUT = path.join(ROOT, "docs/curriculum/additional-vocab-g2-4-enriched.json");

const GRADE = {
  "Grade 2": 2,
  "Grade 3": 3,
  "Grade 4": 4,
};

function sanitizeWord(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s\-']/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

const wb = XLSX.readFile(SRC);
const rows = [];
for (const [sheet, grade] of Object.entries(GRADE)) {
  const list = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: "" });
  for (const rec of list) {
    const text = sanitizeWord(rec.Word);
    const meaning = String(rec["Meaning (draft)"] || "").trim();
    if (!text || text.length < 2 || !meaning) continue;
    rows.push({
      grade,
      topic: String(rec["Original Topic / Lesson"] || "").trim(),
      text,
      meaning,
      exampleSentence: String(rec["Example Sentence (draft)"] || "").trim() || null,
      phonetic: String(rec["Part of Speech"] || "").trim().slice(0, 40) || null,
    });
  }
}
fs.writeFileSync(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), count: rows.length, rows }, null, 0));
console.log(JSON.stringify({ out: OUT, count: rows.length }));
