import * as XLSX from "xlsx";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { PDFParse } from "pdf-parse";
import { randomUUID } from "node:crypto";
import {
  sanitizeText,
  sanitizeWord,
} from "./file-security.js";
import type { ExtractedVocabRow, ParseResult } from "./types.js";

type RawRow = {
  word?: string;
  meaning?: string;
  pronunciation?: string;
  category?: string;
  image?: string;
  audio?: string;
};

const HEADER_ALIASES: Record<string, keyof RawRow> = {
  word: "word",
  vocabulary: "word",
  term: "word",
  "simple meaning": "meaning",
  meaning: "meaning",
  definition: "meaning",
  gloss: "meaning",
  pronunciation: "pronunciation",
  phonetic: "pronunciation",
  sound: "pronunciation",
  category: "category",
  "category name": "category",
  image: "image",
  imageurl: "image",
  "image url": "image",
  audio: "audio",
  audiourl: "audio",
  "audio url": "audio",
};

function normalizeHeader(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function mapHeaderRow(cells: string[]): (keyof RawRow | null)[] {
  return cells.map((cell) => HEADER_ALIASES[normalizeHeader(cell)] ?? null);
}

function rowsFromMatrix(matrix: string[][], notes: string[]): RawRow[] {
  if (matrix.length === 0) return [];

  const first = matrix[0].map((c) => String(c ?? ""));
  const mapped = mapHeaderRow(first);
  const hasHeader = mapped.filter(Boolean).length >= 1 && mapped.includes("word");

  const out: RawRow[] = [];
  if (hasHeader) {
    notes.push("Detected header row with vocabulary columns.");
    for (const line of matrix.slice(1)) {
      const row: RawRow = {};
      mapped.forEach((key, idx) => {
        if (!key) return;
        row[key] = String(line[idx] ?? "");
      });
      if (!row.word && line[0]) row.word = String(line[0]);
      if (!row.meaning && line[1]) row.meaning = String(line[1]);
      out.push(row);
    }
    return out;
  }

  notes.push(
    "No standard header detected. Using column 1 = word, column 2 = meaning when present."
  );
  for (const line of matrix) {
    if (!line.some((c) => String(c ?? "").trim())) continue;
    out.push({
      word: String(line[0] ?? ""),
      meaning: String(line[1] ?? ""),
      pronunciation: String(line[2] ?? ""),
      category: String(line[3] ?? ""),
      image: String(line[4] ?? ""),
      audio: String(line[5] ?? ""),
    });
  }
  return out;
}

function parseLineItems(text: string): RawRow[] {
  const rows: RawRow[] = [];
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  for (const line of lines) {
    // "word - meaning" | "word: meaning" | "word — meaning" | "1. word - meaning"
    const cleaned = line.replace(/^\d+[.)]\s*/, "");
    const match = cleaned.match(
      /^([A-Za-z][A-Za-z0-9'\- ]{0,40})\s*[-–—:]\s*(.+)$/
    );
    if (match) {
      rows.push({ word: match[1], meaning: match[2] });
      continue;
    }
    // bullet list single words
    const bullet = cleaned.replace(/^[-*•]\s*/, "");
    if (/^[A-Za-z][A-Za-z0-9'\-]{0,40}$/.test(bullet)) {
      rows.push({ word: bullet, meaning: "" });
    }
  }
  return rows;
}

function toExtracted(rawRows: RawRow[]): ExtractedVocabRow[] {
  return rawRows.map((raw, index) => {
    const word = sanitizeWord(raw.word);
    const simpleMeaning = sanitizeText(raw.meaning, 200);
    const pronunciation = sanitizeText(raw.pronunciation || word, 80);
    const issues: string[] = [];
    if (!word) issues.push("Empty word");
    if (word && word.length < 2) issues.push("Word too short");
    if (!simpleMeaning) issues.push("Missing simple meaning");

    return {
      rowId: randomUUID(),
      serial: index + 1,
      word,
      simpleMeaning,
      pronunciation,
      categoryHint: sanitizeText(raw.category, 80),
      imageUrl: sanitizeText(raw.image, 300),
      audioUrl: sanitizeText(raw.audio, 300),
      status: issues.length ? "invalid" : "valid",
      issues,
      selected: issues.length === 0,
    };
  });
}

export async function parseExcelBuffer(buffer: Buffer): Promise<ParseResult> {
  const notes: string[] = [];
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    return { rows: [], parseNotes: ["Excel file has no sheets."], detectedColumns: [] };
  }
  notes.push(`Reading sheet “${sheetName}”.`);
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as string[][];
  const raw = rowsFromMatrix(matrix, notes);
  const headers = matrix[0]?.map((c) => String(c)) ?? [];
  return {
    rows: toExtracted(raw),
    parseNotes: notes,
    detectedColumns: headers,
  };
}

export async function parseDocxBuffer(buffer: Buffer): Promise<ParseResult> {
  const notes: string[] = [];
  const result = await mammoth.extractRawText({ buffer });
  if (result.messages?.length) {
    notes.push(
      ...result.messages.slice(0, 5).map((m) => `Word note: ${m.message}`)
    );
  }
  notes.push("Extracted text from Word document (headings, paragraphs, lists).");
  const raw = parseLineItems(result.value || "");
  // Also try table-like tab/csv lines
  if (raw.length === 0) {
    notes.push("Falling back to line/table parsing.");
  }
  return {
    rows: toExtracted(raw),
    parseNotes: notes,
    detectedColumns: ["word", "simpleMeaning"],
  };
}

export async function parseDocBuffer(buffer: Buffer): Promise<ParseResult> {
  const notes: string[] = [];
  const Extractor = (WordExtractor as unknown as {
    default?: new () => { extract: (buf: Buffer) => Promise<{ getBody: () => string; getHeaders: (o: { includeFooters: boolean }) => string }> };
  }).default ?? WordExtractor;
  const extractor = new Extractor();
  const doc = await extractor.extract(buffer);
  const body = `${doc.getBody() ?? ""}\n${doc.getHeaders({ includeFooters: true }) ?? ""}`;
  notes.push("Extracted text from legacy .doc Word document.");
  const raw = parseLineItems(body);
  return {
    rows: toExtracted(raw),
    parseNotes: notes,
    detectedColumns: ["word", "simpleMeaning"],
  };
}

export async function parsePdfBuffer(buffer: Buffer): Promise<ParseResult> {
  const notes: string[] = [];
  const parser = new PDFParse({ data: buffer });
  try {
    const textResult = await parser.getText();
    const text = (textResult.text || "").trim();
    const info = await parser.getInfo().catch(() => null);
    const pages = info?.total ?? textResult.pages?.length ?? 0;
    notes.push(`PDF reports ${pages || 0} page(s).`);

    if (text.length < 20) {
      notes.push(
        "Little or no extractable text found. This PDF may be scanned/image-based. OCR is not enabled in this environment — please upload a text PDF, Excel, or Word file, or type meanings manually after mapping."
      );
      return {
        rows: [],
        parseNotes: notes,
        detectedColumns: [],
      };
    }

    notes.push("Extracted readable text from PDF.");
    let raw = parseLineItems(text);

    try {
      const tableResult = await parser.getTable();
      const tableRows: { word?: string; meaning?: string }[] = [];
      for (const page of tableResult.pages ?? []) {
        for (const table of page.tables ?? []) {
          for (const line of table) {
            const cells = line.map((c) => String(c ?? "").trim());
            if (cells.filter(Boolean).length >= 1) {
              tableRows.push({ word: cells[0], meaning: cells[1] ?? "" });
            }
          }
        }
      }
      if (tableRows.length > 0) {
        notes.push(`Also extracted ${tableRows.length} table row(s) from PDF.`);
        raw = [...raw, ...tableRows];
      }
    } catch {
      notes.push("PDF table extraction unavailable for this file; used text lines only.");
    }

    return {
      rows: toExtracted(raw),
      parseNotes: notes,
      detectedColumns: ["word", "simpleMeaning"],
    };
  } finally {
    await parser.destroy?.();
  }
}

export async function parseVocabularyFile(
  buffer: Buffer,
  kind: string
): Promise<ParseResult> {
  switch (kind) {
    case "xlsx":
    case "xls":
      return parseExcelBuffer(buffer);
    case "docx":
      return parseDocxBuffer(buffer);
    case "doc":
      return parseDocBuffer(buffer);
    case "pdf":
      return parsePdfBuffer(buffer);
    default:
      return {
        rows: [],
        parseNotes: [`Unsupported parser kind: ${kind}`],
        detectedColumns: [],
      };
  }
}

export function annotateDuplicates(
  rows: ExtractedVocabRow[],
  existingWords: Set<string>
): ExtractedVocabRow[] {
  const seen = new Set<string>();
  return rows.map((row) => {
    const issues = [...row.issues];
    let status: ExtractedVocabRow["status"] = row.status;
    if (status !== "invalid" && row.word) {
      if (seen.has(row.word) || existingWords.has(row.word)) {
        status = "duplicate";
        issues.push(
          existingWords.has(row.word)
            ? "Already exists in vocabulary database"
            : "Duplicate within uploaded file"
        );
      }
      seen.add(row.word);
    }
    return {
      ...row,
      status,
      issues,
      selected: status === "valid",
    };
  });
}
