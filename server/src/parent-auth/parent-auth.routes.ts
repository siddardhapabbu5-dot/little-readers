import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { env } from "../config/env.js";
import {
  requireAuth,
  requireRoles,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import { sendParentOtp } from "./otp.service.js";
import {
  createParentSessionFromOtp,
  getParentSessionStatus,
  logoutParentSession,
  refreshParentSession,
} from "./session.service.js";

export const parentAuthRouter = Router();

/**
 * Parents recover via OTP to their *registered* mobile only.
 * Forgotten mobile → contact support (never self-change via OTP to a new number).
 */
parentAuthRouter.get("/support-contact", (_req, res) => {
  res.status(200).json({
    data: {
      email: env.SUPPORT_EMAIL,
      message:
        "If you forgot the mobile number registered on your parent account, contact Little Readers support. Your registered number cannot be changed using only an OTP sent to a new unverified phone.",
    },
  });
});


const otpRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: env.NODE_ENV === "production" ? 20 : 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => {
    const mobile = String((req.body as { mobile?: string })?.mobile ?? "");
    return `otp:${req.ip}:${mobile}`;
  },
  message: { error: "Too many OTP requests. Please try again later." },
  skip: () => process.env.VITEST === "true" || process.env.NODE_ENV === "test",
});

const sendOtpSchema = z.object({
  mobile: z.string().min(8).max(20),
  countryCode: z.string().min(1).max(6).optional(),
});

const verifyOtpSchema = z.object({
  mobile: z.string().min(8).max(20),
  countryCode: z.string().min(1).max(6).optional(),
  otp: z.string().min(4).max(8),
  deviceId: z.string().min(16).max(128),
  deviceName: z.string().max(80).optional(),
  platform: z.string().min(2).max(40).optional(),
  appVersion: z.string().max(40).optional(),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(500),
  deviceId: z.string().min(16).max(128),
});

const logoutSchema = z.object({
  deviceId: z.string().min(16).max(128).optional(),
});

parentAuthRouter.post(
  "/send-otp",
  otpRateLimit,
  validateBody(sendOtpSchema),
  async (req, res, next) => {
    try {
      const data = await sendParentOtp(req.body);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

parentAuthRouter.post(
  "/verify-otp",
  otpRateLimit,
  validateBody(verifyOtpSchema),
  async (req, res, next) => {
    try {
      const platform =
        req.body.platform ||
        String(req.get("x-client-platform") ?? "unknown");
      const data = await createParentSessionFromOtp({
        ...req.body,
        platform,
        appVersion:
          req.body.appVersion ||
          String(req.get("x-app-version") ?? "") ||
          undefined,
      });
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

parentAuthRouter.post(
  "/refresh",
  otpRateLimit,
  validateBody(refreshSchema),
  async (req, res, next) => {
    try {
      const data = await refreshParentSession(req.body);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

parentAuthRouter.post(
  "/logout",
  requireAuth,
  requireRoles("PARENT"),
  validateBody(logoutSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const sid = req.parentSessionId;
      const data = await logoutParentSession({
        parentId: req.user!.id,
        sessionId: sid,
        deviceId: req.body.deviceId,
      });
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

parentAuthRouter.get(
  "/session",
  requireAuth,
  requireRoles("PARENT"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      // Email-login parents have no sid — still a valid legacy session.
      if (!req.parentSessionId) {
        res.status(200).json({
          data: { mode: "email", status: "ACTIVE" },
        });
        return;
      }
      const data = await getParentSessionStatus(
        req.parentSessionId,
        req.user!.id
      );
      res.status(200).json({ data: { mode: "otp", ...data } });
    } catch (error) {
      next(error);
    }
  }
);
