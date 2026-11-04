import { Router } from "express";
import {
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resetPasswordSchema,
} from "@little-readers/validation";
import {
  getCurrentUser,
  loginUser,
  registerParent,
  requestPasswordReset,
  resetPasswordWithToken,
} from "./auth.service.js";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";

export const authRouter = Router();

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
