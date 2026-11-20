import { Router } from "express";
import { z } from "zod";
import { passwordSchema } from "@little-readers/validation";
import { validateBody } from "../middleware/validate.js";
import { passwordAttemptRateLimit } from "../lib/password-rate-limit.js";
import { verifyEmailOtp } from "../auth/email-otp.service.js";
import {
  requireStudentAuth,
  type StudentAuthenticatedRequest,
} from "../middleware/student-auth.js";
import {
  requireAuth,
  requireRoles,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import {
  adminCreateChildForParent,
  adminCreateDirectStudent,
  changeStudentPassword,
  issueStudentCredential,
  loginStudent,
  renameStudentLoginId,
  resetStudentPassword,
  selfRegisterStudent,
  sendStudentSelfRegisterOtp,
} from "./student-auth.service.js";
import {
  adminCreateChildWithSharedEmailOtp,
  sendAdminSharedStudentCreateOtp,
  verifyAdminSharedStudentCreateOtp,
} from "./admin-shared-student-otp.service.js";
import { createChildSchema } from "@little-readers/validation";

export const studentAuthRouter = Router();

const studentLoginSchema = z.object({
  studentLoginId: z.string().trim().min(3).max(32),
  password: z.string().min(1, "Password is required"),
  installationId: z.string().trim().min(16).max(128),
  platform: z.string().trim().min(2).max(40),
  deviceName: z.string().trim().max(80).optional(),
  appVersion: z.string().trim().max(40).optional(),
});

const studentEmailOtpSendSchema = z.object({
  email: z.string().trim().email().max(255),
});

const studentEmailOtpVerifySchema = studentEmailOtpSendSchema.extend({
  otp: z.string().trim().min(4).max(12),
});

const selfRegisterSchema = z.object({
  emailVerificationToken: z.string().trim().min(20).max(200),
  displayName: z.string().trim().min(1).max(80),
  birthYear: z.coerce.number().int().min(1980).max(new Date().getFullYear()).optional(),
  birthDate: z.string().trim().optional(),
  levelId: z.string().trim().min(1).optional(),
  level: z
    .enum(["LEVEL_1", "LEVEL_2", "LEVEL_3", "LEVEL_4", "FOUNDATION", "ELEMENTARY", "ADVANCED"])
    .optional(),
  gradeId: z.string().trim().min(1).optional(),
  password: passwordSchema,
  installationId: z.string().trim().min(16).max(128),
  platform: z.string().trim().min(2).max(40),
  deviceName: z.string().trim().max(80).optional(),
  appVersion: z.string().trim().max(40).optional(),
  acceptTerms: z.literal(true),
  acceptPrivacy: z.literal(true),
  parentalConsent: z.literal(true),
});

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

const preferredStudentLoginIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(12)
  .regex(/^[A-Za-z0-9]+$/, "Student ID must be letters or numbers only")
  .optional()
  .nullable();

const adminCreateForParentSchema = createChildSchema.and(
  z.object({
    issueCredential: z.boolean().optional(),
    preferredStudentLoginId: preferredStudentLoginIdSchema,
  })
);

const renameStudentLoginIdSchema = z.object({
  studentLoginId: z
    .string()
    .trim()
    .min(3)
    .max(12)
    .regex(/^[A-Za-z0-9]+$/, "Student ID must be letters or numbers only"),
});

studentAuthRouter.post(
  "/email-otp/send",
  validateBody(studentEmailOtpSendSchema),
  async (req, res, next) => {
    try {
      const data = await sendStudentSelfRegisterOtp(req.body.email);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

studentAuthRouter.post(
  "/email-otp/verify",
  validateBody(studentEmailOtpVerifySchema),
  async (req, res, next) => {
    try {
      const data = await verifyEmailOtp({
        email: req.body.email,
        purpose: "STUDENT_SELF_REGISTER",
        otp: req.body.otp,
      });
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

studentAuthRouter.post(
  "/self-register",
  passwordAttemptRateLimit(),
  validateBody(selfRegisterSchema),
  async (req, res, next) => {
    try {
      const data = await selfRegisterStudent(req.body);
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

studentAuthRouter.post(
  "/login",
  passwordAttemptRateLimit(),
  validateBody(studentLoginSchema),
  async (req, res, next) => {
    try {
      const data = await loginStudent(req.body);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

studentAuthRouter.post(
  "/change-password",
  requireStudentAuth,
  validateBody(changePasswordSchema),
  async (req: StudentAuthenticatedRequest, res, next) => {
    try {
      await changeStudentPassword({
        childId: req.student!.childId,
        currentPassword: req.body.currentPassword,
        newPassword: req.body.newPassword,
      });
      res.status(200).json({ data: { ok: true, mustReLogin: true } });
    } catch (error) {
      next(error);
    }
  }
);

studentAuthRouter.get(
  "/me",
  requireStudentAuth,
  async (req: StudentAuthenticatedRequest, res, next) => {
    try {
      const child = await (
        await import("../lib/prisma.js")
      ).prisma.child.findUnique({
        where: { id: req.student!.childId },
        select: {
          id: true,
          displayName: true,
          birthYear: true,
          birthDate: true,
          levelId: true,
          gradeId: true,
          hasLearningSeat: true,
          level: { select: { id: true, code: true, label: true } },
          grade: { select: { id: true, code: true, label: true } },
        },
      });
      res.status(200).json({
        data: {
          principal: "CHILD",
          ...req.student,
          child: child
            ? {
                id: child.id,
                displayName: child.displayName,
                birthYear: child.birthYear,
                birthDate: child.birthDate,
                level: child.level?.code ?? "LEVEL_1",
                levelId: child.levelId,
                gradeId: child.gradeId,
                hasLearningSeat: child.hasLearningSeat,
                learnWiseGrade: child.level
                  ? {
                      levelId: child.level.id,
                      levelCode: child.level.code,
                      gradeLabel: child.grade?.label ?? child.level.label,
                    }
                  : null,
              }
            : null,
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

const adminDirectCreateSchema = createChildSchema
  .and(
    z.object({
      preferredStudentLoginId: preferredStudentLoginIdSchema,
    })
  )
  .superRefine((data, ctx) => {
    if (data.birthYear == null && !data.birthDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Birth year or birth date is required",
        path: ["birthYear"],
      });
    }
  });

/**
 * Admin Direct: create Child + Student ID under the internal system Sponsor Parent.
 * No parent picker / registration. Subscription stays unpaid.
 */
studentAuthRouter.post(
  "/admin/direct-children",
  requireAuth,
  requireRoles("ADMIN", "SUPER_ADMIN"),
  validateBody(adminDirectCreateSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await adminCreateDirectStudent({
        displayName: req.body.displayName,
        birthYear: req.body.birthYear,
        levelId: req.body.levelId,
        level: req.body.level,
        gradeId: req.body.gradeId,
        birthDate: req.body.birthDate,
        preferredStudentLoginId: req.body.preferredStudentLoginId,
        createdByUserId: req.user!.id,
      });
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

/** Admin: create Child under a sponsor parent + optional Student ID. */
studentAuthRouter.post(
  "/admin/parents/:parentId/children",
  requireAuth,
  requireRoles("ADMIN", "SUPER_ADMIN"),
  validateBody(adminCreateForParentSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await adminCreateChildForParent({
        parentId: String(req.params.parentId),
        displayName: req.body.displayName,
        birthYear: req.body.birthYear,
        levelId: req.body.levelId,
        level: req.body.level,
        gradeId: req.body.gradeId,
        birthDate: req.body.birthDate,
        issueCredential: req.body.issueCredential,
        preferredStudentLoginId: req.body.preferredStudentLoginId,
        createdByUserId: req.user!.id,
      });
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

const sharedOtpVerifySchema = z.object({
  otp: z.string().trim().min(4).max(12),
});

/** OTP-gated Grade 1 create — no Parent picker; system sponsor + skip seat. */
const sharedEmailCreateSchema = createChildSchema.and(
  z.object({
    verificationToken: z.string().trim().min(20).max(200),
    preferredStudentLoginId: preferredStudentLoginIdSchema,
  })
);

/**
 * Additive Option B: OTP to shared Admin mailbox (not student email).
 * Does not replace POST /admin/parents/:parentId/children.
 */
studentAuthRouter.post(
  "/admin/shared-email-otp/send",
  requireAuth,
  requireRoles("ADMIN", "SUPER_ADMIN"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await sendAdminSharedStudentCreateOtp(req.user!.id);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

studentAuthRouter.post(
  "/admin/shared-email-otp/verify",
  requireAuth,
  requireRoles("ADMIN", "SUPER_ADMIN"),
  validateBody(sharedOtpVerifySchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await verifyAdminSharedStudentCreateOtp({
        adminUserId: req.user!.id,
        otp: req.body.otp,
      });
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

studentAuthRouter.post(
  "/admin/shared-email-otp/children",
  requireAuth,
  requireRoles("ADMIN", "SUPER_ADMIN"),
  validateBody(sharedEmailCreateSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await adminCreateChildWithSharedEmailOtp({
        adminUserId: req.user!.id,
        verificationToken: req.body.verificationToken,
        displayName: req.body.displayName,
        birthYear: req.body.birthYear,
        levelId: req.body.levelId,
        level: req.body.level,
        gradeId: req.body.gradeId,
        birthDate: req.body.birthDate,
        preferredStudentLoginId: req.body.preferredStudentLoginId,
      });
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

studentAuthRouter.post(
  "/admin/suggest-student-login-id",
  requireAuth,
  requireRoles("ADMIN", "SUPER_ADMIN"),
  async (_req: AuthenticatedRequest, res, next) => {
    try {
      const { generateUniqueStudentLoginId } = await import("./student-id.js");
      const studentLoginId = await generateUniqueStudentLoginId();
      res.status(200).json({ data: { studentLoginId } });
    } catch (error) {
      next(error);
    }
  }
);

studentAuthRouter.get(
  "/admin/by-student-login-id/:studentLoginId",
  requireAuth,
  requireRoles("ADMIN", "SUPER_ADMIN"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { adminLookupStudentByLoginId } = await import("./student-auth.service.js");
      const data = await adminLookupStudentByLoginId(String(req.params.studentLoginId));
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

studentAuthRouter.patch(
  "/admin/children/:childId/student-login-id",
  requireAuth,
  requireRoles("ADMIN", "SUPER_ADMIN"),
  validateBody(renameStudentLoginIdSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await renameStudentLoginId({
        childId: String(req.params.childId),
        newStudentLoginId: req.body.studentLoginId,
        adminUserId: req.user!.id,
      });
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

studentAuthRouter.post(
  "/admin/children/:childId/credential",
  requireAuth,
  requireRoles("ADMIN", "SUPER_ADMIN", "PARENT"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const childId = String(req.params.childId);
      if (req.user!.role === "PARENT") {
        const owned = await (
          await import("../lib/prisma.js")
        ).prisma.child.findFirst({
          where: { id: childId, parentId: req.user!.id, isActive: true },
          select: { id: true },
        });
        if (!owned) {
          res.status(404).json({ error: "Child not found" });
          return;
        }
      }
      const preferred =
        typeof req.body?.preferredStudentLoginId === "string"
          ? req.body.preferredStudentLoginId
          : undefined;
      const data = await issueStudentCredential({
        childId,
        createdByUserId: req.user!.id,
        mustChangePassword: true,
        preferredStudentLoginId: preferred,
      });
      res.status(201).json({ data });
    } catch (error) {
      next(error);
    }
  }
);

studentAuthRouter.post(
  "/admin/children/:childId/credential/reset",
  requireAuth,
  requireRoles("ADMIN", "SUPER_ADMIN", "PARENT"),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const childId = String(req.params.childId);
      if (req.user!.role === "PARENT") {
        const owned = await (
          await import("../lib/prisma.js")
        ).prisma.child.findFirst({
          where: { id: childId, parentId: req.user!.id, isActive: true },
          select: { id: true },
        });
        if (!owned) {
          res.status(404).json({ error: "Child not found" });
          return;
        }
      }
      const data = await resetStudentPassword({ childId, mustChangePassword: true });
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }
);
