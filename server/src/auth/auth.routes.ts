import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  emailOtpSendSchema,
  emailOtpVerifySchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
  resetPasswordWithOtpSchema,
} from "@little-readers/validation";
import {
  getCurrentUser,
  loginUser,
  registerParent,
  requestPasswordReset,
  resetPasswordWithEmailOtp,
  resetPasswordWithToken,
} from "./auth.service.js";
import { sendEmailOtp, verifyEmailOtp } from "./email-otp.service.js";
import { env } from "../config/env.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

export const authRouter = Router();

const emailOtpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === "production" ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const email = String((req.body as { email?: string })?.email ?? "").toLowerCase();
    return `email-otp:${req.ip}:${email}`;
  },
  message: { error: "Too many verification requests. Please try again later." },
  skip: () => process.env.VITEST === "true" || process.env.NODE_ENV === "test",
});

authRouter.post(
  "/email-otp/send",
  emailOtpRateLimit,
  validateBody(emailOtpSendSchema),
  async (req, res, next) => {
    try {
      res.status(200).json({ data: await sendEmailOtp(req.body) });
    } catch (error) {
      next(error);
    }
  }
);

authRouter.post(
  "/email-otp/verify",
  emailOtpRateLimit,
  validateBody(emailOtpVerifySchema),
  async (req, res, next) => {
    try {
      res.status(200).json({ data: await verifyEmailOtp(req.body) });
    } catch (error) {
      next(error);
    }
  }
);

authRouter.post(
  "/reset-password-otp",
  emailOtpRateLimit,
  validateBody(resetPasswordWithOtpSchema),
  async (req, res, next) => {
    try {
      res.status(200).json({ data: await resetPasswordWithEmailOtp(req.body) });
    } catch (error) {
      next(error);
    }
  }
);

authRouter.post("/register", validateBody(registerSchema), async (req, res, next) => {
  try {
    const result = await registerParent(req.body, {
      ipAddress: req.ip,
      userAgent: req.get("user-agent") ?? undefined,
    });
    res.status(201).json({ data: result });
  } catch (error) {
    next(error);
  }
});

authRouter.post("/login", validateBody(loginSchema), async (req, res, next) => {
  try {
    const result = await loginUser(req.body);
    res.status(200).json({ data: result });
  } catch (error) {
    next(error);
  }
});

authRouter.post(
  "/forgot-password",
  validateBody(forgotPasswordSchema),
  async (req, res, next) => {
    try {
      const result = await requestPasswordReset(req.body);
      // Always 200 with accepted flag — client must not show success unless accepted.
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

authRouter.post(
  "/reset-password",
  validateBody(resetPasswordSchema),
  async (req, res, next) => {
    try {
      const result = await resetPasswordWithToken(req.body);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }
);

authRouter.get("/me", requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await getCurrentUser(req.user!.id);
    res.status(200).json({ data: user });
  } catch (error) {
    next(error);
  }
});
