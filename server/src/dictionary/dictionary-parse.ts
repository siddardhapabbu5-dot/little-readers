import * as XLSX from "xlsx";
import { randomUUID } from "node:crypto";
import { parseVocabularyFile } from "../vocab-import/parsers.js";
import { sanitizeText, sanitizeWord } from "../vocab-import/file-security.js";

export type ParsedSense = {
  definition: string;
  wordType?: string;
  synonyms?: string[];
  antonyms?: string[];
  examples?: string[];
  relations?: Record<string, unknown>;
  raw?: Record<string, unknown>;
};

export type ParsedDictionaryRow = {
  rowId: string;
  headword: string;
  normalizedHeadword: string;
  pronunciation?: string;
  senses: ParsedSense[];
  sourceRef?: string;
  issues: string[];
};

export type DictionaryParseResult = {
  rows: ParsedDictionaryRow[];
  notes: string[];
  duplicateNormalized: number;
};

function normalizeHeadword(value: string): string {
  return sanitizeWord(value).toLowerCase().replace(/\s+/g, " ").trim();
}

function asStringArray(value: unknown): string[] | undefined {
  if (value == null) return undefined;
  if (Array.isArray(value)) {
    return value.map((v) => sanitizeText(String(v))).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(/[;,|]/)
      .map((s) => sanitizeText(s))
      .filter(Boolean);
  }
  return undefined;
}

function sensesFromObject(obj: Record<string, unknown>): ParsedSense[] {
  if (Array.isArray(obj.senses) || Array.isArray(obj.definitions)) {
    const list = (obj.senses ?? obj.definitions) as unknown[];
    return list
      .map((item, idx) => {
        if (typeof item === "string") {
          const definition = sanitizeText(item);
          return definition ? { definition, raw: { senseIndex: idx } } : null;
        }
        if (item && typeof item === "object") {
          const s = item as Record<string, unknown>;
          const definition = sanitizeText(
            String(s.definition ?? s.meaning ?? s.gloss ?? "")
          );
          if (!definition) return null;
          return {
            definition,
            wordType: s.wordType
              ? sanitizeText(String(s.wordType))
              : s.pos
                ? sanitizeText(String(s.pos))
                : s.partOfSpeech
                  ? sanitizeText(String(s.partOfSpeech))
                  : undefined,
            synonyms: asStringArray(s.synonyms),
            antonyms: asStringArray(s.antonyms),
            examples: asStringArray(s.examples ?? s.example),
            relations:
              s.relations && typeof s.relations === "object"
                ? (s.relations as Record<string, unknown>)
                : undefined,
            raw: s,
          };
        }
        return null;
      })
      .filter(Boolean) as ParsedSense[];
  }

  const definition = sanitizeText(
    String(obj.definition ?? obj.meaning ?? obj.simpleMeaning ?? obj.gloss ?? "")
  );
  if (!definition) return [];
  return [
    {
      definition,
      wordType: obj.wordType
        ? sanitizeText(String(obj.wordType))
        : obj.pos
          ? sanitizeText(String(obj.pos))
          : undefined,
      synonyms: asStringArray(obj.synonyms),
      antonyms: asStringArray(obj.antonyms),
      examples: asStringArray(obj.examples ?? obj.example),
      relations:
        obj.relations && typeof obj.relations === "object"
          ? (obj.relations as Record<string, unknown>)
          : undefined,
      raw: obj,
    },
  ];
}

