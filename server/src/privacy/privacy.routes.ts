import { Router, type NextFunction, type Request, type Response } from "express";
import multer from "multer";
import { z } from "zod";
import { AppError } from "../lib/errors.js";
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
import {
  MAX_POLICY_PDF_BYTES,
  createPolicyDocumentLinkToken,
  deletePolicyDocumentFile,
  getPolicyDocumentFile,
  listPolicyDocuments,
  resolveDocument,
  updatePolicyDocumentDetails,
  uploadPolicyDocumentFile,
  verifyPolicyDocumentLinkToken,
} from "./policy-documents.service.js";

export const privacyPublicRouter = Router();
export const privacyAdminRouter = Router();

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_POLICY_PDF_BYTES, files: 1 },
});

function receivePdf(req: Request, res: Response, next: NextFunction) {
  pdfUpload.single("file")(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      return next(
        new AppError(
          err.code === "LIMIT_FILE_SIZE" ? "PDF is larger than 10 MB" : "Upload failed",
          err.code === "LIMIT_FILE_SIZE" ? 413 : 400
        )
      );
    }
    next(err);
  });
}

async function sendPolicyPdf(res: Response, slug: string, download: boolean) {
  const file = await getPolicyDocumentFile(slug);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", String(file.data.length));
  res.setHeader(
    "Content-Disposition",
    `${download ? "attachment" : "inline"}; filename="${file.downloadName}"`
  );
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(file.data);
}

/** Opened by the phone's PDF viewer with a 5-minute signed token from the admin link endpoint. */
privacyPublicRouter.get("/documents/file", async (req, res, next) => {
  try {
    const token = typeof req.query.token === "string" ? req.query.token : "";
    const { slug, download } = verifyPolicyDocumentLinkToken(token);
    await sendPolicyPdf(res, slug, download);
  } catch (e) {
    next(e);
  }
});

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

privacyAdminRouter.get("/documents", async (_req, res, next) => {
  try {
    res.json({ data: await listPolicyDocuments() });
  } catch (e) {
    next(e);
  }
});

privacyAdminRouter.patch(
  "/documents/:slug",
  validateBody(
    z.object({
      title: z.string().trim().max(200).optional(),
      description: z.string().trim().max(1000).optional(),
      version: z.string().trim().max(40).optional(),
    })
  ),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await updatePolicyDocumentDetails(
        String(req.params.slug),
        req.user!.id,
        req.body
      );
      res.json({ data });
    } catch (e) {
      next(e);
    }
  }
);

privacyAdminRouter.post(
  "/documents/:slug/file",
  (req, _res, next) => {
    try {
      resolveDocument(String(req.params.slug));
      next();
    } catch (e) {
      next(e);
    }
  },
  receivePdf,
  async (req: AuthenticatedRequest, res, next) => {
    try {
      if (!req.file) throw new AppError("Choose a PDF file to upload", 400);
      const data = await uploadPolicyDocumentFile(String(req.params.slug), req.user!.id, req.file);
      res.status(201).json({ data });
    } catch (e) {
      next(e);
    }
  }
);

privacyAdminRouter.get("/documents/:slug/file", async (req, res, next) => {
  try {
    await sendPolicyPdf(res, String(req.params.slug), req.query.download === "1");
  } catch (e) {
    next(e);
  }
});

privacyAdminRouter.post("/documents/:slug/link", async (req, res, next) => {
  try {
    const slug = String(req.params.slug);
    const download = req.query.download === "1";
    await getPolicyDocumentFile(slug);
    const { token, expiresInSec } = createPolicyDocumentLinkToken(slug, download);
    res.json({
      data: {
        path: `/privacy/documents/file?token=${encodeURIComponent(token)}`,
        expiresInSec,
      },
    });
  } catch (e) {
    next(e);
  }
});

privacyAdminRouter.delete(
  "/documents/:slug/file",
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const data = await deletePolicyDocumentFile(String(req.params.slug), req.user!.id);
      res.json({ data });
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
