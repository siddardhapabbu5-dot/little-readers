import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  adminForgotPasswordSchema,
  adminResetPasswordSchema,
} from "@little-readers/validation";
import { env } from "../config/env.js";
import { validateBody } from "../middleware/validate.js";
import {
  requestAdminPasswordReset,
  resetAdminPasswordWithToken,
} from "./admin-auth.service.js";

export const adminAuthRouter = Router();

const adminForgotRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === "production" ? 10 : 100,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = String((req.body as { email?: string })?.email ?? "")
      .toLowerCase()
      .trim();
    return `admin-forgot:${req.ip}:${email}`;
  },
  message: {
    error: "Too many password reset requests. Please try again later.",
  },
  skip: () => process.env.VITEST === "true" || process.env.NODE_ENV === "test",
});

adminAuthRouter.post(
  "/forgot-password",
  adminForgotRateLimit,
  validateBody(adminForgotPasswordSchema),
  async (req, res, next) => {
    try {
      const data = await requestAdminPasswordReset(req.body);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

adminAuthRouter.post(
  "/reset-password",
  adminForgotRateLimit,
  validateBody(adminResetPasswordSchema),
  async (req, res, next) => {
    try {
      const data = await resetAdminPasswordWithToken(req.body);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);
