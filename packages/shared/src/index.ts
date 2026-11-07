import type { AgeGroupCode, LearningLevelCode } from "@little-readers/types";

export const APP_NAME = "LEARN WISE";
export const APP_TAGLINE = "Kids Learning Academy";

export const AGE_GROUPS: Record<
  AgeGroupCode,
  { label: string; ageMin: number; ageMax: number }
> = {
  LEVEL_1: { label: "Grade 1", ageMin: 1, ageMax: 3 },
  LEVEL_2: { label: "Grade 2", ageMin: 4, ageMax: 6 },
  LEVEL_3: { label: "Grade 3", ageMin: 7, ageMax: 9 },
  LEVEL_4: { label: "Grade 4", ageMin: 10, ageMax: 12 },
  // Legacy placement codes (kept for older child rows)
  FOUNDATION: { label: "Foundation", ageMin: 3, ageMax: 5 },
  ELEMENTARY: { label: "Elementary", ageMin: 6, ageMax: 8 },
  ADVANCED: { label: "Advanced", ageMin: 9, ageMax: 12 },
};

/** Map birth year → four-grade learning level (LEVEL_1…LEVEL_4). */
export function inferLevelFromBirthYear(
  birthYear: number,
  referenceYear = new Date().getFullYear()
): LearningLevelCode {
  const age = referenceYear - birthYear;
  if (age <= 3) return "LEVEL_1";
  if (age <= 6) return "LEVEL_2";
  if (age <= 9) return "LEVEL_3";
  return "LEVEL_4";
}

export function publicUserFields<T extends { passwordHash?: string }>(
  user: T
): Omit<T, "passwordHash"> {
  const { passwordHash: _removed, ...rest } = user;
  return rest;
}
