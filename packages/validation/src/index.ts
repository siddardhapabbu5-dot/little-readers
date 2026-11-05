import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[A-Za-z]/, "Password must include a letter")
  .regex(/[0-9]/, "Password must include a number");

/** Stronger Admin recovery password (Phase account recovery). */
export const adminPasswordSchema = z
  .string()
  .min(12, "Password must be at least 12 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[A-Z]/, "Password must include an uppercase letter")
  .regex(/[a-z]/, "Password must include a lowercase letter")
  .regex(/[0-9]/, "Password must include a number")
  .regex(
    /[^A-Za-z0-9]/,
    "Password must include a special character"
  );

export const adminForgotPasswordSchema = z.object({
  email: z.string().trim().email("Valid email is required"),
  client: z.enum(["web", "mobile"]).optional(),
});

export const adminResetPasswordSchema = z
  .object({
    token: z.string().trim().min(20, "Reset token is required"),
    password: adminPasswordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(100),
  email: z.string().trim().email("Valid email is required").max(255),
  password: passwordSchema,
  /** Optional 10-digit or E.164 mobile for Parent OTP login (+91 default on server). */
  mobile: z.string().trim().min(10).max(20).optional(),
  countryCode: z.string().trim().min(1).max(6).optional(),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: "You must accept the terms of service" }),
  }),
  acceptPrivacy: z.literal(true, {
    errorMap: () => ({ message: "You must accept the privacy policy" }),
  }),
  parentalConsent: z.literal(true, {
    errorMap: () => ({
      message: "Parental consent confirmation is required",
    }),
  }),
});

export const loginSchema = z.object({
  email: z.string().trim().email("Valid email is required"),
  password: z.string().min(1, "Password is required"),
});

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email("Valid email is required"),
  /** Optional client hint: "web" | "mobile" — chooses reset link base URL. */
  client: z.enum(["web", "mobile"]).optional(),
});

export const resetPasswordSchema = z
  .object({
    token: z.string().trim().min(20, "Reset token is required"),
    password: passwordSchema,
    confirmPassword: z.string().min(1, "Confirm your password"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/** Birthday as DD/MM/YYYY (e.g. 15/03/2021). */
export const birthDateSchema = z
  .string()
  .trim()
  .regex(/^\d{2}\/\d{2}\/\d{4}$/, "Birthday must be DD/MM/YYYY");

export function parseBirthDateDdMmYyyy(value: string): {
  day: number;
  month: number;
  year: number;
  normalized: string;
} {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) {
    throw new Error("Birthday must be DD/MM/YYYY");
  }
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const dt = new Date(year, month - 1, day);
  if (
    dt.getFullYear() !== year ||
    dt.getMonth() !== month - 1 ||
    dt.getDate() !== day
  ) {
    throw new Error("Birthday is not a valid calendar date");
  }
  const minYear = new Date().getFullYear() - 12;
  const maxYear = new Date().getFullYear() - 1;
  if (year < minYear || year > maxYear) {
    throw new Error(`Birth year must be between ${minYear} and ${maxYear}`);
  }
  return {
    day,
    month,
    year,
    normalized: `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`,
  };
}

export const createChildSchema = z
  .object({
    displayName: z.string().trim().min(1).max(50),
    /** Preferred: full birthday DD/MM/YYYY */
    birthDate: birthDateSchema.optional(),
    /** Legacy: year only — still accepted if birthDate omitted */
    birthYear: z.coerce
      .number()
      .int()
      .min(new Date().getFullYear() - 12)
      .max(new Date().getFullYear() - 1)
      .optional(),
    level: z
      .enum(["LEVEL_1", "LEVEL_2", "LEVEL_3", "LEVEL_4", "FOUNDATION", "ELEMENTARY", "ADVANCED"])
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.birthDate && data.birthYear == null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Birthday is required (DD/MM/YYYY)",
        path: ["birthDate"],
      });
      return;
    }
    if (data.birthDate) {
      try {
        parseBirthDateDdMmYyyy(data.birthDate);
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : "Invalid birthday",
          path: ["birthDate"],
        });
      }
    }
  });

export const updateChildSchema = z
  .object({
    displayName: z.string().trim().min(1).max(50).optional(),
    birthDate: birthDateSchema.optional(),
    birthYear: z.coerce
      .number()
      .int()
      .min(new Date().getFullYear() - 12)
      .max(new Date().getFullYear() - 1)
      .optional(),
    level: z
      .enum(["LEVEL_1", "LEVEL_2", "LEVEL_3", "LEVEL_4", "FOUNDATION", "ELEMENTARY", "ADVANCED"])
      .optional(),
  })
  .refine(
    (data) =>
      data.displayName !== undefined ||
      data.birthDate !== undefined ||
      data.birthYear !== undefined ||
      data.level !== undefined,
    {
      message: "Provide at least one field to update",
    }
  )
  .superRefine((data, ctx) => {
    if (data.birthDate) {
      try {
        parseBirthDateDdMmYyyy(data.birthDate);
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: err instanceof Error ? err.message : "Invalid birthday",
          path: ["birthDate"],
        });
      }
    }
  });

export const startLearningSessionSchema = z
  .object({
    childId: z.string().min(1),
    categoryId: z.string().min(1).optional(),
    lessonId: z.string().min(1).optional(),
    questionCount: z.coerce.number().int().min(5).max(20).optional(),
    resume: z.boolean().optional(),
  })
  .superRefine((val, ctx) => {
    if (!val.categoryId && !val.lessonId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "categoryId or lessonId is required",
        path: ["categoryId"],
      });
    }
  });

export const submitQuestionAttemptSchema = z.object({
  wordId: z.string().min(1),
  round: z.enum(["LISTEN", "SPELL", "LETTER"]),
  isCorrect: z.boolean(),
  answerGiven: z.string().max(100).optional(),
  usedClue: z.boolean().optional(),
  pointsAwarded: z.coerce.number().int().min(0).max(100).optional(),
});

export const completeLearningSessionSchema = z.object({
  durationSec: z.coerce.number().int().min(0).max(86_400).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type AdminForgotPasswordInput = z.infer<typeof adminForgotPasswordSchema>;
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;
export type CreateChildInput = z.infer<typeof createChildSchema>;
export type UpdateChildInput = z.infer<typeof updateChildSchema>;
export type StartLearningSessionInput = z.infer<typeof startLearningSessionSchema>;
export type SubmitQuestionAttemptInput = z.infer<typeof submitQuestionAttemptSchema>;
export type CompleteLearningSessionInput = z.infer<typeof completeLearningSessionSchema>;
