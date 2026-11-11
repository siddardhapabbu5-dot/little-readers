/** Learn Wise product grades as admin content grades (GRADE_n ↔ LEVEL_n). School grades G1–G12 are not content grades. */
export const ADMIN_PRODUCT_GRADES = [
  { code: "GRADE_1", levelCode: "LEVEL_1", number: 1, ages: "1–3" },
  { code: "GRADE_2", levelCode: "LEVEL_2", number: 2, ages: "4–6" },
  { code: "GRADE_3", levelCode: "LEVEL_3", number: 3, ages: "7–9" },
  { code: "GRADE_4", levelCode: "LEVEL_4", number: 4, ages: "10–12" },
] as const;

export type AdminGradeCode = (typeof ADMIN_PRODUCT_GRADES)[number]["code"];

export function isAdminProductGrade(code: string | null | undefined): code is AdminGradeCode {
  return ADMIN_PRODUCT_GRADES.some((g) => g.code === code);
}

export function adminGradeLabel(code: string) {
  const g = ADMIN_PRODUCT_GRADES.find((x) => x.code === code);
  return g ? `Grade ${g.number} · Ages ${g.ages}` : code;
}

export function adminGradeForLevel(levelCode: string | null | undefined) {
  return ADMIN_PRODUCT_GRADES.find((g) => g.levelCode === levelCode)?.code ?? null;
}

let selected: AdminGradeCode = "GRADE_1";
const listeners = new Set<(code: AdminGradeCode) => void>();

/** The grade the admin is working on, shared by structure, words, lessons and plans. */
export function getAdminGrade(): AdminGradeCode {
  return selected;
}

export function setAdminGrade(code: string) {
  if (!isAdminProductGrade(code) || code === selected) return;
  selected = code;
  for (const fn of listeners) fn(code);
}

export function onAdminGradeChange(fn: (code: AdminGradeCode) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
