import { Router } from "express";
import { z } from "zod";
import {
  requireAuth,
  requireRoles,
  type AuthenticatedRequest,
} from "../middleware/auth.js";
import { validateBody } from "../middleware/validate.js";
import {
  createPrivacyDataRequest,
  getAdminPrivacyWorkspace,
  getPublicPrivacyPolicy,
  listPrivacyDataRequests,
  publishDraftPrivacyPolicy,
  updateDraftPrivacyPolicy,
  updatePrivacyDataRequestStatus,
} from "./privacy.service.js";

export const privacyPublicRouter = Router();
export const privacyAdminRouter = Router();

privacyPublicRouter.get("/policy", async (_req, res, next) => {
  try {
    res.json({ data: await getPublicPrivacyPolicy() });
  } catch (e) {
    next(e);
  }
});

const requestBody = z.object({
  requesterEmail: z.string().email().max(255),
  requesterName: z.string().trim().max(120).optional(),
  requestType: z
    .enum(["ACCOUNT_DELETION", "DATA_ACCESS", "OTHER"])
    .optional(),
  message: z.string().trim().min(10).max(4000),
});

privacyPublicRouter.post(
  "/requests",
  validateBody(requestBody),
  async (req, res, next) => {
    try {
      const data = await createPrivacyDataRequest({ ...req.body });
      res.status(201).json({
        data: {
          id: data.id,
          status: data.status,
          createdAt: data.createdAt,
          message:
            "Request received. An administrator will review it. No accounts or learning history are deleted automatically.",
        },
      });
    } catch (e) {
      next(e);
    }
  }
);

/** Authenticated parent shortcut — uses account email when omitted. */
privacyPublicRouter.post(
  "/requests/me",
  requireAuth,
  requireRoles("PARENT", "ADMIN", "SUPER_ADMIN"),
  validateBody(
    z.object({
      requesterName: z.string().trim().max(120).optional(),
      requestType: z
        .enum(["ACCOUNT_DELETION", "DATA_ACCESS", "OTHER"])
        .optional(),
      message: z.string().trim().min(10).max(4000),
    })
  ),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await createPrivacyDataRequest({
        userId: req.user!.id,
        requesterEmail: req.user!.email,
        requesterName: req.body.requesterName ?? req.user!.name,
        requestType: req.body.requestType,
        message: req.body.message,
      });
      res.status(201).json({
        data: {
          id: data.id,
          status: data.status,
          createdAt: data.createdAt,
          message:
            "Request received. An administrator will review it. No accounts or learning history are deleted automatically.",
        },
      });
    } catch (e) {
      next(e);
    }
  }
);

privacyAdminRouter.use(requireAuth, requireRoles("ADMIN", "SUPER_ADMIN"));

privacyAdminRouter.get("/policy", async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = await getAdminPrivacyWorkspace(req.user!.id);
    res.json({ data });
  } catch (e) {
    next(e);
  }
});

const patchSchema = z.object({
  version: z.string().trim().min(1).max(40).optional(),
  title: z.string().max(200).optional(),
  content: z.string().max(100_000).optional(),
  effectiveDate: z.string().datetime().nullable().optional().or(z.string().nullable().optional()),
  publicUrl: z.string().max(500).nullable().optional(),
  legalBusinessName: z.string().max(200).nullable().optional(),
  businessAddress: z.string().max(2000).nullable().optional(),
  country: z.string().max(120).nullable().optional(),
  supportEmail: z
    .union([z.string().email(), z.literal(""), z.null()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : v)),
  supportPhone: z.string().max(40).nullable().optional(),
  dataRetentionInfo: z.string().max(20_000).nullable().optional(),
  deletionRequestContact: z.string().max(255).nullable().optional(),
  parentalConsentExplanation: z.string().max(20_000).nullable().optional(),
  childDataDisclosure: z.string().max(20_000).nullable().optional(),
  learningDataDisclosure: z.string().max(20_000).nullable().optional(),
  deviceDataDisclosure: z.string().max(20_000).nullable().optional(),
  thirdPartyDisclosure: z.string().max(20_000).nullable().optional(),
});

privacyAdminRouter.put(
  "/policy",
  validateBody(patchSchema),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await updateDraftPrivacyPolicy(req.user!.id, req.body);
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

privacyAdminRouter.post(
  "/policy/publish",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await publishDraftPrivacyPolicy(req.user!.id);
      res.json({
        data: {
          id: data.id,
          version: data.version,
          status: data.status,
          publishedAt: data.publishedAt,
          message: "Privacy policy published. Previous published version archived.",
        },
      });
    } catch (e) {
      next(e);
    }
  }
);

privacyAdminRouter.get("/requests", async (req, res, next) => {
  try {
    const status =
      typeof req.query.status === "string"
        ? (req.query.status as
            | "SUBMITTED"
            | "UNDER_REVIEW"
            | "RESOLVED"
            | "CLOSED")
        : undefined;
    const data = await listPrivacyDataRequests(
      status ? { status } : undefined
    );
    res.json({ data });
  } catch (e) {
    next(e);
  }
});

privacyAdminRouter.patch(
  "/requests/:id",
  validateBody(
    z.object({
      status: z.enum(["SUBMITTED", "UNDER_REVIEW", "RESOLVED", "CLOSED"]),
      adminNotes: z.string().max(4000).nullable().optional(),
    })
  ),
  async (req, res, next) => {
    try {
      const data = await updatePrivacyDataRequestStatus(
        String(req.params.id),
        req.body
      );
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);
