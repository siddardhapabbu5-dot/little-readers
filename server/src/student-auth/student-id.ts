import { randomBytes } from "node:crypto";
import { AppError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";

/** Kid-friendly IDs (e.g. SAM, RIYA, ARJUN) — 3–12 A–Z / 0–9 after normalize. */
const PREFERRED_ID_RE = /^[A-Z0-9]{3,12}$/;

/** Normalize Student ID for lookup (uppercase, trimmed). */
export function normalizeStudentLoginId(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, "");
}

/**
 * Validate Admin-chosen Student ID (3–12 A–Z / 0–9 after normalize).
 * Throws AppError 400 on invalid shape.
 */
export function validatePreferredStudentLoginId(raw: string): string {
  const id = normalizeStudentLoginId(raw);
  if (!PREFERRED_ID_RE.test(id)) {
    throw new AppError(
      "Student ID must be 3–12 letters or numbers (A–Z, 0–9).",
      400,
      { code: "STUDENT_ID_INVALID" }
    );
  }
  return id;
}

/**
 * Suggest alternative IDs when the preferred one is taken (e.g. ARJUN → ARJUN02).
 * Does not reserve IDs — uniqueness is re-checked at create/rename time.
 */
export async function suggestStudentLoginIdAlternatives(
  preferredRaw: string,
  take = 3
): Promise<string[]> {
  const base = normalizeStudentLoginId(preferredRaw).replace(/[^A-Z0-9]/g, "").slice(0, 10);
  if (base.length < 3) return [];
  const out: string[] = [];
  for (let n = 2; out.length < take && n <= 99; n++) {
    const suffix = String(n).padStart(2, "0");
    const candidate = `${base.slice(0, 12 - suffix.length)}${suffix}`;
    if (!PREFERRED_ID_RE.test(candidate)) continue;
    const exists = await prisma.childStudentCredential.findUnique({
      where: { studentLoginId: candidate },
      select: { id: true },
    });
    if (!exists) out.push(candidate);
  }
  return out;
}

async function assertStudentLoginIdAvailable(
  studentLoginId: string,
  excludeChildId?: string
) {
  const existing = await prisma.childStudentCredential.findUnique({
    where: { studentLoginId },
    select: { id: true, childId: true },
  });
  if (existing && existing.childId !== excludeChildId) {
    const suggestions = await suggestStudentLoginIdAlternatives(studentLoginId, 3);
    throw new AppError(
      suggestions.length
        ? `That Student ID is already in use. Try ${suggestions.join(", ")}.`
        : "That Student ID is already in use.",
      409,
      {
        code: "STUDENT_ID_TAKEN",
        suggestions,
      }
    );
  }
}

/**
 * Generate a unique human Student ID: LW + 8 Crockford-ish chars.
 * Retries on rare collisions.
 */
export async function generateUniqueStudentLoginId(): Promise<string> {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 12; attempt++) {
    const bytes = randomBytes(8);
    let id = "LW";
    for (let i = 0; i < 8; i++) {
      id += alphabet[bytes[i]! % alphabet.length];
    }
    const exists = await prisma.childStudentCredential.findUnique({
      where: { studentLoginId: id },
      select: { id: true },
    });
    if (!exists) return id;
  }
  throw new Error("Unable to allocate a unique Student ID");
}

/**
 * Use Admin preferred ID when provided; otherwise auto-generate LW…… .
 * Checks uniqueness for preferred IDs.
 */
export async function resolveStudentLoginId(
  preferred?: string | null
): Promise<string> {
  const raw = preferred?.trim();
  if (!raw) return generateUniqueStudentLoginId();
  const id = validatePreferredStudentLoginId(raw);
  await assertStudentLoginIdAvailable(id);
  return id;
}

/** Validate + uniqueness for renaming an existing Student ID (never auto-generates). */
export async function allocatePreferredStudentLoginId(
  raw: string,
  excludeChildId?: string
): Promise<string> {
  const id = validatePreferredStudentLoginId(raw);
  await assertStudentLoginIdAvailable(id, excludeChildId);
  return id;
}
