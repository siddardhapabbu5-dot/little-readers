import { createHash } from "node:crypto";
import { AppError } from "../lib/errors.js";

export const MAX_VOCAB_UPLOAD_BYTES = 5 * 1024 * 1024;

const ALLOWED_EXT = new Set([
  ".xlsx",
  ".xls",
  ".docx",
  ".doc",
  ".pdf",
  ".json",
  ".csv",
  ".tsv",
  ".txt",
]);

export function normalizeExt(filename: string): string {
  const idx = filename.lastIndexOf(".");
  if (idx < 0) return "";
  return filename.slice(idx).toLowerCase();
}

export function assertAllowedExtension(filename: string) {
  const ext = normalizeExt(filename);
  if (!ALLOWED_EXT.has(ext)) {
    throw new AppError(
      "Unsupported file type. Allowed: .xlsx, .xls, .docx, .doc, .pdf, .json, .csv, .tsv, .txt",
      400
    );
  }
  return ext; // includes leading "."
}

export function detectFileKind(buffer: Buffer, ext: string): string {
  const normalized = ext.startsWith(".") ? ext : `.${ext}`;
  if (buffer.length < 1) {
    throw new AppError("File is empty or corrupted", 400);
  }

  if ([".json", ".csv", ".tsv", ".txt"].includes(normalized)) {
    // Text formats — no binary magic; reject if mostly NUL
    if (buffer.includes(0)) {
      throw new AppError(`File content does not look like text (${normalized})`, 400);
    }
    return normalized.slice(1);
  }

  if (buffer.length < 4) {
    throw new AppError("File is empty or corrupted", 400);
  }

  const isPdf =
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46; // %PDF
  const isOle =
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0;
  const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b; // PK

  if (normalized === ".pdf") {
    if (!isPdf) throw new AppError("File content is not a valid PDF", 400);
    return "pdf";
  }
  if (normalized === ".xls" || normalized === ".doc") {
    if (!isOle && !isZip) {
      throw new AppError(`File content does not match ${normalized}`, 400);
    }
    return normalized === ".xls" ? "xls" : "doc";
  }
  if (normalized === ".xlsx" || normalized === ".docx") {
    if (!isZip) {
      throw new AppError(`File content does not match ${normalized}`, 400);
    }
    const asText = buffer.toString("utf8", 0, Math.min(buffer.length, 4000));
    if (normalized === ".docx" && asText.includes("xl/") && !asText.includes("word/")) {
      throw new AppError("File appears to be Excel, not Word (.docx)", 400);
    }
    return normalized === ".xlsx" ? "xlsx" : "docx";
  }
  throw new AppError("Unsupported file type", 400);
}

export function hashFile(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export function sanitizeText(value: unknown, max = 200): string {
  return String(value ?? "")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/**
 * Child-facing word gate: returns a reason when the raw text is not a real word.
 * Checks the raw input, so junk is rejected instead of silently "cleaned" into a word.
 */
export function wordQualityIssue(value: unknown): string | null {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "Word is empty";
  if (/\d/.test(raw)) return "Word contains numbers";
  if (/_/.test(raw)) return "Word contains underscores";
  if (!/^[A-Za-z]+(?:[ '\-][A-Za-z]+)*$/.test(raw)) {
    return "Word may contain only letters, single spaces, hyphens or apostrophes";
  }
  const letters = raw.replace(/[^A-Za-z]/g, "");
  if (letters.length < 2 && !/^(a|i)$/i.test(raw)) return "Word is too short";
  if (raw.length > 30) return "Word is too long (max 30 characters)";
  if (raw.split(" ").length > 3) return "Word has too many parts (max 3)";
  if (/([A-Za-z])\1{3,}/.test(raw)) return "Word looks like a typing mistake";
  if (!/[aeiouy]/i.test(letters) && letters.length > 3) return "Word has no vowels";
  return null;
}

export function meaningQualityIssue(value: unknown): string | null {
  const raw = String(value ?? "").replace(/\s+/g, " ").trim();
  if (!raw) return "Meaning is empty";
  if ((raw.match(/[A-Za-z]/g) ?? []).length < 3) return "Meaning is too short";
  if (/\d{6,}/.test(raw) || /_\d/.test(raw)) return "Meaning looks like test data";
  return null;
}

export function assertWordQuality(text: unknown, meaning?: unknown) {
  const issue =
    wordQualityIssue(text) ?? (meaning === undefined ? null : meaningQualityIssue(meaning));
  if (issue) throw new AppError(issue, 400, { code: "WORD_QUALITY" });
}

export function sanitizeWord(value: unknown): string {
  return sanitizeText(value, 60)
    .toLowerCase()
    .replace(/[^a-z0-9\s\-']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
