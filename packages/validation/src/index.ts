import { z } from "zod";

export const passwordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be at most 128 characters")
  .regex(/[A-Za-z]/, "Password must include a letter")
  .regex(/[0-9]/, "Password must include a number");

export const registerSchema = z.object({
  name: z.string().trim().min(2, "Name is required").max(100),
  email: z.string().trim().email("Valid email is required").max(255),
  password: passwordSchema,
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

export const createChildSchema = z.object({
  displayName: z.string().trim().min(1).max(50),
  birthYear: z.coerce
    .number()
    .int()
    .min(new Date().getFullYear() - 12)
    .max(new Date().getFullYear() - 3),
  level: z.enum(["FOUNDATION", "ELEMENTARY", "ADVANCED"]).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateChildInput = z.infer<typeof createChildSchema>;
