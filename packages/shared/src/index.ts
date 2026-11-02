import type { AgeGroupCode, LearningLevelCode } from "@little-readers/types";

export const APP_NAME = "Little Readers";
export const APP_TAGLINE = "Kids Learning Academy";

export const AGE_GROUPS: Record<
  AgeGroupCode,
  { label: string; ageMin: number; ageMax: number }
> = {
  FOUNDATION: { label: "Foundation", ageMin: 3, ageMax: 5 },
  ELEMENTARY: { label: "Elementary", ageMin: 6, ageMax: 8 },
  ADVANCED: { label: "Advanced", ageMin: 9, ageMax: 12 },
};

export function inferLevelFromBirthYear(
  birthYear: number,
  referenceYear = new Date().getFullYear()
): LearningLevelCode {
  const age = referenceYear - birthYear;
  if (age <= 5) return "FOUNDATION";
  if (age <= 8) return "ELEMENTARY";
  return "ADVANCED";
}

export function publicUserFields<T extends { passwordHash?: string }>(
  user: T
): Omit<T, "passwordHash"> {
  const { passwordHash: _removed, ...rest } = user;
  return rest;
}