function parseJsonDictionary(buffer: Buffer, notes: string[]): ParsedDictionaryRow[] {
  const text = buffer.toString("utf8").trim();
  if (!text) return [];
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    notes.push("JSON parse failed; falling back to line vocabulary parser.");
    return [];
  }

  const list = Array.isArray(data)
    ? data
    : Array.isArray((data as { entries?: unknown }).entries)
      ? (data as { entries: unknown[] }).entries
      : Array.isArray((data as { words?: unknown }).words)
        ? (data as { words: unknown[] }).words
        : null;

  if (!list) {
    notes.push("JSON root must be an array or { entries: [] } / { words: [] }.");
    return [];
  }

  notes.push(`Parsed JSON dictionary with ${list.length} top-level items.`);
  const rows: ParsedDictionaryRow[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const obj = item as Record<string, unknown>;
    const headword = sanitizeWord(
      String(obj.headword ?? obj.word ?? obj.lemma ?? obj.term ?? "")
    );
    const normalizedHeadword = normalizeHeadword(headword);
    const senses = sensesFromObject(obj);
    const issues: string[] = [];
    if (!normalizedHeadword) issues.push("Missing headword");
    if (!senses.length) issues.push("Missing definition — not invented");
    rows.push({
      rowId: randomUUID(),
      headword,
      normalizedHeadword,
      pronunciation: obj.pronunciation
        ? sanitizeText(String(obj.pronunciation))
        : obj.phonetic
          ? sanitizeText(String(obj.phonetic))
          : undefined,
      senses,
      sourceRef: obj.sourceRef ? sanitizeText(String(obj.sourceRef)) : undefined,
      issues,
    });
  }
  return rows;
}

/** Parse approved dictionary formats into headword + senses (no invented fields). */
export async function parseDictionaryFile(
  buffer: Buffer,
  ext: string
): Promise<DictionaryParseResult> {
  const notes: string[] = [];
  let rows: ParsedDictionaryRow[] = [];

  if (ext === "json") {
    rows = parseJsonDictionary(buffer, notes);
  }

  if (!rows.length && (ext === "xlsx" || ext === "xls" || ext === "csv" || ext === "tsv")) {
    const workbook = XLSX.read(buffer, { type: "buffer", raw: false });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const matrix = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
    });
    notes.push(`Spreadsheet rows: ${matrix.length}`);
    for (const raw of matrix) {
      const headword = sanitizeWord(
        String(raw.headword ?? raw.word ?? raw.Word ?? raw.Headword ?? "")
      );
      const normalizedHeadword = normalizeHeadword(headword);
      const senses = sensesFromObject(raw as Record<string, unknown>);
      const issues: string[] = [];
      if (!normalizedHeadword) issues.push("Missing headword");
      if (!senses.length) issues.push("Missing definition — not invented");
      rows.push({
        rowId: randomUUID(),
        headword,
        normalizedHeadword,
        pronunciation: raw.pronunciation
          ? sanitizeText(String(raw.pronunciation))
          : undefined,
        senses,
        issues,
      });
    }
  }

  if (!rows.length) {
    // Reuse vocabulary line/doc/pdf parsers as word+meaning pairs (single sense each).
    const fallback = await parseVocabularyFile(buffer, ext);
    notes.push(...fallback.parseNotes);
    notes.push("Fallback vocabulary parser used (word + meaning → one sense).");
    rows = fallback.rows.map((r) => {
      const normalizedHeadword = normalizeHeadword(r.word);
      const definition = sanitizeText(r.simpleMeaning);
      const issues = [...r.issues];
      if (!definition) issues.push("Missing definition — not invented");
      return {
        rowId: r.rowId,
        headword: r.word,
        normalizedHeadword,
        pronunciation: r.pronunciation || undefined,
        senses: definition ? [{ definition }] : [],
        issues,
      };
    });
  }

  // Deduplicate by normalized headword within file (merge senses)
  const byNorm = new Map<string, ParsedDictionaryRow>();
  let duplicateNormalized = 0;
  for (const row of rows) {
    if (!row.normalizedHeadword) continue;
    const existing = byNorm.get(row.normalizedHeadword);
    if (!existing) {
      byNorm.set(row.normalizedHeadword, row);
      continue;
    }
    duplicateNormalized += 1;
    existing.senses.push(...row.senses);
    if (!existing.pronunciation && row.pronunciation) {
      existing.pronunciation = row.pronunciation;
    }
  }

  return {
    rows: [...byNorm.values()],
    notes,
    duplicateNormalized,
  };
}
